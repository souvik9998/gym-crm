-- Fix Ayush phone typo so personal_trainers and staff link correctly
UPDATE public.personal_trainers
SET phone = '7797746585', updated_at = now()
WHERE id = 'ba936cf9-20e9-4616-bdc8-1b5b7ee58a48'
  AND phone = '7797746584';