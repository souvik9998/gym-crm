-- Drop old constraint on custom_packages that doesn't include branch_id
ALTER TABLE public.custom_packages DROP CONSTRAINT IF EXISTS unique_duration_days;

-- Add unique constraint for daily_pass_users (phone + branch_id)
ALTER TABLE public.daily_pass_users ADD CONSTRAINT daily_pass_users_phone_branch_unique UNIQUE (phone, branch_id);