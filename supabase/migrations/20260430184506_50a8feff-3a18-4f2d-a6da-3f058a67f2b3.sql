CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_members bigint, active_members bigint, expiring_soon bigint, expired_members bigint, inactive_members bigint, with_pt bigint, daily_pass_users bigint, monthly_revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_expiry_threshold DATE := v_today + INTERVAL '7 days';
  v_month_start DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::DATE;
BEGIN
  RETURN QUERY
  WITH member_stats AS (
    SELECT
      m.id as member_id,
      s.status,
      s.end_date,
      s.id as subscription_id,
      ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY s.end_date DESC NULLS LAST) as rn
    FROM public.members m
    LEFT JOIN public.subscriptions s ON s.member_id = m.id
    WHERE (_branch_id IS NULL OR m.branch_id = _branch_id)
  ),
  latest_subs AS (
    SELECT * FROM member_stats WHERE rn = 1
  )
  SELECT
    (SELECT COUNT(DISTINCT m.id) FROM public.members m WHERE _branch_id IS NULL OR m.branch_id = _branch_id)::BIGINT as total_members,
    (SELECT COUNT(*) FROM latest_subs
      WHERE status IS DISTINCT FROM 'inactive'
        AND end_date IS NOT NULL
        AND end_date > v_expiry_threshold)::BIGINT as active_members,
    (SELECT COUNT(*) FROM latest_subs
      WHERE status IS DISTINCT FROM 'inactive'
        AND end_date IS NOT NULL
        AND end_date >= v_today
        AND end_date <= v_expiry_threshold)::BIGINT as expiring_soon,
    (SELECT COUNT(*) FROM latest_subs
      WHERE status IS DISTINCT FROM 'inactive'
        AND end_date IS NOT NULL
        AND end_date < v_today)::BIGINT as expired_members,
    (SELECT COUNT(*) FROM latest_subs WHERE status = 'inactive')::BIGINT as inactive_members,
    (SELECT COUNT(DISTINCT pt.member_id)
     FROM public.pt_subscriptions pt
     WHERE pt.status = 'active'
       AND pt.end_date >= v_today
       AND (_branch_id IS NULL OR pt.branch_id = _branch_id))::BIGINT as with_pt,
    (SELECT COUNT(*) FROM public.daily_pass_users d WHERE _branch_id IS NULL OR d.branch_id = _branch_id)::BIGINT as daily_pass_users,
    COALESCE(
      (SELECT SUM(p.amount)
       FROM public.payments p
       WHERE p.status = 'success'
         AND (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE >= v_month_start
         AND (_branch_id IS NULL OR p.branch_id = _branch_id)),
      0
    )::NUMERIC as monthly_revenue;
END;
$function$;