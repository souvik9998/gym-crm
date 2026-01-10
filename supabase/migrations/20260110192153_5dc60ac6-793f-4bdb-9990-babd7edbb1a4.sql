-- Add monthly_salary column for trainer's actual salary (different from member's monthly fee)
ALTER TABLE public.personal_trainers 
ADD COLUMN monthly_salary numeric NOT NULL DEFAULT 0;