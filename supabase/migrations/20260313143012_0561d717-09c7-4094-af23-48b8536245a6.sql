ALTER TABLE public.gym_settings 
  ADD COLUMN IF NOT EXISTS invoice_tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_terms text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invoice_show_gst boolean NOT NULL DEFAULT true;