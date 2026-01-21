-- Drop the existing unique constraint on staff phone
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_phone_key;

-- Create a function to check phone uniqueness within a branch
CREATE OR REPLACE FUNCTION public.check_staff_phone_branch_uniqueness()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if any other staff with the same phone is already assigned to the same branch
  IF EXISTS (
    SELECT 1 
    FROM public.staff s
    JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.phone = (
      SELECT phone FROM public.staff WHERE id = NEW.staff_id
    )
    AND sba.branch_id = NEW.branch_id
    AND s.id != NEW.staff_id
  ) THEN
    RAISE EXCEPTION 'A staff member with this phone number already exists in this branch';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on staff_branch_assignments to enforce uniqueness per branch
DROP TRIGGER IF EXISTS check_staff_phone_branch_uniqueness_trigger ON public.staff_branch_assignments;

CREATE TRIGGER check_staff_phone_branch_uniqueness_trigger
BEFORE INSERT ON public.staff_branch_assignments
FOR EACH ROW
EXECUTE FUNCTION public.check_staff_phone_branch_uniqueness();