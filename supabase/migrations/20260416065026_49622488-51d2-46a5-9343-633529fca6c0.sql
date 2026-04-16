
-- Staff can SELECT events for their assigned branches
CREATE POLICY "staff_view_events"
  ON public.events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sba.branch_id = events.branch_id
        AND sp.can_manage_events = true
    )
  );

-- Staff can manage events (INSERT/UPDATE/DELETE) for their assigned branches
CREATE POLICY "staff_manage_events"
  ON public.events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff s
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sba.branch_id = events.branch_id
        AND sp.can_manage_events = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM staff s
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sba.branch_id = events.branch_id
        AND sp.can_manage_events = true
    )
  );

-- Staff can view event pricing options for events they can access
CREATE POLICY "staff_view_event_pricing_options"
  ON public.event_pricing_options
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN staff s ON true
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id AND sba.branch_id = e.branch_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE e.id = event_pricing_options.event_id
        AND s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_events = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN staff s ON true
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id AND sba.branch_id = e.branch_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE e.id = event_pricing_options.event_id
        AND s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_events = true
    )
  );

-- Staff can view event custom fields for events they can access
CREATE POLICY "staff_view_event_custom_fields"
  ON public.event_custom_fields
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN staff s ON true
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id AND sba.branch_id = e.branch_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE e.id = event_custom_fields.event_id
        AND s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_events = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN staff s ON true
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id AND sba.branch_id = e.branch_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE e.id = event_custom_fields.event_id
        AND s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_events = true
    )
  );

-- Staff can view event registrations for events they can access
CREATE POLICY "staff_view_event_registrations"
  ON public.event_registrations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN staff s ON true
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id AND sba.branch_id = e.branch_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE e.id = event_registrations.event_id
        AND s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_events = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN staff s ON true
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id AND sba.branch_id = e.branch_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE e.id = event_registrations.event_id
        AND s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_events = true
    )
  );

-- Staff can view event registration items for events they can access  
CREATE POLICY "staff_view_event_registration_items"
  ON public.event_registration_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM event_registrations er
      JOIN events e ON e.id = er.event_id
      JOIN staff s ON true
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id AND sba.branch_id = e.branch_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE er.id = event_registration_items.registration_id
        AND s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_events = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM event_registrations er
      JOIN events e ON e.id = er.event_id
      JOIN staff s ON true
      JOIN staff_branch_assignments sba ON s.id = sba.staff_id AND sba.branch_id = e.branch_id
      JOIN staff_permissions sp ON sp.staff_id = s.id
      WHERE er.id = event_registration_items.registration_id
        AND s.auth_user_id = auth.uid()
        AND s.is_active = true
        AND sp.can_manage_events = true
    )
  );
