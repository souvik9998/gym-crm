
-- Step 1: Insert pt_subscriptions for members in time_slot_members who have no active PT subscription
INSERT INTO public.pt_subscriptions (member_id, branch_id, personal_trainer_id, time_slot_id, start_date, end_date, status, monthly_fee, total_fee)
SELECT DISTINCT ON (tsm.member_id)
  tsm.member_id,
  tts.branch_id,
  pt.id as personal_trainer_id,
  tsm.time_slot_id,
  CURRENT_DATE as start_date,
  (CURRENT_DATE + INTERVAL '30 days')::DATE as end_date,
  'active' as status,
  0 as monthly_fee,
  0 as total_fee
FROM public.time_slot_members tsm
JOIN public.trainer_time_slots tts ON tsm.time_slot_id = tts.id
JOIN public.staff s ON tts.trainer_id = s.id
JOIN public.personal_trainers pt ON s.phone = pt.phone AND pt.branch_id = tts.branch_id AND pt.is_active = true
WHERE NOT EXISTS (
  SELECT 1 FROM public.pt_subscriptions ps
  WHERE ps.member_id = tsm.member_id
    AND ps.branch_id = tts.branch_id
    AND ps.status = 'active'
    AND ps.end_date >= CURRENT_DATE
)
ORDER BY tsm.member_id, tsm.created_at DESC;

-- Step 2: Insert time_slot_members for PT subscriptions that have a time_slot_id but no corresponding entry
INSERT INTO public.time_slot_members (member_id, time_slot_id)
SELECT DISTINCT ps.member_id, ps.time_slot_id
FROM public.pt_subscriptions ps
WHERE ps.time_slot_id IS NOT NULL
  AND ps.status = 'active'
  AND ps.end_date >= CURRENT_DATE
  AND NOT EXISTS (
    SELECT 1 FROM public.time_slot_members tsm
    WHERE tsm.member_id = ps.member_id
      AND tsm.time_slot_id = ps.time_slot_id
  );
