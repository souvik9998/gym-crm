-- Add payment_type to payments to track what the payment is for
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'gym_membership';

-- Add pt_start_date and pt_end_date to subscriptions for separate PT tracking
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pt_start_date DATE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pt_end_date DATE;

-- Create a separate table for PT subscriptions (to allow independent PT management)
CREATE TABLE IF NOT EXISTS public.pt_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  personal_trainer_id UUID NOT NULL REFERENCES public.personal_trainers(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  monthly_fee NUMERIC NOT NULL DEFAULT 0,
  total_fee NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on pt_subscriptions
ALTER TABLE public.pt_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for pt_subscriptions
CREATE POLICY "Admins can manage PT subscriptions" 
ON public.pt_subscriptions 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view PT subscriptions" 
ON public.pt_subscriptions 
FOR SELECT 
USING (true);

CREATE POLICY "Public can insert PT subscriptions" 
ON public.pt_subscriptions 
FOR INSERT 
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pt_subscriptions_member_id ON public.pt_subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_pt_subscriptions_trainer_id ON public.pt_subscriptions(personal_trainer_id);

-- Comment for payment_type values
COMMENT ON COLUMN public.payments.payment_type IS 'Values: gym_membership, pt_only, gym_and_pt';