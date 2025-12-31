import { db, getOrCreateClientId } from './db';
import { getSupabaseBrowserClient, getCurrentUser } from './supabaseClient';
import { OutboxEvent, TimeSlot, Tag, DomainEntity, DailyLog } from './types';

const SYNC_BATCH_SIZE = 50;
const MAX_RETRY_COUNT = 5;
const PULL_DAYS_RANGE = 90; // Pull last 90 days of data

/**
 * Push pending outbox events to Supabase
 * Implements retry logic with exponential backoff
 */
export async function syncPush(): Promise<{ success: number; failed: number }> {
  // Use SSR browser client which has auth session from cookies
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: 0, failed: 0 };

  const user = await getCurrentUser();
  if (!user) return { success: 0, failed: 0 };

  // Get pending events
  const pendingEvents = await db.outbox
    .where('status')
    .equals('pending')
    .or('status')
    .equals('failed')
    .filter((event) => event.retryCount < MAX_RETRY_COUNT)
    .limit(SYNC_BATCH_SIZE)
    .toArray();

  if (pendingEvents.length === 0) {
    return { success: 0, failed: 0 };
  }

  let successCount = 0;
  let failedCount = 0;

  for (const event of pendingEvents) {
    try {
      // Mark as syncing
      await db.outbox.update(event.id, { status: 'syncing' });

      // Push to Supabase based on entity type
      await pushEventToSupabase(supabase, event, user.id);

      // Mark as synced
      await db.outbox.update(event.id, {
        status: 'synced',
        syncedAt: Date.now(),
      });

      successCount++;
    } catch (error) {
      console.error(`[Sync] Push failed for ${event.id}:`, error);

      // Update retry count and status
      await db.outbox.update(event.id, {
        status: 'failed',
        retryCount: event.retryCount + 1,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      });

      failedCount++;
    }
  }

  // Update sync state
  await db.syncState.put({
    id: 'sync_cursor',
    lastPushAt: Date.now(),
    userId: user.id,
  });

  return { success: successCount, failed: failedCount };
}

/**
 * Helper to get the correct Supabase table name for an entity
 */
function getTableName(entity: OutboxEvent['entity']): string {
  switch (entity) {
    case 'timeslots':
      return 'timeslots';
    case 'tags':
      return 'tags';
    case 'domains':
      return 'domains';
    case 'dailyLogs':
      return 'dailylogs'; // PostgreSQL folds unquoted names to lowercase
    default:
      return entity as string;
  }
}

/**
 * Push a single outbox event to Supabase
 */
async function pushEventToSupabase(supabase: any, event: OutboxEvent, userId: string) {
  const tableName = getTableName(event.entity);
  
  // Ensure the payload has the current user's ID
  const localData = { ...event.payload, userId: userId };

  if (event.operation === 'delete') {
    // For delete, just update deleted_at
    const { error } = await supabase
      .from(tableName)
      .update({
        deleted_at: new Date(event.payload.deletedAt).toISOString(),
        updated_at: new Date(event.payload.updatedAt).toISOString(),
      })
      .eq('id', event.entityId)
      .eq('user_id', userId);

    if (error) throw error;
  } else {
    // For create/update, use upsert with idempotency
    const row = mapLocalToServer(event.entity, localData);

    const { error } = await supabase.from(tableName).upsert(row, {
      onConflict: 'id,user_id',
      ignoreDuplicates: false,
    });

    if (error) throw error;
  }
}

/**
 * Map local entity to server format
 */
