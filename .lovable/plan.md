

# Assessment Configuration & Registration Field Toggles

## What We're Building

Two features:
1. **Assessment Configuration in Settings** — A new "Assessment" tab in admin Settings where admins can configure which assessment fields to collect (based on the uploaded doc: health parameters, muscle strength, cardiovascular, body measurements, lifestyle, etc.)
2. **Registration Field Toggles** — Add new toggleable fields (email, blood group, occupation, emergency contacts x2) to the existing Registration Fields Settings

---

## Document Reference (Assessment Sheet 4.0)

The uploaded doc defines these assessment sections:
- **Basic Info**: Weight, Height, Mode of Training, Diet (Vegan/Veg/NonVeg/Egg), Alcohol, Smoking
- **Lifestyle**: Physical Activity (Current & Past), Deficiency, Medication
- **Medical**: Health Conditions / Medical Procedures (Current & Past), Injuries/Pain
- **Goals**: Member's Goals
- **Health Parameters**: BP (Systolic/Diastolic), RHR, SpO2, Grip Strength (L/R)
- **Muscle Strength**: Pushups, Landmine, Pull Ups, Squats, Sit to Stand, Glute Bridge, Leg Raises, Plank, Calf Raises
- **Cardiovascular Strength**: Text field
- **Body Measurements**: Neck, Chest, Arms (L/R), Upper Abdomen, Lower Abdomen, Hips, Upper Thighs (L/R), Lower Thighs (L/R), Calf (L/R)
- **Notes**: Free text

---

## Plan

### Step 1: Database — Add assessment config column to `gym_settings`

Add a JSONB column `assessment_field_settings` to `gym_settings` to store which assessment sections/fields are enabled per branch. Structure:

```json
{
  "basic_info": { "enabled": true, "fields": { "weight": true, "height": true, "mode_of_training": true, "diet_type": true, "alcohol": true, "smoking": true } },
  "lifestyle": { "enabled": true, "fields": { "physical_activity_current": true, "physical_activity_past": true, "deficiency": true, "medication": true } },
  "medical": { "enabled": true, "fields": { "health_conditions": true, "injuries_pain": true } },
  "goals": { "enabled": true },
  "health_parameters": { "enabled": true, "fields": { "bp": true, "rhr": true, "spo2": true, "grip_strength": true } },
  "muscle_strength": { "enabled": true, "fields": { "pushups": true, "landmine": true, "pullups": true, "squats": true, "sit_to_stand": true, "glute_bridge": true, "leg_raises": true, "plank": true, "calf_raises": true } },
  "cardiovascular": { "enabled": true },
  "body_measurements": { "enabled": true, "fields": { "neck": true, "chest": true, "arms": true, "upper_abdomen": true, "lower_abdomen": true, "hips": true, "upper_thighs": true, "lower_thighs": true, "calf": true } },
  "notes": { "enabled": true }
}
```

### Step 2: Database — Restructure `member_assessments` table

Add new columns to `member_assessments` to store all the assessment data from the doc (as a JSONB `assessment_data` column to keep it flexible and match the admin's configured fields).

### Step 3: Registration Field Toggles

Add these new fields to the existing `RegistrationFieldsSettings` component and `FIELD_CONFIG`:
- `email` — Email ID (toggleable, not locked)
- `blood_group` — Blood Group (toggleable)
- `occupation` — Occupation (toggleable)
- `emergency_contact_1` — Emergency Contact 1 (Name + Phone)
- `emergency_contact_2` — Emergency Contact 2 (Name + Phone)

These use the same `registration_field_settings` JSONB column in `gym_settings`. When enabled, they show in the public registration form (`MemberDetailsForm` / `HealthDetailsForm`).

### Step 4: Create `AssessmentFieldsSettings` component

New component at `src/components/admin/AssessmentFieldsSettings.tsx`:
- Reads/writes `assessment_field_settings` from `gym_settings`
- Renders each section as a collapsible card with a master toggle
- Within each section, individual field toggles
- Auto-saves on toggle (same pattern as `RegistrationFieldsSettings`)

### Step 5: Add "Assessment" tab to Settings

Add `{ value: "assessment", label: "Assessment" }` to `settingsTabs` in `Settings.tsx` and render the new `AssessmentFieldsSettings` component.

### Step 6: Update `AssessmentSection` in Member Health Tab

Modify `AssessmentSection.tsx` to:
- Fetch the branch's `assessment_field_settings` to know which fields to show
- Replace the current hardcoded fields (current_condition, injuries, mobility, allowed_exercises, notes) with the dynamic field set from config
- Store assessment data in the new `assessment_data` JSONB column
- Render input types appropriate to each field (numeric for measurements, text for notes, select for diet type, etc.)

### Step 7: Update Registration Forms

Modify `MemberDetailsForm.tsx` to conditionally show email, occupation fields based on registration settings. Modify `HealthDetailsForm.tsx` to show blood_group and dual emergency contacts based on settings.

---

### Files to Create/Modify

| File | Action |
|---|---|
| `gym_settings` table | Migration: add `assessment_field_settings` JSONB column |
| `member_assessments` table | Migration: add `assessment_data` JSONB column |
| `src/components/admin/AssessmentFieldsSettings.tsx` | **Create** — Settings UI for assessment config |
| `src/pages/admin/Settings.tsx` | Add "Assessment" tab |
| `src/components/admin/RegistrationFieldsSettings.tsx` | Add email, blood_group, occupation, emergency_contact toggles |
| `src/components/admin/health/AssessmentSection.tsx` | Dynamic fields from config |
| `src/components/admin/health/MemberHealthTab.tsx` | Pass config to AssessmentSection |
| `src/components/registration/MemberDetailsForm.tsx` | Add conditional email, occupation fields |
| `src/components/registration/HealthDetailsForm.tsx` | Add blood_group, dual emergency contacts |

