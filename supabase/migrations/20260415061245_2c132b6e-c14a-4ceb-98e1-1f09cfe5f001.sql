ALTER TABLE public.staff_permissions 
ADD COLUMN IF NOT EXISTS can_access_attendance BOOLEAN NOT NULL DEFAULT true;