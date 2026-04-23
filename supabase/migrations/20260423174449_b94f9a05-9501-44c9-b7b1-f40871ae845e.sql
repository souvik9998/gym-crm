ALTER TABLE public.gym_settings
ADD COLUMN IF NOT EXISTS invoice_brand_name TEXT,
ADD COLUMN IF NOT EXISTS invoice_logo_url TEXT,
ADD COLUMN IF NOT EXISTS invoice_palette JSONB NOT NULL DEFAULT '{"header":"#166534","accent":"#dcfce7","text":"#052e16"}'::jsonb;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS invoice_brand_name TEXT,
ADD COLUMN IF NOT EXISTS invoice_logo_url TEXT,
ADD COLUMN IF NOT EXISTS invoice_palette JSONB NOT NULL DEFAULT '{"header":"#166534","accent":"#dcfce7","text":"#052e16"}'::jsonb;