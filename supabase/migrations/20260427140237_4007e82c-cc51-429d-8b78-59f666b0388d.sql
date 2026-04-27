
-- 1. Add public_token + pdf_storage_path columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_token text,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text;

-- Backfill existing rows with cryptographically random tokens (32 hex chars from gen_random_bytes)
UPDATE public.invoices
SET public_token = encode(gen_random_bytes(24), 'hex')
WHERE public_token IS NULL;

-- Enforce NOT NULL + UNIQUE going forward
ALTER TABLE public.invoices
  ALTER COLUMN public_token SET NOT NULL;

ALTER TABLE public.invoices
  ALTER COLUMN public_token SET DEFAULT encode(gen_random_bytes(24), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token ON public.invoices (public_token);

-- 2. Tighten RLS: drop the wide-open public read policy
DROP POLICY IF EXISTS "public_read_invoices_by_id" ON public.invoices;

-- (Keep service_role, super_admin, tenant_members policies as-is — they remain.)

-- 3. Public lookup function: returns invoice only when caller provides the correct token.
--    SECURITY DEFINER so it bypasses RLS, but only emits a single row matching the secret token.
CREATE OR REPLACE FUNCTION public.get_invoice_by_public_token(_token text)
RETURNS TABLE (
  id uuid,
  invoice_number text,
  public_token text,
  customer_name text,
  customer_phone text,
  gym_name text,
  gym_address text,
  gym_phone text,
  gym_email text,
  gym_gst text,
  branch_name text,
  amount numeric,
  subtotal numeric,
  discount numeric,
  tax numeric,
  gym_fee numeric,
  joining_fee numeric,
  trainer_fee numeric,
  package_name text,
  start_date date,
  end_date date,
  payment_mode text,
  payment_date timestamptz,
  transaction_id text,
  footer_message text,
  invoice_terms text,
  invoice_brand_name text,
  invoice_logo_url text,
  invoice_palette jsonb,
  created_at timestamptz,
  member_id uuid,
  payment_id uuid,
  has_pdf boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.invoice_number,
    i.public_token,
    i.customer_name,
    i.customer_phone,
    i.gym_name,
    i.gym_address,
    i.gym_phone,
    i.gym_email,
    i.gym_gst,
    i.branch_name,
    i.amount,
    i.subtotal,
    i.discount,
    i.tax,
    i.gym_fee,
    i.joining_fee,
    i.trainer_fee,
    i.package_name,
    i.start_date,
    i.end_date,
    i.payment_mode,
    i.payment_date,
    i.transaction_id,
    i.footer_message,
    i.invoice_terms,
    i.invoice_brand_name,
    i.invoice_logo_url,
    i.invoice_palette,
    i.created_at,
    i.member_id,
    i.payment_id,
    (i.pdf_storage_path IS NOT NULL OR i.pdf_url IS NOT NULL) AS has_pdf
  FROM public.invoices i
  WHERE i.public_token = _token
    AND _token IS NOT NULL
    AND length(_token) >= 32
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_by_public_token(text) TO anon, authenticated;

-- 4. Make the invoices bucket private. PDFs will be served through signed URLs only.
UPDATE storage.buckets SET public = false WHERE id = 'invoices';

-- 5. Drop any prior wide-open public SELECT policies on invoices bucket objects.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT polname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
      AND p.polname IN (
        'Invoices are publicly accessible',
        'Public read access invoices',
        'Anyone can read invoices',
        'invoices_public_read',
        'Public Access invoices'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.polname);
  END LOOP;
END $$;
