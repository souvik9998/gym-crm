ALTER TABLE public.staff_permissions 
ADD COLUMN can_manage_events BOOLEAN NOT NULL DEFAULT false;