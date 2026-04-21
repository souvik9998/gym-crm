-- Fix branch_restore_tx authorization: service-role calls have NULL auth.uid().
-- Accept caller user_id as parameter (passed from trusted edge function after JWT validation).

CREATE OR REPLACE FUNCTION public.branch_restore_tx(_branch_id uuid, _payload jsonb, _caller_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := COALESCE(_caller_id, auth.uid());
  v_tenant uuid;
  v_inserted jsonb := '{}'::jsonb;
  v_count integer;
  v_table text;
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
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'No caller identity available for restore authorization';
  END IF;

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

  PERFORM public.branch_purge(_branch_id);

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
$function$;