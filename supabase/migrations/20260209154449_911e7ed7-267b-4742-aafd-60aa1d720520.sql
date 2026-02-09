-- Create razorpay_credentials table for per-gym Razorpay credential storage
CREATE TABLE public.razorpay_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  encrypted_key_secret TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(tenant_id)
);

-- Enable RLS - ONLY service_role can access this table
ALTER TABLE public.razorpay_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on razorpay_credentials"
ON public.razorpay_credentials FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Trigger to auto-update updated_at
CREATE TRIGGER update_razorpay_credentials_updated_at
BEFORE UPDATE ON public.razorpay_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();