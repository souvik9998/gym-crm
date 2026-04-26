-- Tighten storage RLS for the public branch-logos bucket so only authorized
-- users (super_admin or tenant admins of the branch's tenant) can write/delete
-- objects, and only within their own branch folder.
--
-- Path convention: "<branch_uuid>/logo.<ext>"
-- The first path segment must be a branch the caller administers.

-- Drop the previous loose policies
DROP POLICY IF EXISTS "Authenticated users can upload branch logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update branch logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete branch logos" ON storage.objects;

-- Helper: caller can administer the branch identified by the first path segment
-- (super_admin OR tenant admin/owner of the branch's tenant).
CREATE POLICY "Branch admins can upload branch logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'branch-logos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(
         auth.uid(),
         public.get_tenant_from_branch(((storage.foldername(name))[1])::uuid)
       )
  )
);

CREATE POLICY "Branch admins can update branch logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'branch-logos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(
         auth.uid(),
         public.get_tenant_from_branch(((storage.foldername(name))[1])::uuid)
       )
  )
)
WITH CHECK (
  bucket_id = 'branch-logos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(
         auth.uid(),
         public.get_tenant_from_branch(((storage.foldername(name))[1])::uuid)
       )
  )
);

CREATE POLICY "Branch admins can delete branch logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'branch-logos'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(
         auth.uid(),
         public.get_tenant_from_branch(((storage.foldername(name))[1])::uuid)
       )
  )
);
