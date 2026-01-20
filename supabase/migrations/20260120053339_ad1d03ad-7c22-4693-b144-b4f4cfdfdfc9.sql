-- Update custom_packages: Add composite unique constraint with branch_id
-- First check if old constraint exists and drop it
ALTER TABLE public.custom_packages DROP CONSTRAINT IF EXISTS unique_duration_days;

-- Add new unique constraint on (duration_days, branch_id)
ALTER TABLE public.custom_packages ADD CONSTRAINT custom_packages_duration_days_branch_unique UNIQUE (duration_days, branch_id);

-- Update monthly_packages: Add composite unique constraint with branch_id  
-- First check if old constraint exists
ALTER TABLE public.monthly_packages DROP CONSTRAINT IF EXISTS unique_months;

-- Add new unique constraint on (months, branch_id)
ALTER TABLE public.monthly_packages ADD CONSTRAINT monthly_packages_months_branch_unique UNIQUE (months, branch_id);

-- Update personal_trainers: Add composite unique constraint on phone + branch_id
ALTER TABLE public.personal_trainers ADD CONSTRAINT personal_trainers_phone_branch_unique UNIQUE (phone, branch_id);

-- Update the daily_pass_user that has null branch_id to a default branch
-- First get the default branch id
UPDATE public.daily_pass_users 
SET branch_id = (SELECT id FROM public.branches WHERE is_default = true LIMIT 1)
WHERE branch_id IS NULL;