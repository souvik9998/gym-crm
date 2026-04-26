-- Allow public (anonymous) read access to gym holidays so the shared/public calendar can display them
CREATE POLICY "Public can view gym holidays"
ON public.gym_holidays
FOR SELECT
TO anon, authenticated
USING (true);