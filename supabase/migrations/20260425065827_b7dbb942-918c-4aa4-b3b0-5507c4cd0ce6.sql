ALTER TABLE public.gym_settings
ADD COLUMN IF NOT EXISTS time_buckets jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.gym_settings.time_buckets IS 'Admin-configurable time-of-day filter chips. Array of {id, label, emoji, start_time, end_time, sort_order}. Empty array means defaults are used.';