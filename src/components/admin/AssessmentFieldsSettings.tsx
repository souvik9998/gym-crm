import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Activity, Heart, Brain, Target, Ruler, Dumbbell, Wind, StickyNote, Salad } from "lucide-react";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { cn } from "@/lib/utils";

interface FieldConfig {
  key: string;
  label: string;
}

interface SectionConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  fields?: FieldConfig[];
}

const ASSESSMENT_SECTIONS: SectionConfig[] = [
  {
    key: "basic_info",
    label: "Basic Info",
    description: "Weight, height, training mode, diet preferences",
    icon: Activity,
    fields: [
      { key: "weight", label: "Weight (kg)" },
      { key: "height", label: "Height (cm)" },
      { key: "mode_of_training", label: "Mode of Training" },
      { key: "diet_type", label: "Diet Type (Veg/NonVeg/Vegan/Egg)" },
      { key: "alcohol", label: "Alcohol Consumption" },
      { key: "smoking", label: "Smoking" },
    ],
  },
  {
    key: "lifestyle",
    label: "Lifestyle",
    description: "Physical activity, deficiencies, medications",
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
    icon: Heart,
    fields: [
      { key: "health_conditions", label: "Health Conditions / Medical Procedures" },
      { key: "injuries_pain", label: "Injuries / Pain" },
    ],
  },
  {
    key: "goals",
    label: "Member Goals",
    description: "Fitness goals and objectives",
    icon: Target,
  },
  {
    key: "health_parameters",
    label: "Health Parameters",
    description: "BP, RHR, SpO2, grip strength",
    icon: Activity,
    fields: [
      { key: "bp", label: "Blood Pressure (Systolic/Diastolic)" },
      { key: "rhr", label: "Resting Heart Rate" },
      { key: "spo2", label: "SpO2" },
      { key: "grip_strength", label: "Grip Strength (L/R)" },
    ],
  },
  {
    key: "muscle_strength",
    label: "Muscle Strength",
    description: "Pushups, squats, plank, pull-ups and more",
    icon: Dumbbell,
    fields: [
      { key: "pushups", label: "Pushups" },
      { key: "landmine", label: "Landmine" },
      { key: "pullups", label: "Pull Ups" },
      { key: "squats", label: "Squats" },
      { key: "sit_to_stand", label: "Sit to Stand" },
      { key: "glute_bridge", label: "Glute Bridge" },
      { key: "leg_raises", label: "Leg Raises" },
      { key: "plank", label: "Plank" },
      { key: "calf_raises", label: "Calf Raises" },
    ],
  },
  {
    key: "cardiovascular",
    label: "Cardiovascular Strength",
    description: "Cardiovascular assessment notes",
    icon: Wind,
  },
  {
    key: "body_measurements",
    label: "Body Measurements",
    description: "Neck, chest, arms, abdomen, thighs, calf",
    icon: Ruler,
    fields: [
      { key: "neck", label: "Neck" },
      { key: "chest", label: "Chest" },
      { key: "arms", label: "Arms (L/R)" },
      { key: "upper_abdomen", label: "Upper Abdomen" },
      { key: "lower_abdomen", label: "Lower Abdomen" },
      { key: "hips", label: "Hips" },
      { key: "upper_thighs", label: "Upper Thighs (L/R)" },
      { key: "lower_thighs", label: "Lower Thighs (L/R)" },
      { key: "calf", label: "Calf (L/R)" },
    ],
  },
  {
    key: "notes",
    label: "Notes / Recommendations",
    description: "Free-text notes and recommendations",
    icon: StickyNote,
  },
];

type AssessmentSettings = Record<string, { enabled: boolean; fields?: Record<string, boolean> }>;

const getDefaultSettings = (): AssessmentSettings => {
  const defaults: AssessmentSettings = {};
  ASSESSMENT_SECTIONS.forEach((section) => {
    const entry: { enabled: boolean; fields?: Record<string, boolean> } = { enabled: true };
    if (section.fields) {
      entry.fields = {};
      section.fields.forEach((f) => {
        entry.fields![f.key] = true;
      });
    }
    defaults[section.key] = entry;
  });
  return defaults;
};

