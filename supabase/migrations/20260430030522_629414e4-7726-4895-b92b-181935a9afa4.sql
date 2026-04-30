
DROP POLICY IF EXISTS "Public can read videos bucket" ON storage.objects;

-- Allow direct object access (by exact name) but prevent enumeration via list calls.
-- Public buckets in Supabase serve files via the public CDN URL regardless of policy,
-- so dropping the broad SELECT prevents `list` while keeping `getPublicUrl` working.
