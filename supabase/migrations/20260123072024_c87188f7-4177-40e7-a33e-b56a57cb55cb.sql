-- Add deleted_at column for soft delete
ALTER TABLE public.branches 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for efficient filtering of non-deleted branches
CREATE INDEX idx_branches_deleted_at ON public.branches(deleted_at);

-- Update RLS policy to allow admins to see all branches including deleted ones
DROP POLICY IF EXISTS "Anyone can view active branches" ON public.branches;

CREATE POLICY "Anyone can view active non-deleted branches" 
ON public.branches 
FOR SELECT 
USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY "Admins can view all branches including deleted" 
ON public.branches 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));