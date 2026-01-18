-- Create branches table
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on branches
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- RLS policies for branches
CREATE POLICY "Admins can manage branches"
  ON public.branches FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active branches"
  ON public.branches FOR SELECT
  USING (is_active = true);

-- Add branch_id to members table
ALTER TABLE public.members ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to daily_pass_users table
ALTER TABLE public.daily_pass_users ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to subscriptions table
ALTER TABLE public.subscriptions ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to daily_pass_subscriptions table
ALTER TABLE public.daily_pass_subscriptions ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to payments table
ALTER TABLE public.payments ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to ledger_entries table
ALTER TABLE public.ledger_entries ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to pt_subscriptions table
ALTER TABLE public.pt_subscriptions ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to personal_trainers table
ALTER TABLE public.personal_trainers ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to user_activity_logs table
ALTER TABLE public.user_activity_logs ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to admin_activity_logs table
ALTER TABLE public.admin_activity_logs ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to whatsapp_notifications table
ALTER TABLE public.whatsapp_notifications ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to gym_settings (for branch-specific settings)
ALTER TABLE public.gym_settings ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to monthly_packages table
ALTER TABLE public.monthly_packages ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to custom_packages table
ALTER TABLE public.custom_packages ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Create indexes for better query performance
CREATE INDEX idx_members_branch_id ON public.members(branch_id);
CREATE INDEX idx_subscriptions_branch_id ON public.subscriptions(branch_id);
CREATE INDEX idx_payments_branch_id ON public.payments(branch_id);
CREATE INDEX idx_ledger_entries_branch_id ON public.ledger_entries(branch_id);
CREATE INDEX idx_daily_pass_users_branch_id ON public.daily_pass_users(branch_id);
CREATE INDEX idx_personal_trainers_branch_id ON public.personal_trainers(branch_id);

-- Create trigger for updated_at on branches
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();