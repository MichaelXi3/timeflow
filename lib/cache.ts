/**
 * Simple in-memory cache for frequently accessed data
 * Reduces IndexedDB query load for tags and domains
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class DataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private ttl = 5000; // 5 seconds TTL

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  invalidatePattern(pattern: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach((key) => {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
      }
    });
  }
}

export const dataCache = new DataCache();