function mapLocalToServer(entity: string, local: any): any {
  const base = {
    id: local.id,
    user_id: local.userId,
    client_id: local.clientId,
    created_at: new Date(local.createdAt).toISOString(),
    updated_at: new Date(local.updatedAt).toISOString(),
    deleted_at: local.deletedAt ? new Date(local.deletedAt).toISOString() : null,
  };

  switch (entity) {
    case 'timeslots':
      return {
        ...base,
        start_time: new Date(local.start).toISOString(),
        end_time: new Date(local.end).toISOString(),
        note: local.note || null,
        tag_ids: local.tagIds || [],
        energy: local.energy || null,
        mood: local.mood || null,
        version: local.version,
      };

    case 'tags':
      return {
        ...base,
        domain_id: local.domainId,
        name: local.name,
        color: local.color || null,
      };

    case 'domains':
      return {
        ...base,
        name: local.name,
        color: local.color,
        color_end: local.colorEnd || null,
        order: local.order,
      };

    case 'dailyLogs':
      return {
        ...base,
        date: local.date,
        markdown: local.markdown,
      };

    default:
      throw new Error(`Unknown entity type: ${entity}`);
  }
}

/**
 * Pull incremental changes from Supabase
 */
export async function syncPull(): Promise<{ pulled: number; conflicts: number }> {
  // Use SSR browser client which has auth session from cookies
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { pulled: 0, conflicts: 0 };

  const user = await getCurrentUser();
  if (!user) return { pulled: 0, conflicts: 0 };

  // Get last pull cursor
  const syncState = await db.syncState.get('sync_cursor');
  let lastPullCursor = syncState?.lastPullCursor;

  // Check if this is the first sync for this user
  const isFirstSync = !syncState || syncState.userId !== user.id;
  
  // If first sync, ignore any existing cursor (it might be from a different user or corrupted)
  if (isFirstSync) {
    console.log(`[Sync] First-time pull for user ${user.id.slice(0, 8)}...`);
    lastPullCursor = undefined;
  }

  let pulledCount = 0;
  let conflictCount = 0;

  // Pull each entity type
  const entities: Array<{ table: string; entity: OutboxEvent['entity'] }> = [
    { table: 'timeslots', entity: 'timeslots' },
    { table: 'tags', entity: 'tags' },
    { table: 'domains', entity: 'domains' },
    { table: 'dailylogs', entity: 'dailyLogs' },
  ];

  for (const { table, entity } of entities) {
    try {
      const result = await pullEntityFromSupabase(supabase, table, entity, user.id, lastPullCursor);
      pulledCount += result.pulled;
      conflictCount += result.conflicts;
    } catch (error) {
      console.error(`[Sync] Failed to pull ${table}:`, error);
    }
  }

  // Update sync state with new cursor
  // Use current time as cursor only if we pulled data, otherwise keep existing cursor
  const newCursor = pulledCount > 0 ? new Date().toISOString() : lastPullCursor;
  
  await db.syncState.put({
    id: 'sync_cursor',
    lastPullCursor: newCursor,
    lastPullAt: Date.now(),
    userId: user.id,
  });

  return { pulled: pulledCount, conflicts: conflictCount };
}

/**
 * Pull a single entity type from Supabase
 */
