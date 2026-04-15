
CREATE OR REPLACE FUNCTION public.get_tenant_storage_usage_mb(_tenant_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_bytes bigint := 0;
  v_branch_ids uuid[];
BEGIN
  -- Get all branch IDs for this tenant
  SELECT array_agg(id) INTO v_branch_ids
  FROM public.branches
  WHERE tenant_id = _tenant_id AND deleted_at IS NULL;

  IF v_branch_ids IS NULL OR array_length(v_branch_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Sum sizes of all storage objects whose path starts with any branch_id
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) INTO v_total_bytes
  FROM storage.objects
  WHERE bucket_id IN ('invoices', 'branch-logos', 'member-documents', 'event-assets')
    AND (
      SELECT bool_or(name LIKE b::text || '/%')
      FROM unnest(v_branch_ids) AS b
    );

  -- Convert bytes to MB (rounded to 2 decimals)
  RETURN ROUND(v_total_bytes / (1024.0 * 1024.0), 2);
END;
$$;
