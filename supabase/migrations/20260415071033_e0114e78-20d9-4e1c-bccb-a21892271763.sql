
-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  banner_image_url TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  event_end_date TIMESTAMPTZ,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  whatsapp_notify_on_register BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event pricing options
CREATE TABLE public.event_pricing_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  capacity_limit INTEGER,
  slots_filled INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event custom fields
CREATE TABLE public.event_custom_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'select')),
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB, -- for select type: ["Option A", "Option B"]
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event registrations
CREATE TABLE public.event_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  pricing_option_id UUID REFERENCES public.event_pricing_options(id),
  member_id UUID REFERENCES public.members(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'success', 'failed')),
  payment_id UUID REFERENCES public.payments(id),
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  custom_field_responses JSONB DEFAULT '{}'::jsonb,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_events_branch_id ON public.events(branch_id);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_event_date ON public.events(event_date);
CREATE INDEX idx_event_registrations_event_id ON public.event_registrations(event_id);
CREATE INDEX idx_event_registrations_phone ON public.event_registrations(phone);
CREATE INDEX idx_event_pricing_options_event_id ON public.event_pricing_options(event_id);
CREATE INDEX idx_event_custom_fields_event_id ON public.event_custom_fields(event_id);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_pricing_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events
CREATE POLICY "Admins can manage events for their tenant branches"
  ON public.events FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.branches b
      JOIN public.tenant_members tm ON tm.tenant_id = b.tenant_id
      WHERE b.id = events.branch_id AND tm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.branches b
      JOIN public.tenant_members tm ON tm.tenant_id = b.tenant_id
      WHERE b.id = events.branch_id AND tm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Public can view published events"
  ON public.events FOR SELECT TO anon
  USING (status = 'published');

-- RLS for pricing options
CREATE POLICY "Admins can manage pricing options"
  ON public.event_pricing_options FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.branches b ON b.id = e.branch_id
      JOIN public.tenant_members tm ON tm.tenant_id = b.tenant_id
      WHERE e.id = event_pricing_options.event_id AND tm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.branches b ON b.id = e.branch_id
      JOIN public.tenant_members tm ON tm.tenant_id = b.tenant_id
      WHERE e.id = event_pricing_options.event_id AND tm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Public can view pricing options for published events"
  ON public.event_pricing_options FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_pricing_options.event_id AND e.status = 'published'
    )
  );

-- RLS for custom fields
CREATE POLICY "Admins can manage custom fields"
  ON public.event_custom_fields FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.branches b ON b.id = e.branch_id
      JOIN public.tenant_members tm ON tm.tenant_id = b.tenant_id
      WHERE e.id = event_custom_fields.event_id AND tm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.branches b ON b.id = e.branch_id
      JOIN public.tenant_members tm ON tm.tenant_id = b.tenant_id
      WHERE e.id = event_custom_fields.event_id AND tm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Public can view custom fields for published events"
  ON public.event_custom_fields FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_custom_fields.event_id AND e.status = 'published'
    )
  );

-- RLS for registrations
CREATE POLICY "Admins can view registrations"
  ON public.event_registrations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.branches b ON b.id = e.branch_id
      JOIN public.tenant_members tm ON tm.tenant_id = b.tenant_id
      WHERE e.id = event_registrations.event_id AND tm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can manage registrations"
  ON public.event_registrations FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.branches b ON b.id = e.branch_id
      JOIN public.tenant_members tm ON tm.tenant_id = b.tenant_id
      WHERE e.id = event_registrations.event_id AND tm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Public can create registrations for published events"
  ON public.event_registrations FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_registrations.event_id AND e.status = 'published'
    )
  );

CREATE POLICY "Public can view own registrations by phone"
  ON public.event_registrations FOR SELECT TO anon
  USING (true);

-- Enable realtime for registrations
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_registrations;

-- Triggers for updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_event_registrations_updated_at
  BEFORE UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
