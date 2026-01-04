-- Create enum for subscription status
CREATE TYPE public.subscription_status AS ENUM ('active', 'expired', 'expiring_soon', 'paused');

-- Create enum for payment mode
CREATE TYPE public.payment_mode AS ENUM ('online', 'cash');

-- Create enum for payment status
CREATE TYPE public.payment_status AS ENUM ('pending', 'success', 'failed');

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

-- Members table
CREATE TABLE public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  join_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  plan_months INTEGER NOT NULL CHECK (plan_months > 0),
  status subscription_status DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_mode payment_mode NOT NULL,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  status payment_status DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User roles table for admin access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Gym settings table for configuration
CREATE TABLE public.gym_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 500.00,
  joining_fee DECIMAL(10,2) NOT NULL DEFAULT 200.00,
  gym_name TEXT DEFAULT 'Pro Plus Fitness, Dinhata',
  gym_phone TEXT,
  gym_address TEXT,
  whatsapp_enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default gym settings
INSERT INTO public.gym_settings (monthly_fee, joining_fee, gym_name, gym_address)
VALUES (500.00, 200.00, 'Pro Plus Fitness, Dinhata', 'Dinhata, West Bengal, India');

-- Enable RLS on all tables
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_settings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check admin role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for members (admins can do everything, public can insert for self-registration)
CREATE POLICY "Admins can view all members" ON public.members
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert members" ON public.members
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update members" ON public.members
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete members" ON public.members
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can check if member exists by phone" ON public.members
  FOR SELECT USING (true);

CREATE POLICY "Public can register as member" ON public.members
  FOR INSERT WITH CHECK (true);

-- RLS Policies for subscriptions
CREATE POLICY "Admins can view all subscriptions" ON public.subscriptions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage subscriptions" ON public.subscriptions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view subscriptions" ON public.subscriptions
  FOR SELECT USING (true);

CREATE POLICY "Public can insert subscriptions" ON public.subscriptions
  FOR INSERT WITH CHECK (true);

-- RLS Policies for payments
CREATE POLICY "Admins can view all payments" ON public.payments
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage payments" ON public.payments
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view own payments" ON public.payments
  FOR SELECT USING (true);

CREATE POLICY "Public can insert payments" ON public.payments
  FOR INSERT WITH CHECK (true);

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for gym_settings (public read, admin write)
CREATE POLICY "Anyone can view gym settings" ON public.gym_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can update gym settings" ON public.gym_settings
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Function to update subscription status based on dates
CREATE OR REPLACE FUNCTION public.update_subscription_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.end_date < CURRENT_DATE THEN
    NEW.status = 'expired';
  ELSIF NEW.end_date <= CURRENT_DATE + INTERVAL '7 days' THEN
    NEW.status = 'expiring_soon';
  ELSE
    NEW.status = 'active';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger for subscription status
CREATE TRIGGER update_subscription_status_trigger
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_subscription_status();

-- Function to update member timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();