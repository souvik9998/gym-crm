-- Add 'inactive' to subscription_status enum if not exists
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'inactive';