-- Enhance whatsapp_notifications table with additional tracking fields
ALTER TABLE public.whatsapp_notifications
ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
ADD COLUMN IF NOT EXISTS recipient_name TEXT,
ADD COLUMN IF NOT EXISTS message_content TEXT;

-- Add daily_pass_user_id column (without foreign key constraint if table doesn't exist)
DO $$
BEGIN
  -- Check if column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'whatsapp_notifications' 
    AND column_name = 'daily_pass_user_id'
  ) THEN
    -- Add column without foreign key first
    ALTER TABLE public.whatsapp_notifications
    ADD COLUMN daily_pass_user_id UUID;
    
    -- Add foreign key constraint only if daily_pass_users table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'daily_pass_users'
    ) THEN
      ALTER TABLE public.whatsapp_notifications
      ADD CONSTRAINT whatsapp_notifications_daily_pass_user_id_fkey 
      FOREIGN KEY (daily_pass_user_id) 
      REFERENCES public.daily_pass_users(id) 
      ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Create index for admin tracking
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_admin_id ON public.whatsapp_notifications(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_is_manual ON public.whatsapp_notifications(is_manual);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_status ON public.whatsapp_notifications(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_sent_at_desc ON public.whatsapp_notifications(sent_at DESC);

-- Update comment for notification_type to include all types
COMMENT ON COLUMN public.whatsapp_notifications.notification_type IS 
'Message types: promotional, expiry_reminder, expired_reminder, payment_details, renewal, pt_extension, expiring_2days, expiring_today, manual, custom';

-- Make member_id nullable since we now support daily pass users
ALTER TABLE public.whatsapp_notifications
ALTER COLUMN member_id DROP NOT NULL;

-- Add check constraint to ensure at least one recipient identifier is set
-- This constraint will be added only if it doesn't already exist
-- Remove existing constraint if it exists first to avoid conflicts
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'whatsapp_notifications_recipient_check'
  ) THEN
    ALTER TABLE public.whatsapp_notifications
    DROP CONSTRAINT whatsapp_notifications_recipient_check;
  END IF;

  -- Add the constraint
  ALTER TABLE public.whatsapp_notifications
  ADD CONSTRAINT whatsapp_notifications_recipient_check 
  CHECK (
    (member_id IS NOT NULL) OR 
    (daily_pass_user_id IS NOT NULL) OR
    (recipient_phone IS NOT NULL)
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If constraint creation fails, log and continue
    RAISE NOTICE 'Could not create constraint: %', SQLERRM;
END $$;
