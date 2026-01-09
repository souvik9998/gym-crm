-- Create table for daily pass users (separate from members)
CREATE TABLE public.daily_pass_users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    gender TEXT,
    photo_id_type TEXT,
    photo_id_number TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for daily pass subscriptions
CREATE TABLE public.daily_pass_subscriptions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    daily_pass_user_id UUID NOT NULL REFERENCES public.daily_pass_users(id) ON DELETE CASCADE,
    package_id UUID REFERENCES public.custom_packages(id),
    package_name TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    price NUMERIC NOT NULL,
    personal_trainer_id UUID REFERENCES public.personal_trainers(id),
    trainer_fee NUMERIC DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.daily_pass_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_pass_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily_pass_users
CREATE POLICY "Admins can manage daily pass users" 
ON public.daily_pass_users 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view daily pass users" 
ON public.daily_pass_users 
FOR SELECT 
USING (true);

CREATE POLICY "Public can insert daily pass users" 
ON public.daily_pass_users 
FOR INSERT 
WITH CHECK (true);

-- RLS Policies for daily_pass_subscriptions
CREATE POLICY "Admins can manage daily pass subscriptions" 
ON public.daily_pass_subscriptions 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view daily pass subscriptions" 
ON public.daily_pass_subscriptions 
FOR SELECT 
USING (true);

CREATE POLICY "Public can insert daily pass subscriptions" 
ON public.daily_pass_subscriptions 
FOR INSERT 
WITH CHECK (true);

-- Add daily_pass_user_id to payments table for linking payments to daily pass users
ALTER TABLE public.payments 
ADD COLUMN daily_pass_user_id UUID REFERENCES public.daily_pass_users(id),
ADD COLUMN daily_pass_subscription_id UUID REFERENCES public.daily_pass_subscriptions(id);

-- Create index for better query performance
CREATE INDEX idx_daily_pass_subscriptions_user_id ON public.daily_pass_subscriptions(daily_pass_user_id);
CREATE INDEX idx_daily_pass_subscriptions_status ON public.daily_pass_subscriptions(status);
CREATE INDEX idx_daily_pass_users_phone ON public.daily_pass_users(phone);
CREATE INDEX idx_payments_daily_pass_user_id ON public.payments(daily_pass_user_id);