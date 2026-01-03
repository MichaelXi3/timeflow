import Dexie, { Table } from 'dexie';
import {
  TimeSlot,
  Tag,
  DailyLog,
  DomainEntity,
  OutboxEvent,
  SyncState,
  ConflictRecord,
} from './types';

export class DomainFlowDB extends Dexie {
  timeslots!: Table<TimeSlot, string>;
  tags!: Table<Tag, string>;
  dailyLogs!: Table<DailyLog, string>;
  domains!: Table<DomainEntity, string>;
  outbox!: Table<OutboxEvent, string>;
  syncState!: Table<SyncState, string>;
  conflicts!: Table<ConflictRecord, string>;

  constructor() {
    super('DomainFlowDB');

    // Version 1: Initial schema
    this.version(1).stores({
      timeslots: 'id, start, end, updatedAt, *tagIds',
      tags: 'id, domain, name, updatedAt',
      dailyLogs: 'id, date, updatedAt',
    });

    // Version 2: Add domains table
    this.version(2)
      .stores({
        timeslots: 'id, start, end, updatedAt, *tagIds',
        tags: 'id, domain, name, updatedAt',
        dailyLogs: 'id, date, updatedAt',
        domains: 'id, name, order, updatedAt',
      });

    // Version 3: Add sync fields and sync tables
    this.version(3)
      .stores({
        timeslots: 'id, start, end, updatedAt, userId, clientId, deletedAt, *tagIds',
        tags: 'id, domain, name, updatedAt, userId, clientId, deletedAt',
        dailyLogs: 'id, date, updatedAt, userId, clientId, deletedAt',
        domains: 'id, name, order, updatedAt, userId, clientId, deletedAt',
        outbox: 'id, status, createdAt, userId, clientId, entity, entityId',
        syncState: 'id, userId',
        conflicts: 'id, entity, entityId, conflictedAt',
      })
      .upgrade(async (trans) => {
        // Add clientId to existing records
        const clientId = getOrCreateClientId();

        // Migrate timeslots
        const timeslots = await trans.table('timeslots').toArray();
        for (const slot of timeslots) {
          await trans.table('timeslots').update(slot.id, {
            clientId,
            userId: null,
            deletedAt: null,
          });
        }

        // Migrate tags
        const tags = await trans.table('tags').toArray();
        for (const tag of tags) {
          await trans.table('tags').update(tag.id, {
            clientId,
            userId: null,
            deletedAt: null,
          });
        }

        // Migrate domains
        const domains = await trans.table('domains').toArray();
        for (const domain of domains) {
          await trans.table('domains').update(domain.id, {
            clientId,
            userId: null,
            deletedAt: null,
          });
        }

        // Migrate dailyLogs
        const logs = await trans.table('dailyLogs').toArray();
        for (const log of logs) {
          await trans.table('dailyLogs').update(log.id, {
            clientId,
            userId: null,
            deletedAt: null,
          });
        }
      });

    // Version 4: Migrate to UUID-based IDs for domains and tags
    this.version(4)
      .stores({
        timeslots: 'id, start, end, updatedAt, userId, clientId, deletedAt, *tagIds',
        tags: 'id, domainId, name, updatedAt, userId, clientId, deletedAt',
        dailyLogs: 'id, date, updatedAt, userId, clientId, deletedAt',
        domains: 'id, name, order, updatedAt, userId, clientId, deletedAt',
        outbox: 'id, status, createdAt, userId, clientId, entity, entityId',
        syncState: 'id, userId',
        conflicts: 'id, entity, entityId, conflictedAt',
      })
      .upgrade(async (trans) => {
        // Migrate domains from name-based ID to UUID
        const oldDomains = await trans.table('domains').toArray();
        const domainIdMap = new Map<string, string>(); // oldName -> newUUID

        // Clear domains table
        await trans.table('domains').clear();

        // Recreate domains with UUIDs
        for (const oldDomain of oldDomains) {
          const newId = `domain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          domainIdMap.set(oldDomain.name, newId);
          
          await trans.table('domains').add({
            ...oldDomain,
            id: newId,
          });
        }

        // Migrate tags from "Domain/Name" to UUID, update domainId
        const oldTags = await trans.table('tags').toArray();
        const tagIdMap = new Map<string, string>(); // oldId -> newUUID

        // Clear tags table
        await trans.table('tags').clear();

        // Recreate tags with UUIDs
        for (const oldTag of oldTags) {
          const newId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          tagIdMap.set(oldTag.id, newId);
          
          const newDomainId = domainIdMap.get(oldTag.domain);
          if (!newDomainId) continue; // Skip orphaned tags

          await trans.table('tags').add({
            ...oldTag,
            id: newId,
            domainId: newDomainId,
          });
        }

        // Update timeslots' tagIds arrays
        const timeslots = await trans.table('timeslots').toArray();
        for (const slot of timeslots) {
          const newTagIds = slot.tagIds
            .map((oldId: string) => tagIdMap.get(oldId))
            .filter((id: string | undefined): id is string => id !== undefined);
          
          await trans.table('timeslots').update(slot.id, {
            tagIds: newTagIds,
          });
        }
      });

    // Version 5: Add archivedAt field support
    this.version(5)
      .stores({
        timeslots: 'id, start, end, updatedAt, userId, clientId, deletedAt, *tagIds',
        tags: 'id, domainId, name, updatedAt, userId, clientId, deletedAt, archivedAt',
        dailyLogs: 'id, date, updatedAt, userId, clientId, deletedAt',
        domains: 'id, name, order, updatedAt, userId, clientId, deletedAt, archivedAt',
        outbox: 'id, status, createdAt, userId, clientId, entity, entityId',
        syncState: 'id, userId',
        conflicts: 'id, entity, entityId, conflictedAt',
      })
      .upgrade(async (trans) => {
        // Initialize archivedAt to null for existing records
        const domains = await trans.table('domains').toArray();
        for (const domain of domains) {
          if (domain.archivedAt === undefined) {
            await trans.table('domains').update(domain.id, { archivedAt: null });
          }
        }

        const tags = await trans.table('tags').toArray();
        for (const tag of tags) {
          if (tag.archivedAt === undefined) {
            await trans.table('tags').update(tag.id, { archivedAt: null });
          }
        }
      });
  }
}

export const db = new DomainFlowDB();

// ClientId management (persistent device identifier)
const CLIENT_ID_KEY = 'domainflow_client_id';

export function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'server';

  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

// Get current user ID (from store or auth)
function getCurrentUserId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  // Will be populated by auth state
  return (window as any).__domainflow_user_id || undefined;
}

// Outbox helper
async function addToOutbox(
  entity: OutboxEvent['entity'],
  operation: OutboxEvent['operation'],
  entityId: string,
  payload: any
) {
  const now = Date.now();
  const clientId = getOrCreateClientId();
  const userId = getCurrentUserId();

  const event: OutboxEvent = {
    id: `outbox_${now}_${Math.random().toString(36).substr(2, 9)}`,
    entity,
    operation,
    entityId,
    payload,
    idempotencyKey: `${entity}_${operation}_${entityId}_${now}`,
    userId,
    clientId,
    status: 'pending',
    retryCount: 0,
    createdAt: now,
  };

  await db.outbox.add(event);
  return event;
}

// CRUD helpers
export const dbHelpers = {
  // TimeSlots
  async createTimeSlot(
    slot: Omit<
      TimeSlot,
      'id' | 'version' | 'createdAt' | 'updatedAt' | 'userId' | 'clientId' | 'deletedAt'
    >
  ) {
    const now = Date.now();
    const clientId = getOrCreateClientId();
    const userId = getCurrentUserId();

    const newSlot: TimeSlot = {
      ...slot,
      id: `slot_${now}_${Math.random().toString(36).substr(2, 9)}`,
      version: 1,
      createdAt: now,
      updatedAt: now,
      userId,
      clientId,
      deletedAt: undefined,
    };

    await db.timeslots.add(newSlot);
    await addToOutbox('timeslots', 'create', newSlot.id, newSlot);

    return newSlot;
  },

  async updateTimeSlot(id: string, updates: Partial<TimeSlot>) {
    const existing = await db.timeslots.get(id);
    if (!existing) throw new Error('TimeSlot not found');

    const updated = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };

    await db.timeslots.put(updated);
    await addToOutbox('timeslots', 'update', id, updated);

    return updated;
  },

  async deleteTimeSlot(id: string) {
    const existing = await db.timeslots.get(id);
    if (!existing) return;

    const now = Date.now();

    // Soft delete
    const deleted = {
      ...existing,
      deletedAt: now,
      updatedAt: now,
      version: existing.version + 1,
    };

    await db.timeslots.put(deleted);
    await addToOutbox('timeslots', 'delete', id, deleted);

    // Trigger a manual refresh by touching the table
    // This ensures useLiveQuery picks up the change
    await db.timeslots.where('id').equals(id).modify({});
  },

  async getTimeSlotsByRange(start: number, end: number): Promise<TimeSlot[]> {
    const slots = await db.timeslots
      .where('start')
      .between(start, end, true, true)
      .or('end')
      .between(start, end, true, true)
      .toArray();

    // Filter out soft-deleted slots
    return slots.filter((slot) => !slot.deletedAt);
  },

  /**
   * Hard delete records that have been soft-deleted for more than 7 days
   * Should be called periodically (e.g., on app startup or daily)
   */
  async cleanupOldDeletedRecords() {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Clean timeslots
    const oldDeletedSlots = await db.timeslots
      .filter((slot) => !!slot.deletedAt && slot.deletedAt < sevenDaysAgo)
      .toArray();
    
    for (const slot of oldDeletedSlots) {
      await db.timeslots.delete(slot.id);
    }

    // Clean tags
    const oldDeletedTags = await db.tags
      .filter((tag) => !!tag.deletedAt && tag.deletedAt < sevenDaysAgo)
      .toArray();
    
    for (const tag of oldDeletedTags) {
      await db.tags.delete(tag.id);
    }

    // Clean domains
    const oldDeletedDomains = await db.domains
      .filter((domain) => !!domain.deletedAt && domain.deletedAt < sevenDaysAgo)
      .toArray();
    
    for (const domain of oldDeletedDomains) {
      await db.domains.delete(domain.id);
    }

    // Clean daily logs
    const oldDeletedLogs = await db.dailyLogs
      .filter((log) => !!log.deletedAt && log.deletedAt < sevenDaysAgo)
      .toArray();
    
    for (const log of oldDeletedLogs) {
      await db.dailyLogs.delete(log.id);
    }

    // Clean synced outbox events older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await db.outbox
      .filter((event) => event.status === 'synced' && event.createdAt < thirtyDaysAgo)
      .delete();

    if (oldDeletedSlots.length > 0 || oldDeletedTags.length > 0 || oldDeletedDomains.length > 0 || oldDeletedLogs.length > 0) {
      console.log(
        `[DB] Cleanup: ${oldDeletedSlots.length} slots, ${oldDeletedTags.length} tags, ` +
        `${oldDeletedDomains.length} domains, ${oldDeletedLogs.length} logs removed`
      );
    }
  },

  // Tags
  async createTag(
    tag: Omit<Tag, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'clientId' | 'deletedAt'>
  ) {
    // Check if tag with same name already exists in this domain
    const existingTags = await db.tags.where('domainId').equals(tag.domainId).toArray();
    const duplicate = existingTags.find(
      (t) => !t.deletedAt && t.name.toLowerCase() === tag.name.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Tag "${tag.name}" already exists in this domain`);
    }

    const now = Date.now();
    const clientId = getOrCreateClientId();
    const userId = getCurrentUserId();

    const newTag: Tag = {
      ...tag,
      id: `tag_${now}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      userId,
      clientId,
      deletedAt: undefined,
    };

    await db.tags.add(newTag);
    await addToOutbox('tags', 'create', newTag.id, newTag);

    return newTag;
  },

  async updateTag(id: string, updates: Partial<Tag>) {
    const existing = await db.tags.get(id);
    if (!existing) throw new Error('Tag not found');

    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await db.tags.put(updated);
    await addToOutbox('tags', 'update', id, updated);

    return updated;
  },

  async deleteTag(id: string) {
    const existing = await db.tags.get(id);
    if (!existing) return;

    // Remove tag from all timeslots that have this tag
    const allSlots = await db.timeslots.toArray();
    const slotsWithTag = allSlots.filter((slot) => !slot.deletedAt && slot.tagIds.includes(id));

    for (const slot of slotsWithTag) {
      const remainingTags = slot.tagIds.filter((tid) => tid !== id);

      if (remainingTags.length === 0) {
        // No tags left, delete the entire time slot
        await this.deleteTimeSlot(slot.id);
      } else {
        // Update with remaining tags
        await this.updateTimeSlot(slot.id, {
          tagIds: remainingTags,
        });
      }
    }

    // Soft delete the tag
    const deleted = {
      ...existing,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.tags.put(deleted);
    await addToOutbox('tags', 'delete', id, deleted);
  },


  async getAllTags(): Promise<Tag[]> {
    const tags = await db.tags.toArray();
    return tags.filter((tag) => !tag.deletedAt && !tag.archivedAt);
  },

  async getTagsByDomain(domainId: string): Promise<Tag[]> {
    const tags = await db.tags.where('domainId').equals(domainId).toArray();
    return tags.filter((tag) => !tag.deletedAt && !tag.archivedAt);
  },

  async archiveTag(id: string) {
    const existing = await db.tags.get(id);
    if (!existing) return;

    const now = Date.now();

    const archived = {
      ...existing,
      archivedAt: now,
      updatedAt: now,
    };

    await db.tags.put(archived);
    await addToOutbox('tags', 'update', id, archived);
  },

  async unarchiveTag(id: string) {
    const existing = await db.tags.get(id);
    if (!existing) return;

    const now = Date.now();

    const unarchived = {
      ...existing,
      archivedAt: undefined,
      updatedAt: now,
    };

    await db.tags.put(unarchived);
    await addToOutbox('tags', 'update', id, unarchived);
  },

  async getArchivedTags(): Promise<Tag[]> {
    const tags = await db.tags.toArray();
    return tags.filter((tag) => !tag.deletedAt && tag.archivedAt);
  },

  // Domains
  async createDomain(
    domain: Omit<
      DomainEntity,
      'id' | 'createdAt' | 'updatedAt' | 'userId' | 'clientId' | 'deletedAt'
    >
  ) {
    // Check if domain with same name already exists
    const allDomains = await db.domains.toArray();
    const duplicate = allDomains.find(
      (d) => !d.deletedAt && d.name.toLowerCase() === domain.name.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Domain "${domain.name}" already exists`);
    }

    const now = Date.now();
    const clientId = getOrCreateClientId();
    const userId = getCurrentUserId();

    const newDomain: DomainEntity = {
      ...domain,
      id: `domain_${now}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      userId,
      clientId,
      deletedAt: undefined,
    };

    await db.domains.add(newDomain);
    await addToOutbox('domains', 'create', newDomain.id, newDomain);

    return newDomain;
  },

  async updateDomain(id: string, updates: Partial<DomainEntity>) {
    const existing = await db.domains.get(id);
    if (!existing) throw new Error('Domain not found');

    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await db.domains.put(updated);
    await addToOutbox('domains', 'update', id, updated);

    return updated;
  },

  async deleteDomain(id: string) {
    const existing = await db.domains.get(id);
    if (!existing) return;

    // Check if domain has any active tags
    const tags = await db.tags.where('domainId').equals(id).toArray();
    const activeTags = tags.filter((tag) => !tag.deletedAt);
    if (activeTags.length > 0) {
      throw new Error('Cannot delete domain with existing tags. Please delete all tags first.');
    }

    // Soft delete
    const deleted = {
      ...existing,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.domains.put(deleted);
    await addToOutbox('domains', 'delete', id, deleted);
  },

  async getAllDomains(): Promise<DomainEntity[]> {
    const domains = await db.domains.orderBy('order').toArray();
    return domains.filter((domain) => !domain.deletedAt && !domain.archivedAt);
  },

  async archiveDomain(id: string) {
    const existing = await db.domains.get(id);
    if (!existing) return;

    const now = Date.now();

    // Archive domain and all its tags
    const archived = {
      ...existing,
      archivedAt: now,
      updatedAt: now,
    };

    await db.domains.put(archived);
    await addToOutbox('domains', 'update', id, archived);

    // Archive all tags under this domain
    const tags = await db.tags.where('domainId').equals(id).toArray();
    for (const tag of tags) {
      if (!tag.deletedAt && !tag.archivedAt) {
        await this.archiveTag(tag.id);
      }
    }
  },

  async unarchiveDomain(id: string) {
    const existing = await db.domains.get(id);
    if (!existing) return;

    const now = Date.now();

    const unarchived = {
      ...existing,
      archivedAt: undefined,
      updatedAt: now,
    };

    await db.domains.put(unarchived);
    await addToOutbox('domains', 'update', id, unarchived);

    // Automatically unarchive all tags under this domain
    const tags = await db.tags.where('domainId').equals(id).toArray();
    for (const tag of tags) {
      if (!tag.deletedAt && tag.archivedAt) {
        await this.unarchiveTag(tag.id);
      }
    }
  },

  async getArchivedDomains(): Promise<DomainEntity[]> {
    const domains = await db.domains.orderBy('order').toArray();
    return domains.filter((domain) => !domain.deletedAt && domain.archivedAt);
  },

  // Daily Logs
  async upsertDailyLog(date: string, markdown: string) {
    const existing = await db.dailyLogs.where('date').equals(date).first();
    const now = Date.now();
    const clientId = getOrCreateClientId();
    const userId = getCurrentUserId();

    if (existing && !existing.deletedAt) {
      const updated = { ...existing, markdown, updatedAt: now };
      await db.dailyLogs.put(updated);
      await addToOutbox('dailyLogs', 'update', existing.id, updated);
      return updated;
    } else {
      const newLog: DailyLog = {
        id: `log_${date}`,
        date,
        markdown,
        createdAt: now,
        updatedAt: now,
        userId,
        clientId,
        deletedAt: undefined,
      };
      await db.dailyLogs.add(newLog);
      await addToOutbox('dailyLogs', 'create', newLog.id, newLog);
      return newLog;
    }
  },

  async getDailyLog(date: string): Promise<DailyLog | undefined> {
    const log = await db.dailyLogs.where('date').equals(date).first();
    return log && !log.deletedAt ? log : undefined;
  },

  async getAllDailyLogs(): Promise<DailyLog[]> {
    const logs = await db.dailyLogs.orderBy('date').reverse().toArray();
    return logs.filter((log) => !log.deletedAt);
  },
};

// Initialize database on first run
// Note: No longer creates default domains - users start with a blank slate
export async function initializeDatabase() {
  // Just ensure the database is ready
  // No default data creation - users will create their own domains
  return Promise.resolve();
}
