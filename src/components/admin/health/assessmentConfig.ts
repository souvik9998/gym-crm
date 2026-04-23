import {
  Activity,
  Brain,
  Dumbbell,
  Heart,
  Ruler,
  Salad,
  StickyNote,
  Target,
  Wind,
  type LucideIcon,
} from "lucide-react";

export interface FieldConfig {
  key: string;
  label: string;
}

export interface SectionConfig {
  key: string;
  label: string;
  description: string;
  purpose: string;
  icon: LucideIcon;
  fields?: FieldConfig[];
}

export interface CustomField {
  key: string;
  label: string;
  enabled: boolean;
  input_type: "text" | "number" | "textarea" | "select";
  kind?: "standard" | "exercise";
  exercise_mode?: ExerciseInputMode;
  options?: string[];
}

export type ExerciseInputMode = "reps" | "time" | "reps_sets";

export interface ExerciseFieldValue {
  mode: ExerciseInputMode;
  reps?: string;
  sets?: string;
  time?: string;
  unit?: "sec" | "min";
}

export type AssessmentSettings = Record<string, {
  enabled: boolean;
  fields?: Record<string, boolean>;
  field_labels?: Record<string, string>;
  field_modes?: Record<string, ExerciseInputMode>;
  custom_fields?: CustomField[];
}>;

export type AssessmentFieldInputType = "number" | "text" | "select" | "textarea";

export interface FieldMeta {
  inputType: AssessmentFieldInputType;
  placeholder?: string;
  unit?: string;
  helpText?: string;
  options?: string[];
}

export const ASSESSMENT_SECTIONS: SectionConfig[] = [
  {
    key: "basic_info",
    label: "Basic Info",
    description: "Weight, height, training mode, diet preferences",
    purpose: "Collect core profile details trainers need before planning workouts.",
    icon: Activity,
    fields: [
      { key: "weight", label: "Weight" },
      { key: "height", label: "Height" },
      { key: "mode_of_training", label: "Mode of Training" },
      { key: "diet_type", label: "Diet Type" },
      { key: "alcohol", label: "Alcohol Consumption" },
      { key: "smoking", label: "Smoking" },
    ],
  },
  {
    key: "lifestyle",
    label: "Lifestyle",
    description: "Physical activity, deficiencies, medications",
    purpose: "Understand routines and recovery factors that affect program design.",
    icon: Salad,
    fields: [
      { key: "physical_activity_current", label: "Current Physical Activity" },
      { key: "physical_activity_past", label: "Past Physical Activity" },
      { key: "deficiency", label: "Deficiency" },
      { key: "medication", label: "Medication" },
    ],
  },
  {
    key: "medical",
    label: "Medical History",
    description: "Health conditions, injuries, pain areas",
    purpose: "Capture medical risks so trainers can avoid unsafe movements.",
    icon: Heart,
    fields: [
      { key: "health_conditions", label: "Health Conditions / Procedures" },
      { key: "injuries_pain", label: "Injuries / Pain" },
    ],
  },
  {
    key: "goals",
    label: "Member Goals",
    description: "Fitness goals and objectives",
    purpose: "Document what the member wants to achieve from the program.",
    icon: Target,
  },
  {
    key: "health_parameters",
    label: "Health Parameters",
    description: "BP, RHR, SpO2, grip strength",
    purpose: "Track measurable vitals that can influence readiness and intensity.",
    icon: Brain,
    fields: [
      { key: "bp", label: "Blood Pressure" },
      { key: "rhr", label: "Resting Heart Rate" },
      { key: "spo2", label: "SpO2" },
      { key: "grip_strength", label: "Grip Strength" },
    ],
  },
  {
    key: "muscle_strength",
    label: "Muscle Strength",
    description: "Pushups, squats, plank, pull-ups and more",
    purpose: "Measure baseline strength and endurance across common movement patterns.",
    icon: Dumbbell,
    fields: [
      { key: "pushups", label: "Pushups" },
      { key: "landmine", label: "Landmine" },
      { key: "pullups", label: "Pull Ups" },
      { key: "squats", label: "Squats" },
      { key: "sit_to_stand", label: "Sit to Stand" },
      { key: "glute_bridge", label: "Glute Bridge" },
      { key: "leg_raises", label: "Leg Raises" },
      { key: "plank", label: "Plank Hold" },
      { key: "calf_raises", label: "Calf Raises" },
    ],
  },
  {
    key: "cardiovascular",
    label: "Cardiovascular Strength",
    description: "Cardiovascular assessment notes",
    purpose: "Record stamina observations, test summaries, or cardio readiness notes.",
    icon: Wind,
  },
  {
    key: "body_measurements",
    label: "Body Measurements",
    description: "Neck, chest, arms, abdomen, thighs, calf",
    purpose: "Track circumference-based progress in a consistent unit.",
    icon: Ruler,
    fields: [
      { key: "neck", label: "Neck" },
      { key: "chest", label: "Chest" },
      { key: "arms", label: "Arms" },
      { key: "upper_abdomen", label: "Upper Abdomen" },
      { key: "lower_abdomen", label: "Lower Abdomen" },
      { key: "hips", label: "Hips" },
      { key: "upper_thighs", label: "Upper Thighs" },
      { key: "lower_thighs", label: "Lower Thighs" },
      { key: "calf", label: "Calf" },
    ],
  },
  {
    key: "notes",
    label: "Notes / Recommendations",
    description: "Free-text notes and recommendations",
    purpose: "Leave coaching notes, movement cues, or next-step recommendations.",
    icon: StickyNote,
  },
];

