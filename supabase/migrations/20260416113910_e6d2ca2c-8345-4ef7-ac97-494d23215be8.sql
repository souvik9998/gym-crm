
-- Add assessment field settings to gym_settings
ALTER TABLE public.gym_settings
ADD COLUMN IF NOT EXISTS assessment_field_settings jsonb NOT NULL DEFAULT '{
  "basic_info": { "enabled": true, "fields": { "weight": true, "height": true, "mode_of_training": true, "diet_type": true, "alcohol": true, "smoking": true } },
  "lifestyle": { "enabled": true, "fields": { "physical_activity_current": true, "physical_activity_past": true, "deficiency": true, "medication": true } },
  "medical": { "enabled": true, "fields": { "health_conditions": true, "injuries_pain": true } },
  "goals": { "enabled": true },
  "health_parameters": { "enabled": true, "fields": { "bp": true, "rhr": true, "spo2": true, "grip_strength": true } },
  "muscle_strength": { "enabled": true, "fields": { "pushups": true, "landmine": true, "pullups": true, "squats": true, "sit_to_stand": true, "glute_bridge": true, "leg_raises": true, "plank": true, "calf_raises": true } },
  "cardiovascular": { "enabled": true },
  "body_measurements": { "enabled": true, "fields": { "neck": true, "chest": true, "arms": true, "upper_abdomen": true, "lower_abdomen": true, "hips": true, "upper_thighs": true, "lower_thighs": true, "calf": true } },
  "notes": { "enabled": true }
}'::jsonb;

-- Add flexible assessment data column to member_assessments
ALTER TABLE public.member_assessments
ADD COLUMN IF NOT EXISTS assessment_data jsonb DEFAULT '{}'::jsonb;
