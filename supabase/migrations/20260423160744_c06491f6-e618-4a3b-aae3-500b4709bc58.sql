ALTER TABLE public.member_exercise_items
ADD COLUMN IF NOT EXISTS weight_value numeric,
ADD COLUMN IF NOT EXISTS weight_unit text;