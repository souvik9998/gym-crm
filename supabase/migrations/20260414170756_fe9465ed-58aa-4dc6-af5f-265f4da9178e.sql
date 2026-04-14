ALTER TABLE public.pt_subscriptions 
ADD COLUMN time_slot_id uuid REFERENCES public.trainer_time_slots(id) ON DELETE SET NULL DEFAULT NULL;