export const AssessmentFieldsSettings = () => {
  const { currentBranch } = useBranch();
  const [settings, setSettings] = useState<AssessmentSettings>(getDefaultSettings());
  const [isLoading, setIsLoading] = useState(true);
  const [openSections, setOpenSections] = useState<string[]>([]);

  useEffect(() => {
    if (currentBranch?.id) fetchSettings();
  }, [currentBranch?.id]);

  const fetchSettings = async () => {
    if (!currentBranch?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("gym_settings")
        .select("assessment_field_settings")
        .eq("branch_id", currentBranch.id)
        .maybeSingle();

      if (error) throw error;
      if (data?.assessment_field_settings) {
        const parsed = typeof data.assessment_field_settings === "string"
          ? JSON.parse(data.assessment_field_settings)
          : data.assessment_field_settings;
        setSettings({ ...getDefaultSettings(), ...parsed });
      }
    } catch (err) {
      console.error("Error fetching assessment settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (updated: AssessmentSettings) => {
    if (!currentBranch?.id) return;
    try {
      const { error } = await supabase
        .from("gym_settings")
        .update({ assessment_field_settings: updated as any })
        .eq("branch_id", currentBranch.id);

      if (error) throw error;

      await logAdminActivity({
        category: "settings",
        type: "assessment_fields_updated",
        description: `Updated assessment field settings for ${currentBranch.name || "branch"}`,
        entityType: "gym_settings",
        entityName: currentBranch.name || "Gym Settings",
        branchId: currentBranch.id,
      });
      toast.success("Assessment settings saved");
    } catch (err: any) {
      toast.error("Error saving settings", { description: err.message });
    }
  };

  const toggleSection = (sectionKey: string, enabled: boolean) => {
    setSettings((prev) => {
      const updated = { ...prev };
      updated[sectionKey] = { ...updated[sectionKey], enabled };
      if (!enabled && updated[sectionKey].fields) {
        const disabledFields: Record<string, boolean> = {};
        Object.keys(updated[sectionKey].fields!).forEach((k) => {
          disabledFields[k] = false;
        });
        updated[sectionKey] = { ...updated[sectionKey], fields: disabledFields };
      } else if (enabled && updated[sectionKey].fields) {
        const enabledFields: Record<string, boolean> = {};
        Object.keys(updated[sectionKey].fields!).forEach((k) => {
          enabledFields[k] = true;
        });
        updated[sectionKey] = { ...updated[sectionKey], fields: enabledFields };
      }
      saveSettings(updated);
      return updated;
    });
  };

  const toggleField = (sectionKey: string, fieldKey: string, enabled: boolean) => {
    setSettings((prev) => {
      const updated = { ...prev };
      const sectionFields = { ...updated[sectionKey].fields, [fieldKey]: enabled };
      updated[sectionKey] = { ...updated[sectionKey], fields: sectionFields };
      // If all fields are disabled, disable the section
      const allDisabled = Object.values(sectionFields).every((v) => !v);
      if (allDisabled) {
        updated[sectionKey] = { ...updated[sectionKey], enabled: false };
      } else if (!updated[sectionKey].enabled) {
        updated[sectionKey] = { ...updated[sectionKey], enabled: true };
      }
      saveSettings(updated);
      return updated;
    });
  };

  if (isLoading) {
    return (
      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted/50 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const enabledCount = ASSESSMENT_SECTIONS.filter((s) => settings[s.key]?.enabled).length;

  return (
    <Card className="border border-border/40 shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-accent/10 text-accent">
            <Brain className="w-4 h-4 lg:w-5 lg:h-5" />
          </div>
          <div>
            <CardTitle className="text-base lg:text-xl">Assessment Fields Configuration</CardTitle>
            <CardDescription className="text-xs lg:text-sm">
              Configure which sections and fields to collect during member assessments.
              <span className="ml-1 text-accent font-medium">{enabledCount}/{ASSESSMENT_SECTIONS.length} sections enabled</span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0 space-y-2">
        {ASSESSMENT_SECTIONS.map((section) => {
          const sectionSettings = settings[section.key] || { enabled: true };
          const Icon = section.icon;
          const isOpen = openSections.includes(section.key);
          const hasFields = !!section.fields;

          return (
            <Collapsible
              key={section.key}
              open={isOpen && hasFields}
              onOpenChange={(open) => {
                if (!hasFields) return;
                setOpenSections((prev) =>
                  open ? [...prev, section.key] : prev.filter((s) => s !== section.key)
                );
              }}
            >
              <div
                className={cn(
                  "rounded-xl border transition-all duration-200",
                  sectionSettings.enabled
                    ? "bg-accent/5 border-accent/20"
                    : "bg-muted/20 border-border/40"
                )}
              >
                <div className="flex items-center justify-between p-3 lg:p-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                        sectionSettings.enabled ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{section.label}</p>
                      <p className="text-[10px] lg:text-xs text-muted-foreground truncate">{section.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {hasFields && (
                      <CollapsibleTrigger asChild>
                        <button className="p-1 rounded-md hover:bg-muted/50 transition-colors">
                          <ChevronDown
                            className={cn(
                              "w-4 h-4 text-muted-foreground transition-transform duration-200",
                              isOpen && "rotate-180"
                            )}
                          />
                        </button>
                      </CollapsibleTrigger>
                    )}
                    <Switch
                      checked={sectionSettings.enabled}
                      onCheckedChange={(v) => toggleSection(section.key, v)}
                    />
                  </div>
                </div>

                {hasFields && (
                  <CollapsibleContent>
                    <div className="px-3 lg:px-4 pb-3 lg:pb-4 space-y-1.5 border-t border-border/30 pt-2">
                      {section.fields!.map((field) => {
                        const fieldEnabled = sectionSettings.fields?.[field.key] ?? true;
                        return (
                          <div
                            key={field.key}
                            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors"
                          >
                            <Label className="text-xs lg:text-sm text-muted-foreground cursor-pointer">
                              {field.label}
                            </Label>
                            <Switch
                              checked={fieldEnabled}
                              onCheckedChange={(v) => toggleField(section.key, field.key, v)}
                              className="scale-75"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                )}
              </div>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
};

export { ASSESSMENT_SECTIONS };
export type { AssessmentSettings };
