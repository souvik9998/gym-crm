
-- 4-slot promotional templates per gym, configured by Super Admin
ALTER TABLE public.tenant_messaging_config
  ADD COLUMN IF NOT EXISTS promotional_templates jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tenant_messaging_config.promotional_templates IS
  'Array of up to 4 promotional template slots configured by Super Admin. Each slot: { slot:1-4, enabled, name, templateId, description, variables:[{key,description}], previewBody }';

-- Per-branch admin picks which slot is currently active for sending
ALTER TABLE public.gym_settings
  ADD COLUMN IF NOT EXISTS active_promotional_slot smallint NULL;

ALTER TABLE public.gym_settings
  DROP CONSTRAINT IF EXISTS gym_settings_active_promotional_slot_check;

ALTER TABLE public.gym_settings
  ADD CONSTRAINT gym_settings_active_promotional_slot_check
  CHECK (active_promotional_slot IS NULL OR active_promotional_slot BETWEEN 1 AND 4);

COMMENT ON COLUMN public.gym_settings.active_promotional_slot IS
  'Which of the 4 super-admin-configured promotional template slots (1-4) the branch admin has activated for sending. NULL = none selected.';
