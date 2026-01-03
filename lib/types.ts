// Core domain types - now dynamic
export type Domain = string;

export interface DomainEntity {
  id: string; // UUID, stable across renames
  name: string; // display name (can be renamed)
  color: string; // hex color for gradient start
  colorEnd?: string; // hex color for gradient end (optional)
  order: number; // display order
  createdAt: number;
  updatedAt: number;
  // Sync fields
  userId?: string; // null for anonymous, set after login
  clientId?: string; // device/browser identifier
  deletedAt?: number; // soft delete timestamp (null = not deleted)
  archivedAt?: number; // archive timestamp (null = not archived)
}

export interface Tag {
  id: string; // UUID, stable across renames
  domainId: string; // reference to DomainEntity.id (UUID)
  name: string; // tag name (can be renamed)
  color?: string;
  createdAt: number;
  updatedAt: number;
  // Sync fields
  userId?: string;
  clientId?: string;
  deletedAt?: number;
  archivedAt?: number; // archive timestamp (null = not archived)
}

export interface TimeSlot {
  id: string;
  start: number; // epoch ms (UTC)
  end: number;
  note?: string;
  tagIds: string[]; // ["Study/CFA","Health/Run"]
  energy?: number; // optional 1..5
  mood?: number; // optional 1..5
  version: number;
  createdAt: number;
  updatedAt: number;
  // Sync fields
  userId?: string;
  clientId?: string;
  deletedAt?: number;
}

export interface DailyLog {
  id: string;
  date: string; // "YYYY-MM-DD"
  markdown: string;
  createdAt: number;
  updatedAt: number;
  // Sync fields
  userId?: string;
  clientId?: string;
  deletedAt?: number;
}

// UI types
export interface DomainStat {
  domain: string;
  minutes: number;
  percentage: number;
  subtags: SubtagStat[];
}

export interface SubtagStat {
  tagId: string;
  name: string;
  minutes: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// Settings
export interface AppSettings {
  gridInterval: 15 | 30; // minutes
  attributionMode: 'split' | 'primary'; // how to attribute multi-tag duration
  theme: 'light' | 'dark';
}

// Sync types
export type OutboxOperation = 'create' | 'update' | 'delete';
export type OutboxEntity = 'timeslots' | 'tags' | 'domains' | 'dailyLogs';
export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface OutboxEvent {
  id: string; // unique event ID
  entity: OutboxEntity;
  operation: OutboxOperation;
  entityId: string; // ID of the entity being modified
  payload: any; // full entity data for create/update, null for delete
  idempotencyKey: string; // stable key for deduplication
  userId?: string; // null for anonymous operations
  clientId: string; // device identifier
  status: OutboxStatus;
  retryCount: number;
  lastError?: string;
  createdAt: number;
  syncedAt?: number;
}

export interface SyncState {
  id: string; // 'sync_cursor' or similar
  lastPullCursor?: string; // timestamp or sequence number from server
  lastPullAt?: number;
  lastPushAt?: number;
  userId?: string;
}

export interface ConflictRecord {
  id: string;
  entity: OutboxEntity;
  entityId: string;
  localVersion: any; // local data that was overwritten
  serverVersion: any; // server data that won
  conflictedAt: number;
  resolvedAt?: number;
}
