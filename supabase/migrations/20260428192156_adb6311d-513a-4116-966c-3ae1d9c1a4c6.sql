-- Add 'expiring_today' value to subscription_status enum
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'expiring_today' BEFORE 'expiring_soon';