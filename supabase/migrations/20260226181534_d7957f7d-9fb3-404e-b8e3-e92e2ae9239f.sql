
-- Add public read-only RLS policies for registration data
CREATE POLICY "public_read_monthly_packages" ON public.monthly_packages
  FOR SELECT USING (is_active = true);

CREATE POLICY "public_read_custom_packages" ON public.custom_packages
  FOR SELECT USING (is_active = true);

CREATE POLICY "public_read_personal_trainers" ON public.personal_trainers
  FOR SELECT USING (is_active = true);
