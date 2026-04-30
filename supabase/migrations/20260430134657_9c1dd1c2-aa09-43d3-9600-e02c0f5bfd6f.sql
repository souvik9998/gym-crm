DROP FUNCTION IF EXISTS public.get_invoice_by_public_token(text);

CREATE OR REPLACE FUNCTION public.get_invoice_by_public_token(_token text)
 RETURNS TABLE(id uuid, invoice_number text, public_token text, customer_name text, customer_phone text, gym_name text, gym_address text, gym_phone text, gym_email text, gym_gst text, branch_name text, amount numeric, subtotal numeric, discount numeric, tax numeric, gym_fee numeric, joining_fee numeric, trainer_fee numeric, package_name text, start_date date, end_date date, payment_mode text, payment_date timestamp with time zone, transaction_id text, footer_message text, invoice_terms text, invoice_brand_name text, invoice_logo_url text, invoice_palette jsonb, created_at timestamp with time zone, member_id uuid, payment_id uuid, has_pdf boolean, gym_start_date date, gym_end_date date, pt_start_date date, pt_end_date date, pt_trainer_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    i.id, i.invoice_number, i.public_token,
    i.customer_name, i.customer_phone,
    i.gym_name, i.gym_address, i.gym_phone, i.gym_email, i.gym_gst,
    i.branch_name,
    i.amount, i.subtotal, i.discount, i.tax,
    i.gym_fee, i.joining_fee, i.trainer_fee,
    i.package_name, i.start_date, i.end_date,
    i.payment_mode, i.payment_date, i.transaction_id,
    i.footer_message, i.invoice_terms,
    i.invoice_brand_name, i.invoice_logo_url, i.invoice_palette,
    i.created_at, i.member_id, i.payment_id,
    (i.pdf_storage_path IS NOT NULL OR i.pdf_url IS NOT NULL) AS has_pdf,
    i.gym_start_date, i.gym_end_date, i.pt_start_date, i.pt_end_date, i.pt_trainer_name
  FROM public.invoices i
  WHERE i.public_token = _token
  LIMIT 1
$function$;

GRANT EXECUTE ON FUNCTION public.get_invoice_by_public_token(text) TO anon, authenticated;