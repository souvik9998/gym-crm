-- Add payment category fields to personal_trainers table
ALTER TABLE public.personal_trainers 
ADD COLUMN IF NOT EXISTS payment_category text NOT NULL DEFAULT 'monthly_percentage',
ADD COLUMN IF NOT EXISTS percentage_fee numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS session_fee numeric NOT NULL DEFAULT 0;

-- Add comment for payment_category values
COMMENT ON COLUMN public.personal_trainers.payment_category IS 'Payment category: monthly_percentage (monthly + percentage) or session_basis (per session fee)';

-- Create ledger_entries table for profit/loss tracking
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type text NOT NULL, -- 'income' or 'expense'
  category text NOT NULL, -- Category of the entry
  description text NOT NULL,
  amount numeric NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- References for auto-generated entries
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  daily_pass_user_id uuid REFERENCES public.daily_pass_users(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  trainer_id uuid REFERENCES public.personal_trainers(id) ON DELETE SET NULL,
  pt_subscription_id uuid REFERENCES public.pt_subscriptions(id) ON DELETE SET NULL,
  
  -- Metadata
  notes text,
  is_auto_generated boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS on ledger_entries
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for ledger_entries
CREATE POLICY "Admins can manage ledger entries"
ON public.ledger_entries
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert ledger entries"
ON public.ledger_entries
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can view ledger entries"
ON public.ledger_entries
FOR SELECT
USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_date ON public.ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_type ON public.ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_category ON public.ledger_entries(category);

-- Create trigger for updated_at
CREATE TRIGGER update_ledger_entries_updated_at
BEFORE UPDATE ON public.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();