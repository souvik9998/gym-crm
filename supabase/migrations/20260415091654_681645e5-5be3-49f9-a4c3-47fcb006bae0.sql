-- Add description and is_active to event_pricing_options
ALTER TABLE public.event_pricing_options 
ADD COLUMN description TEXT,
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Add selection_mode to events
ALTER TABLE public.events 
ADD COLUMN selection_mode TEXT NOT NULL DEFAULT 'single';

-- Create junction table for multi-item registrations
CREATE TABLE public.event_registration_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  pricing_option_id UUID NOT NULL REFERENCES public.event_pricing_options(id) ON DELETE CASCADE,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_registration_items ENABLE ROW LEVEL SECURITY;

-- Admin/tenant members can manage registration items
CREATE POLICY "Admins can manage registration items"
ON public.event_registration_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    JOIN branches b ON b.id = e.branch_id
    JOIN tenant_members tm ON tm.tenant_id = b.tenant_id
    WHERE er.id = event_registration_items.registration_id
    AND tm.user_id = auth.uid()
  )
  OR is_super_admin(auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    JOIN branches b ON b.id = e.branch_id
    JOIN tenant_members tm ON tm.tenant_id = b.tenant_id
    WHERE er.id = event_registration_items.registration_id
    AND tm.user_id = auth.uid()
  )
  OR is_super_admin(auth.uid())
);

-- Public can insert registration items for published events
CREATE POLICY "Public can create registration items"
ON public.event_registration_items
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    WHERE er.id = event_registration_items.registration_id
    AND e.status = 'published'
  )
);

-- Public can view registration items
CREATE POLICY "Public can view registration items"
ON public.event_registration_items
FOR SELECT
TO anon
USING (true);

-- Index for fast lookups
CREATE INDEX idx_event_registration_items_registration_id ON public.event_registration_items(registration_id);
CREATE INDEX idx_event_registration_items_pricing_option_id ON public.event_registration_items(pricing_option_id);