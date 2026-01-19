-- Drop the existing phone-only unique constraint
ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_phone_key;

-- Create a new unique constraint on phone + branch_id combination
-- This allows the same phone number to register in different branches
ALTER TABLE public.members ADD CONSTRAINT members_phone_branch_unique UNIQUE (phone, branch_id);