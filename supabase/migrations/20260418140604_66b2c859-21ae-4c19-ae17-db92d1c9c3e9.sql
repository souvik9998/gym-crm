-- Add granular view-only permission for settings
ALTER TABLE public.staff_permissions
ADD COLUMN IF NOT EXISTS can_view_settings boolean NOT NULL DEFAULT false;

-- Backfill: anyone who already has edit access should also have view access
UPDATE public.staff_permissions
SET can_view_settings = true
WHERE can_change_settings = true AND can_view_settings = false;