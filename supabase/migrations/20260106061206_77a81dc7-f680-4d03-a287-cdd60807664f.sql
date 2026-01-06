-- Create monthly_packages table with custom pricing per package
CREATE TABLE public.monthly_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  months INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  joining_fee NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_months UNIQUE (months)
);

-- Enable RLS
ALTER TABLE public.monthly_packages ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view active monthly packages" 
ON public.monthly_packages 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage monthly packages" 
ON public.monthly_packages 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_monthly_packages_updated_at
BEFORE UPDATE ON public.monthly_packages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add unique constraint on custom_packages for duration_days
ALTER TABLE public.custom_packages
ADD CONSTRAINT unique_duration_days UNIQUE (duration_days);

-- Insert default monthly packages with pricing
INSERT INTO public.monthly_packages (months, price, joining_fee) VALUES
  (1, 1000, 200),
  (3, 2500, 200),
  (6, 4500, 100),
  (12, 8000, 0)
ON CONFLICT (months) DO NOTHING;