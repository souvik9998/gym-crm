-- Make member_id nullable in payments table to support daily pass payments
ALTER TABLE public.payments ALTER COLUMN member_id DROP NOT NULL;