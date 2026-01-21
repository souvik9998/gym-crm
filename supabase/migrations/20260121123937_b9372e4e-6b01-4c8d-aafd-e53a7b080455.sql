-- Add separate permission columns for ledger and payment logs
-- Replace the single can_access_financials with two specific permissions

ALTER TABLE public.staff_permissions 
ADD COLUMN can_access_ledger boolean NOT NULL DEFAULT false;

ALTER TABLE public.staff_permissions 
ADD COLUMN can_access_payments boolean NOT NULL DEFAULT false;

-- Migrate existing can_access_financials values to the new columns
UPDATE public.staff_permissions
SET 
  can_access_ledger = can_access_financials,
  can_access_payments = can_access_financials;

-- Drop the old column
ALTER TABLE public.staff_permissions
DROP COLUMN can_access_financials;