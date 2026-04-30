ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS gym_start_date date,
  ADD COLUMN IF NOT EXISTS gym_end_date date,
  ADD COLUMN IF NOT EXISTS pt_start_date date,
  ADD COLUMN IF NOT EXISTS pt_end_date date,
  ADD COLUMN IF NOT EXISTS pt_trainer_name text;