export const ASSESSMENT_FIELD_META: Record<string, FieldMeta> = {
  weight: { inputType: "number", unit: "kg", placeholder: "70", helpText: "Member body weight" },
  height: { inputType: "number", unit: "cm", placeholder: "175", helpText: "Member height" },
  mode_of_training: { inputType: "text", placeholder: "Strength, fat loss, rehab", helpText: "Primary training focus" },
  diet_type: { inputType: "select", options: ["Vegetarian", "Non-Vegetarian", "Vegan", "Eggetarian"], helpText: "Diet preference" },
  alcohol: { inputType: "select", options: ["None", "Occasional", "Regular"], helpText: "Alcohol intake frequency" },
  smoking: { inputType: "select", options: ["None", "Occasional", "Regular"], helpText: "Smoking frequency" },
  physical_activity_current: { inputType: "textarea", placeholder: "Walking, sports, gym sessions, daily activity...", helpText: "Current weekly movement habits" },
  physical_activity_past: { inputType: "textarea", placeholder: "Previous sports, training history, injuries...", helpText: "Past activity background" },
  deficiency: { inputType: "text", placeholder: "Vitamin D, B12, Iron", helpText: "Known deficiencies" },
  medication: { inputType: "text", placeholder: "Current medications", helpText: "Medicine currently being used" },
  health_conditions: { inputType: "textarea", placeholder: "Surgery, diabetes, hypertension...", helpText: "Important medical history" },
  injuries_pain: { inputType: "textarea", placeholder: "Knee pain, shoulder injury, back pain...", helpText: "Current or past injuries" },
  bp: { inputType: "text", unit: "mmHg", placeholder: "120/80", helpText: "Systolic / Diastolic" },
  rhr: { inputType: "number", unit: "bpm", placeholder: "72", helpText: "Resting heart rate" },
  spo2: { inputType: "number", unit: "%", placeholder: "98", helpText: "Blood oxygen level" },
  grip_strength: { inputType: "text", unit: "kg", placeholder: "L: 30, R: 32", helpText: "Left and right hand grip" },
  pushups: { inputType: "number", unit: "reps", placeholder: "20", helpText: "Continuous repetitions completed" },
  landmine: { inputType: "number", unit: "reps", placeholder: "12", helpText: "Controlled reps completed" },
  pullups: { inputType: "number", unit: "reps", placeholder: "8", helpText: "Strict pull-up count" },
  squats: { inputType: "number", unit: "reps", placeholder: "25", helpText: "Bodyweight squat repetitions" },
  sit_to_stand: { inputType: "number", unit: "reps", placeholder: "15", helpText: "Chair sit-to-stand reps" },
  glute_bridge: { inputType: "number", unit: "reps", placeholder: "20", helpText: "Glute bridge repetitions" },
  leg_raises: { inputType: "number", unit: "reps", placeholder: "12", helpText: "Leg raise repetitions" },
  plank: { inputType: "text", unit: "sec", placeholder: "60", helpText: "Plank hold duration" },
  calf_raises: { inputType: "number", unit: "reps", placeholder: "20", helpText: "Calf raise repetitions" },
  neck: { inputType: "number", unit: "cm", placeholder: "34", helpText: "Circumference measurement" },
  chest: { inputType: "number", unit: "cm", placeholder: "96", helpText: "Circumference measurement" },
  arms: { inputType: "text", unit: "cm", placeholder: "L: 32, R: 32", helpText: "Left and right arm measurements" },
  upper_abdomen: { inputType: "number", unit: "cm", placeholder: "85", helpText: "Upper abdomen circumference" },
  lower_abdomen: { inputType: "number", unit: "cm", placeholder: "89", helpText: "Lower abdomen circumference" },
  hips: { inputType: "number", unit: "cm", placeholder: "98", helpText: "Hip circumference" },
  upper_thighs: { inputType: "text", unit: "cm", placeholder: "L: 56, R: 56", helpText: "Left and right upper thigh" },
  lower_thighs: { inputType: "text", unit: "cm", placeholder: "L: 42, R: 42", helpText: "Left and right lower thigh" },
  calf: { inputType: "text", unit: "cm", placeholder: "L: 36, R: 36", helpText: "Left and right calf" },
};

export const getDefaultAssessmentSettings = (): AssessmentSettings => {
  const defaults: AssessmentSettings = {};

  ASSESSMENT_SECTIONS.forEach((section) => {
    const entry: AssessmentSettings[string] = { enabled: true };
    if (section.fields) {
      entry.fields = {};
      entry.field_labels = {};
      entry.field_modes = {};
      section.fields.forEach((field) => {
        entry.fields![field.key] = true;
        entry.field_labels![field.key] = field.label;
        if (section.key === "muscle_strength") {
          entry.field_modes![field.key] = field.key === "plank" ? "time" : "reps";
        }
      });
    }
    entry.custom_fields = [];
    defaults[section.key] = entry;
  });

  return defaults;
};

export const getAssessmentFieldMeta = (fieldKey: string): FieldMeta => {
  return ASSESSMENT_FIELD_META[fieldKey] || { inputType: "text" };
};

export const isExerciseAssessmentSection = (sectionKey: string) => sectionKey === "muscle_strength";

export const getExerciseInputMode = (
  settings: AssessmentSettings,
  sectionKey: string,
  fieldKey: string,
  customField?: CustomField,
): ExerciseInputMode => {
  if (customField?.exercise_mode) return customField.exercise_mode;
  return settings[sectionKey]?.field_modes?.[fieldKey] || (fieldKey === "plank" ? "time" : "reps");
};
