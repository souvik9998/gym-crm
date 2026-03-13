
-- Create invoices table to store invoice records
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  daily_pass_user_id uuid REFERENCES public.daily_pass_users(id) ON DELETE SET NULL,
  
  -- Invoice data snapshot
  customer_name text NOT NULL,
  customer_phone text,
  gym_name text NOT NULL,
  gym_address text,
  gym_phone text,
  gym_email text,
  gym_gst text,
  branch_name text,
  
  -- Financial details
  amount numeric NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  gym_fee numeric NOT NULL DEFAULT 0,
  joining_fee numeric NOT NULL DEFAULT 0,
  trainer_fee numeric NOT NULL DEFAULT 0,
  
  -- Package info
  package_name text,
  start_date date,
  end_date date,
  
  -- Payment info
  payment_mode text,
  payment_date timestamptz,
  transaction_id text,
  
  -- PDF storage
  pdf_url text,
  
  -- Footer
  footer_message text,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE UNIQUE INDEX idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX idx_invoices_branch_id ON public.invoices(branch_id);
CREATE INDEX idx_invoices_payment_id ON public.invoices(payment_id);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Public read access by invoice number (for the public invoice page)
CREATE POLICY "public_read_invoices_by_id"
ON public.invoices
FOR SELECT
TO public
USING (true);

-- Service role full access
CREATE POLICY "service_role_full_access_invoices"
ON public.invoices
FOR ALL
TO public
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Tenant members manage their invoices
CREATE POLICY "tenant_members_manage_invoices"
ON public.invoices
FOR ALL
TO public
USING (EXISTS (
  SELECT 1 FROM branches b
  WHERE b.id = invoices.branch_id
    AND b.tenant_id IS NOT NULL
    AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM branches b
  WHERE b.id = invoices.branch_id
    AND b.tenant_id IS NOT NULL
    AND user_belongs_to_tenant(auth.uid(), b.tenant_id)
));

-- Super admin full access
CREATE POLICY "super_admin_full_access_invoices"
ON public.invoices
FOR ALL
TO public
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Add invoice settings columns to gym_settings
ALTER TABLE public.gym_settings 
ADD COLUMN IF NOT EXISTS invoice_prefix text NOT NULL DEFAULT 'INV',
ADD COLUMN IF NOT EXISTS invoice_footer_message text DEFAULT 'Thank you for choosing our gym!',
ADD COLUMN IF NOT EXISTS gym_email text,
ADD COLUMN IF NOT EXISTS gym_gst text;

-- Sequence for invoice numbering per branch
CREATE OR REPLACE FUNCTION public.generate_invoice_number(_branch_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix text;
  v_count bigint;
  v_number text;
BEGIN
  -- Get prefix from gym_settings
  SELECT COALESCE(invoice_prefix, 'INV') INTO v_prefix
  FROM public.gym_settings
  WHERE branch_id = _branch_id
  LIMIT 1;
  
  IF v_prefix IS NULL THEN
    v_prefix := 'INV';
  END IF;
  
  -- Count existing invoices for this branch + 1
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.invoices
  WHERE branch_id = _branch_id;
  
  v_number := v_prefix || '-' || LPAD(v_count::text, 5, '0');
  
  RETURN v_number;
END;
$$;
