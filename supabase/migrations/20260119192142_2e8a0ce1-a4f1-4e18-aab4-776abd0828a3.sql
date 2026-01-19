-- Add policy to allow inserting gym_settings for new branches
CREATE POLICY "Admins can insert gym settings"
ON public.gym_settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));