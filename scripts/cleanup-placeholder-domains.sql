-- ============================================================================
-- Cleanup Script: Remove "Create your Domain" placeholder from cloud
-- ============================================================================
-- This script removes the placeholder domain that was accidentally synced
-- to the cloud during the first login.
--
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- ============================================================================

-- 1. Find the placeholder domain
SELECT id, user_id, name, created_at, updated_at
FROM domains
WHERE name = 'Create your Domain';

-- 2. Delete tags associated with placeholder domain (if any)
DELETE FROM tags
WHERE domain_id IN (
  SELECT id FROM domains WHERE name = 'Create your Domain'
);

-- 3. Delete timeslots associated with placeholder domain tags (if any)
-- Note: This is safe because placeholder domains shouldn't have real timeslots
DELETE FROM timeslots
WHERE id IN (
  SELECT ts.id
  FROM timeslots ts
  WHERE ts.tag_ids::text LIKE '%Create your Domain%'
);

-- 4. Delete the placeholder domain itself
DELETE FROM domains
WHERE name = 'Create your Domain';

-- 5. Verify cleanup
SELECT 
  (SELECT COUNT(*) FROM domains WHERE name = 'Create your Domain') as remaining_domains,
  (SELECT COUNT(*) FROM tags WHERE name = 'Create your Domain') as remaining_tags;

-- Expected result: remaining_domains = 0, remaining_tags = 0

