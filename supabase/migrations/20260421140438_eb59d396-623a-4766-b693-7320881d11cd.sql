
-- ============================================================================
-- Branch Backup & Restore Helper Functions
-- ============================================================================
-- These SECURITY DEFINER functions are called only by the branch-import edge
-- function (with service-role key). Authorization is enforced inside each
-- function via is_tenant_admin() / is_super_admin().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- branch_purge: deletes all branch-scoped rows in dependency order.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.branch_purge(_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
BEGIN
  -- Resolve tenant for this branch
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = _branch_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Branch % not found', _branch_id;
  END IF;

  -- Authorization: super_admin OR tenant admin/owner of the branch's tenant
  IF NOT (
    public.is_super_admin(v_caller)
    OR public.is_tenant_admin(v_caller, v_tenant)
  ) THEN
    RAISE EXCEPTION 'Not authorized to purge branch %', _branch_id;
  END IF;

  -- Delete in dependency order (children before parents)

  -- Event-related
  DELETE FROM public.event_registration_items
    WHERE registration_id IN (
      SELECT id FROM public.event_registrations
      WHERE event_id IN (SELECT id FROM public.events WHERE branch_id = _branch_id)
    );
  DELETE FROM public.event_registrations
    WHERE event_id IN (SELECT id FROM public.events WHERE branch_id = _branch_id);
  DELETE FROM public.event_pricing_options
    WHERE event_id IN (SELECT id FROM public.events WHERE branch_id = _branch_id);
  DELETE FROM public.event_custom_fields
    WHERE event_id IN (SELECT id FROM public.events WHERE branch_id = _branch_id);
  DELETE FROM public.events WHERE branch_id = _branch_id;

  -- Biometric / attendance
  DELETE FROM public.biometric_sync_logs WHERE branch_id = _branch_id;
  DELETE FROM public.biometric_enrollment_requests WHERE branch_id = _branch_id;
  DELETE FROM public.biometric_member_mappings WHERE branch_id = _branch_id;
  DELETE FROM public.biometric_devices WHERE branch_id = _branch_id;
  DELETE FROM public.daily_attendance WHERE branch_id = _branch_id;
  DELETE FROM public.attendance_logs WHERE branch_id = _branch_id;
  DELETE FROM public.attendance_devices WHERE branch_id = _branch_id;

  -- Coupon usage tied to this branch
  DELETE FROM public.coupon_usage WHERE branch_id = _branch_id;

  -- Member exercise plans/items
  DELETE FROM public.member_exercise_items
    WHERE plan_id IN (SELECT id FROM public.member_exercise_plans WHERE branch_id = _branch_id);
  DELETE FROM public.member_exercise_plans WHERE branch_id = _branch_id;

  -- Member documents / assessments / details
  DELETE FROM public.member_documents
    WHERE member_id IN (SELECT id FROM public.members WHERE branch_id = _branch_id);
  DELETE FROM public.member_assessments WHERE branch_id = _branch_id;
  DELETE FROM public.member_details
    WHERE member_id IN (SELECT id FROM public.members WHERE branch_id = _branch_id);

  -- Ledger / invoices / payments
  DELETE FROM public.ledger_entries WHERE branch_id = _branch_id;
  DELETE FROM public.invoices WHERE branch_id = _branch_id;

  -- PT subscriptions and time slot membership
  DELETE FROM public.time_slot_members
    WHERE time_slot_id IN (SELECT id FROM public.trainer_time_slots WHERE branch_id = _branch_id);
  DELETE FROM public.pt_subscriptions WHERE branch_id = _branch_id;
  DELETE FROM public.trainer_time_slots WHERE branch_id = _branch_id;
  DELETE FROM public.personal_trainers WHERE branch_id = _branch_id;

  -- Subscriptions (gym memberships)
  DELETE FROM public.subscriptions
    WHERE member_id IN (SELECT id FROM public.members WHERE branch_id = _branch_id);

  -- Daily pass
  DELETE FROM public.daily_pass_subscriptions WHERE branch_id = _branch_id;
  DELETE FROM public.daily_pass_users WHERE branch_id = _branch_id;

  -- Payments (after subscriptions, invoices)
  DELETE FROM public.payments WHERE branch_id = _branch_id;

  -- Members last (after all references)
  DELETE FROM public.members WHERE branch_id = _branch_id;

  -- Packages, holidays, settings
  DELETE FROM public.custom_packages WHERE branch_id = _branch_id;
  DELETE FROM public.monthly_packages WHERE branch_id = _branch_id;
  DELETE FROM public.gym_holidays WHERE branch_id = _branch_id;
  DELETE FROM public.gym_settings WHERE branch_id = _branch_id;

  -- Staff branch assignments for this branch only (NEVER delete staff rows)
  DELETE FROM public.staff_branch_assignments WHERE branch_id = _branch_id;

  -- Activity logs scoped to this branch
  DELETE FROM public.admin_activity_logs WHERE branch_id = _branch_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- branch_restore_tx: purge + bulk insert in one atomic transaction.
-- _payload is a JSON object of the form: { "<table_name>": [ {row}, ... ], ... }
-- All rows are assumed to be already remapped (UUIDs regenerated, branch_id
-- forced to _branch_id) by the calling edge function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.branch_restore_tx(_branch_id uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_inserted jsonb := '{}'::jsonb;
  v_count integer;
  v_table text;
  -- Insert order matters: parents first
  v_table_order text[] := ARRAY[
    'gym_settings',
    'monthly_packages',
    'custom_packages',
    'gym_holidays',
    'members',
    'member_details',
    'member_assessments',
    'member_documents',
    'subscriptions',
    'personal_trainers',
    'trainer_time_slots',
    'pt_subscriptions',
    'time_slot_members',
    'member_exercise_plans',
    'member_exercise_items',
    'daily_pass_users',
    'daily_pass_subscriptions',
    'payments',
    'invoices',
    'ledger_entries',
    'attendance_devices',
    'attendance_logs',
    'daily_attendance',
    'biometric_devices',
    'biometric_member_mappings',
    'biometric_enrollment_requests',
    'biometric_sync_logs',
    'events',
    'event_pricing_options',
    'event_custom_fields',
    'event_registrations',
    'event_registration_items',
    'staff_branch_assignments',
    'admin_activity_logs'
  ];
BEGIN
  -- Resolve tenant + authorize
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = _branch_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Branch % not found', _branch_id;
  END IF;

  IF NOT (
    public.is_super_admin(v_caller)
    OR public.is_tenant_admin(v_caller, v_tenant)
  ) THEN
    RAISE EXCEPTION 'Not authorized to restore branch %', _branch_id;
  END IF;

  -- 1. Purge first (in same tx, will rollback together on any error)
  PERFORM public.branch_purge(_branch_id);

  -- 2. Insert each table in order using jsonb_populate_recordset semantics
  --    via dynamic SQL (each table has a different rowtype, so we use
  --    json_populate_recordset against the table's rowtype).
  FOREACH v_table IN ARRAY v_table_order LOOP
    IF _payload ? v_table AND jsonb_typeof(_payload -> v_table) = 'array' THEN
      EXECUTE format(
        'INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I, $1)',
        v_table, v_table
      ) USING (_payload -> v_table);
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_inserted := v_inserted || jsonb_build_object(v_table, v_count);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'branch_id', _branch_id,
    'inserted', v_inserted,
    'restored_at', now()
  );
END;
$$;

-- Lock down execution: only service_role and authenticated callers can invoke.
-- The functions themselves enforce admin/owner authorization internally.
REVOKE ALL ON FUNCTION public.branch_purge(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.branch_restore_tx(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.branch_purge(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branch_restore_tx(uuid, jsonb) TO authenticated, service_role;
