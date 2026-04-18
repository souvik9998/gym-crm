-- Revert: Remove can_view_settings column from staff_permissions
ALTER TABLE public.staff_permissions DROP COLUMN IF EXISTS can_view_settings;