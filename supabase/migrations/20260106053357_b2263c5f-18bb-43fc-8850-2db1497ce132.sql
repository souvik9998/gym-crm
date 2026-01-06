-- Create personal_trainers table
CREATE TABLE public.personal_trainers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  specialization TEXT,
  monthly_fee NUMERIC NOT NULL DEFAULT 500,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.personal_trainers ENABLE ROW LEVEL SECURITY;

-- RLS policies for personal_trainers
CREATE POLICY "Anyone can view active trainers" 
ON public.personal_trainers 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage trainers" 
ON public.personal_trainers 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create custom_packages table for daily/custom day memberships
CREATE TABLE public.custom_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_packages ENABLE ROW LEVEL SECURITY;

-- RLS policies for custom_packages
CREATE POLICY "Anyone can view active packages" 
ON public.custom_packages 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage packages" 
ON public.custom_packages 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create member_details table for additional member information
CREATE TABLE public.member_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  photo_id_type TEXT, -- 'aadhaar', 'pan', 'voter'
  photo_id_number TEXT,
  address TEXT,
  gender TEXT, -- 'male', 'female', 'other'
  personal_trainer_id UUID REFERENCES public.personal_trainers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(member_id)
);

-- Enable RLS
ALTER TABLE public.member_details ENABLE ROW LEVEL SECURITY;

-- RLS policies for member_details
CREATE POLICY "Public can insert member details" 
ON public.member_details 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can view member details" 
ON public.member_details 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage member details" 
ON public.member_details 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trainer_fee column to subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN personal_trainer_id UUID REFERENCES public.personal_trainers(id),
ADD COLUMN trainer_fee NUMERIC DEFAULT 0,
ADD COLUMN is_custom_package BOOLEAN DEFAULT false,
ADD COLUMN custom_days INTEGER;

-- Add monthly_packages column to gym_settings for configurable month options
ALTER TABLE public.gym_settings 
ADD COLUMN monthly_packages INTEGER[] DEFAULT ARRAY[1, 3, 6, 12];

-- Create triggers for updated_at
CREATE TRIGGER update_personal_trainers_updated_at
BEFORE UPDATE ON public.personal_trainers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_custom_packages_updated_at
BEFORE UPDATE ON public.custom_packages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_member_details_updated_at
BEFORE UPDATE ON public.member_details
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default custom packages
INSERT INTO public.custom_packages (name, duration_days, price) VALUES
('1 Day Pass', 1, 100),
('1 Week Pass', 7, 300),
('15 Days Pass', 15, 400);