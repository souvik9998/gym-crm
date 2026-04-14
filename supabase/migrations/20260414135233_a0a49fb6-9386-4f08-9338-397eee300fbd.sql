
-- Replace overly permissive insert policy with a scoped one
DROP POLICY IF EXISTS "public_insert_coupon_usage" ON public.coupon_usage;

CREATE POLICY "public_insert_coupon_usage"
ON public.coupon_usage FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.coupons c
    WHERE c.id = coupon_usage.coupon_id
    AND c.is_active = true
    AND c.start_date <= CURRENT_DATE
    AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
  )
);
