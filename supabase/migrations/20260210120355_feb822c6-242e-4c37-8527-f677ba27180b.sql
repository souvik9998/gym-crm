-- Allow the same auth_user_id to be used by multiple staff records
-- (same person registered in different branches)
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_auth_user_id_key;
DROP INDEX IF EXISTS staff_auth_user_id_key;
