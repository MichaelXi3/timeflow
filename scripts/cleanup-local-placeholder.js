/**
 * ============================================================================
 * Local Cleanup Script: Remove "Create your Domain" placeholder
 * ============================================================================
 * Run this in browser console (DevTools → Console) to clean up local IndexedDB
 * 
 * This will:
 * 1. Delete placeholder domains from local Dexie
 * 2. Delete associated tags
 * 3. Clear sync cursor to force fresh pull
 * 
 * After running this, refresh the page to sync fresh data from cloud.
 * ============================================================================
 */

(async function cleanupPlaceholder() {
  console.log('🧹 Starting cleanup...');

  // Open IndexedDB
  const dbName = 'TimeFlowDB';
  const request = indexedDB.open(dbName);

  request.onsuccess = async (event) => {
    const db = event.target.result;
    const transaction = db.transaction(['domains', 'tags', 'syncState'], 'readwrite');
    
    const domainsStore = transaction.objectStore('domains');
    const tagsStore = transaction.objectStore('tags');
    const syncStateStore = transaction.objectStore('syncState');

    // 1. Delete placeholder domains
    const domainsRequest = domainsStore.getAll();
    domainsRequest.onsuccess = () => {
      const domains = domainsRequest.result;
      const placeholders = domains.filter(d => d.name === 'Create your Domain');
      
      console.log(`Found ${placeholders.length} placeholder domain(s)`);
      
      placeholders.forEach(placeholder => {
        domainsStore.delete(placeholder.id);
        console.log(`✅ Deleted placeholder domain: ${placeholder.id}`);
      });
    };

    // 2. Delete orphaned tags
    const tagsRequest = tagsStore.getAll();
    tagsRequest.onsuccess = () => {
      const tags = tagsRequest.result;
      const orphaned = tags.filter(t => !t.domainId || t.name === 'Create your Domain');
      
      console.log(`Found ${orphaned.length} orphaned tag(s)`);
      
      orphaned.forEach(tag => {
        tagsStore.delete(tag.id);
        console.log(`✅ Deleted orphaned tag: ${tag.id}`);
      });
    };

    // 3. Clear sync cursor
    syncStateStore.delete('sync_cursor');
    console.log('✅ Cleared sync cursor');

    transaction.oncomplete = () => {
      console.log('🎉 Cleanup complete! Refresh the page to sync fresh data.');
      db.close();
    };

    transaction.onerror = (error) => {
      console.error('❌ Cleanup failed:', error);
      db.close();
    };
  };

  request.onerror = (error) => {
    console.error('❌ Failed to open database:', error);
  };
})();

