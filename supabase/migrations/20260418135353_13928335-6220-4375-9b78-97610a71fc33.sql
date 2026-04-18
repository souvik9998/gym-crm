-- Add can_view_settings permission column for view-only settings access
ALTER TABLE public.staff_permissions
ADD COLUMN IF NOT EXISTS can_view_settings BOOLEAN NOT NULL DEFAULT false;

-- Backfill: anyone who can edit settings should also be able to view them
UPDATE public.staff_permissions
SET can_view_settings = true
WHERE can_change_settings = true AND can_view_settings = false;