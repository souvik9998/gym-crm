-- Drop existing unique constraint on monthly_packages (if exists)
ALTER TABLE public.monthly_packages DROP CONSTRAINT IF EXISTS unique_months;

-- Create new composite unique constraint for monthly_packages (branch_id + months)
ALTER TABLE public.monthly_packages ADD CONSTRAINT unique_branch_months UNIQUE (branch_id, months);

-- Create composite unique constraint for custom_packages (branch_id + duration_days)
ALTER TABLE public.custom_packages ADD CONSTRAINT unique_branch_duration_days UNIQUE (branch_id, duration_days);