async function pullEntityFromSupabase(
  supabase: any,
  tableName: string,
  entity: OutboxEvent['entity'],
  userId: string,
  lastCursor?: string
): Promise<{ pulled: number; conflicts: number }> {
  // Build query
  let query = supabase
    .from(tableName)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });

  // For timeslots, only pull recent data (last 90 days)
  if (tableName === 'timeslots') {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PULL_DAYS_RANGE);
    query = query.gte('start_time', cutoffDate.toISOString());
  }

  // Incremental pull based on cursor
  if (lastCursor) {
    query = query.gt('updated_at', lastCursor);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[Sync] Query error for ${tableName}:`, error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    return { pulled: 0, conflicts: 0 };
  }

  let pulledCount = 0;
  let conflictCount = 0;

  for (const serverRow of data) {
    try {
      const localEntity = mapServerToLocal(entity, serverRow);
      const existing = await getExistingEntity(entity, localEntity.id);

      // Check if there's a pending outbox event for this entity
      // If so, skip updating from server to avoid overwriting local pending changes
      const pendingOutboxEvent = await db.outbox
        .where('entityId')
        .equals(localEntity.id)
        .and((event) => event.status === 'pending' || event.status === 'syncing' || event.status === 'failed')
        .first();

      if (pendingOutboxEvent) {
        continue; // Skip this entity, local pending change takes precedence
      }

      // If server entity is deleted, physically remove it from local DB
      if (localEntity.deletedAt) {
        if (existing) {
          // Delete from local DB (physical delete, not soft delete)
          await deleteLocalEntityPhysically(entity, localEntity.id);
        }
        pulledCount++;
        continue; // Skip to next entity
      }

      if (existing) {
        // Check for conflict (server wins only if no pending local changes)
        const serverUpdatedAt = new Date(serverRow.updated_at).getTime();
        const localUpdatedAt = existing.updatedAt;

        if (localUpdatedAt > serverUpdatedAt) {
          // Local is newer - log conflict but server wins
          await db.conflicts.add({
            id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            entity,
            entityId: localEntity.id,
            localVersion: existing,
            serverVersion: localEntity,
            conflictedAt: Date.now(),
          });
          conflictCount++;
        }

        // Server wins - update local
        await updateLocalEntity(entity, localEntity);
      } else {
        // New entity from server
        await createLocalEntity(entity, localEntity);
      }

      pulledCount++;
    } catch (error) {
      console.error(`[Sync] Row processing failed for ${entity}:`, error);
    }
  }

  return { pulled: pulledCount, conflicts: conflictCount };
}

/**
 * Map server entity to local format
 */
function mapServerToLocal(entity: string, server: any): any {
  const base = {
    id: server.id,
    userId: server.user_id,
    clientId: server.client_id,
    createdAt: new Date(server.created_at).getTime(),
    updatedAt: new Date(server.updated_at).getTime(),
    deletedAt: server.deleted_at ? new Date(server.deleted_at).getTime() : undefined,
  };

  switch (entity) {
    case 'timeslots':
      return {
        ...base,
        start: new Date(server.start_time).getTime(),
        end: new Date(server.end_time).getTime(),
        note: server.note || undefined,
        tagIds: server.tag_ids || [],
        energy: server.energy || undefined,
        mood: server.mood || undefined,
        version: server.version,
      } as TimeSlot;

    case 'tags':
      return {
        ...base,
        domainId: server.domain_id,
        name: server.name,
        color: server.color || undefined,
      } as Tag;

    case 'domains':
      return {
        ...base,
        name: server.name,
        color: server.color,
        colorEnd: server.color_end || undefined,
        order: server.order,
      } as DomainEntity;

    case 'dailyLogs':
      return {
        ...base,
        date: server.date,
        markdown: server.markdown,
      } as DailyLog;

    default:
      throw new Error(`Unknown entity type: ${entity}`);
  }
}

/**
 * Get existing local entity
 */
async function getExistingEntity(entity: OutboxEvent['entity'], id: string): Promise<any> {
  switch (entity) {
    case 'timeslots':
      return db.timeslots.get(id);
    case 'tags':
      return db.tags.get(id);
    case 'domains':
      return db.domains.get(id);
    case 'dailyLogs':
      return db.dailyLogs.get(id);
    default:
      return null;
  }
}

/**
 * Create local entity (bypassing outbox)
 */
async function createLocalEntity(entity: OutboxEvent['entity'], data: any) {
  switch (entity) {
    case 'timeslots':
      await db.timeslots.put(data);
      break;
    case 'tags':
      await db.tags.put(data);
      break;
    case 'domains':
      await db.domains.put(data);
      break;
    case 'dailyLogs':
      await db.dailyLogs.put(data);
      break;
  }
}

/**
 * Update local entity (bypassing outbox)
 */
async function updateLocalEntity(entity: OutboxEvent['entity'], data: any) {
  await createLocalEntity(entity, data); // put() handles both create and update
}

/**
 * Physically delete local entity (permanent removal from IndexedDB)
 */
async function deleteLocalEntityPhysically(entity: OutboxEvent['entity'], id: string) {
  switch (entity) {
    case 'timeslots':
      await db.timeslots.delete(id);
      break;
    case 'tags':
      await db.tags.delete(id);
      break;
    case 'domains':
      await db.domains.delete(id);
      break;
    case 'dailyLogs':
      await db.dailyLogs.delete(id);
      break;
  }
}

/**
 * Migrate local anonymous data to authenticated user
 * Called after login
 */
export async function migrateLocalToCloud(userId: string): Promise<{ migrated: number }> {
  const clientId = getOrCreateClientId();
  let migratedCount = 0;

  // Migrate timeslots (find records without userId)
  const allTimeslots = await db.timeslots.toArray();
  const timeslots = allTimeslots.filter((slot) => !slot.userId);
  for (const slot of timeslots) {
    await db.timeslots.update(slot.id, { userId });
    await db.outbox.add({
      id: `outbox_migrate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      entity: 'timeslots',
      operation: 'create',
      entityId: slot.id,
      payload: { ...slot, userId },
      idempotencyKey: `migrate_timeslots_${slot.id}`,
      userId,
      clientId,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    });
    migratedCount++;
  }

  // Migrate tags
  const allTags = await db.tags.toArray();
  const tags = allTags.filter((tag) => !tag.userId);
  for (const tag of tags) {
    await db.tags.update(tag.id, { userId });
    await db.outbox.add({
      id: `outbox_migrate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      entity: 'tags',
      operation: 'create',
      entityId: tag.id,
      payload: { ...tag, userId },
      idempotencyKey: `migrate_tags_${tag.id}`,
      userId,
      clientId,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    });
    migratedCount++;
  }

  // Migrate domains
  const allDomains = await db.domains.toArray();
  const domains = allDomains.filter((domain) => !domain.userId);
  for (const domain of domains) {
    await db.domains.update(domain.id, { userId });
    await db.outbox.add({
      id: `outbox_migrate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      entity: 'domains',
      operation: 'create',
      entityId: domain.id,
      payload: { ...domain, userId },
      idempotencyKey: `migrate_domains_${domain.id}`,
      userId,
      clientId,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    });
    migratedCount++;
  }

  // Migrate daily logs
  const allLogs = await db.dailyLogs.toArray();
  const logs = allLogs.filter((log) => !log.userId);
  for (const log of logs) {
    await db.dailyLogs.update(log.id, { userId });
    await db.outbox.add({
      id: `outbox_migrate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      entity: 'dailyLogs',
      operation: 'create',
      entityId: log.id,
      payload: { ...log, userId },
      idempotencyKey: `migrate_dailyLogs_${log.id}`,
      userId,
      clientId,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    });
    migratedCount++;
  }

  // Trigger immediate sync
  await syncPush();

  return { migrated: migratedCount };
}

/**
 * Start background sync loop
 * Runs push and pull periodically when online and authenticated
 */
export function startSyncLoop(intervalMs: number = 30000) {
  let syncInterval: NodeJS.Timeout | null = null;

  const runSync = async () => {
    try {
      const user = await getCurrentUser();
      if (!user || !navigator.onLine) return;

      const pushResult = await syncPush();
      const pullResult = await syncPull();

      if (pushResult.success > 0 || pushResult.failed > 0 || pullResult.pulled > 0) {
        console.log(`[Sync] Pushed ${pushResult.success} (failed ${pushResult.failed}), Pulled ${pullResult.pulled}`);
      }
    } catch (error) {
      console.error('[Sync] Background error:', error);
    }
  };

  // Initial sync
  runSync();

  // Periodic sync
  syncInterval = setInterval(runSync, intervalMs);

  // Listen to online/offline events
  window.addEventListener('online', runSync);

  // Cleanup function
  return () => {
    if (syncInterval) clearInterval(syncInterval);
    window.removeEventListener('online', runSync);
  };
}
