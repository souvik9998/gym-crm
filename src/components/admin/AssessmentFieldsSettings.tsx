import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Activity, Heart, Brain, Target, Ruler, Dumbbell, Wind, StickyNote, Salad, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";

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

interface CustomField {
  key: string;
  label: string;
  enabled: boolean;
  input_type: "text" | "number" | "textarea" | "select";
  options?: string[];
}

type AssessmentSettings = Record<string, {
  enabled: boolean;
  fields?: Record<string, boolean>;
  field_labels?: Record<string, string>;
  custom_fields?: CustomField[];
}>;

const getDefaultSettings = (): AssessmentSettings => {
  const defaults: AssessmentSettings = {};
  ASSESSMENT_SECTIONS.forEach((section) => {
    const entry: AssessmentSettings[string] = { enabled: true };
    if (section.fields) {
      entry.fields = {};
      entry.field_labels = {};
      section.fields.forEach((f) => {
        entry.fields![f.key] = true;
        entry.field_labels![f.key] = f.label;
      });
    }
    entry.custom_fields = [];
    defaults[section.key] = entry;
  });
  return defaults;
};

export const AssessmentFieldsSettings = () => {
  const { currentBranch } = useBranch();
  const [settings, setSettings] = useState<AssessmentSettings>(getDefaultSettings());
  const [isLoading, setIsLoading] = useState(true);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [editingField, setEditingField] = useState<{ section: string; key: string } | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addingToSection, setAddingToSection] = useState<string | null>(null);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "textarea">("text");

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
        // Merge with defaults to ensure all keys exist
        const merged = getDefaultSettings();
        Object.keys(parsed).forEach((key) => {
          merged[key] = { ...merged[key], ...parsed[key] };
        });
        setSettings(merged);
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
        // Also disable custom fields
        if (updated[sectionKey].custom_fields) {
          updated[sectionKey].custom_fields = updated[sectionKey].custom_fields!.map((cf) => ({ ...cf, enabled: false }));
        }
      } else if (enabled && updated[sectionKey].fields) {
        const enabledFields: Record<string, boolean> = {};
        Object.keys(updated[sectionKey].fields!).forEach((k) => {
          enabledFields[k] = true;
        });
        updated[sectionKey] = { ...updated[sectionKey], fields: enabledFields };
        if (updated[sectionKey].custom_fields) {
          updated[sectionKey].custom_fields = updated[sectionKey].custom_fields!.map((cf) => ({ ...cf, enabled: true }));
        }
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
      const allDisabled = Object.values(sectionFields).every((v) => !v) &&
        (!updated[sectionKey].custom_fields?.length || updated[sectionKey].custom_fields!.every((cf) => !cf.enabled));
      if (allDisabled) {
        updated[sectionKey] = { ...updated[sectionKey], enabled: false };
      } else if (!updated[sectionKey].enabled) {
        updated[sectionKey] = { ...updated[sectionKey], enabled: true };
      }
      saveSettings(updated);
      return updated;
    });
  };

  const startEditLabel = (sectionKey: string, fieldKey: string, currentLabel: string) => {
    setEditingField({ section: sectionKey, key: fieldKey });
    setEditLabel(currentLabel);
  };

  const saveFieldLabel = () => {
    if (!editingField || !editLabel.trim()) return;
    setSettings((prev) => {
      const updated = { ...prev };
      const section = updated[editingField.section];
      // Check if it's a custom field
      const customIdx = section.custom_fields?.findIndex((cf) => cf.key === editingField.key);
      if (customIdx !== undefined && customIdx >= 0 && section.custom_fields) {
        section.custom_fields[customIdx] = { ...section.custom_fields[customIdx], label: editLabel.trim() };
      } else {
        section.field_labels = { ...section.field_labels, [editingField.key]: editLabel.trim() };
      }
      updated[editingField.section] = { ...section };
      saveSettings(updated);
      return updated;
    });
    setEditingField(null);
    setEditLabel("");
  };

  const addCustomField = (sectionKey: string) => {
    if (!newFieldLabel.trim()) return;
    const fieldKey = `custom_${Date.now()}`;
    setSettings((prev) => {
      const updated = { ...prev };
      const section = updated[sectionKey];
      const customFields = [...(section.custom_fields || [])];
      customFields.push({
        key: fieldKey,
        label: newFieldLabel.trim(),
        enabled: true,
        input_type: newFieldType,
      });
      updated[sectionKey] = { ...section, custom_fields: customFields, enabled: true };
      saveSettings(updated);
      return updated;
    });
    setNewFieldLabel("");
    setNewFieldType("text");
    setAddingToSection(null);
  };

  const toggleCustomField = (sectionKey: string, fieldKey: string, enabled: boolean) => {
    setSettings((prev) => {
      const updated = { ...prev };
      const section = updated[sectionKey];
      if (section.custom_fields) {
        section.custom_fields = section.custom_fields.map((cf) =>
          cf.key === fieldKey ? { ...cf, enabled } : cf
        );
        updated[sectionKey] = { ...section };
      }
      saveSettings(updated);
      return updated;
    });
  };

  const deleteCustomField = (sectionKey: string, fieldKey: string) => {
    setSettings((prev) => {
      const updated = { ...prev };
      const section = updated[sectionKey];
      if (section.custom_fields) {
        section.custom_fields = section.custom_fields.filter((cf) => cf.key !== fieldKey);
        updated[sectionKey] = { ...section };
      }
      saveSettings(updated);
      return updated;
    });
  };

  const getFieldLabel = (sectionKey: string, fieldKey: string, defaultLabel: string) => {
    return settings[sectionKey]?.field_labels?.[fieldKey] || defaultLabel;
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
              Configure sections, rename fields, or add custom fields for member assessments.
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
          const hasFields = !!section.fields || (sectionSettings.custom_fields && sectionSettings.custom_fields.length > 0);

          return (
            <Collapsible
              key={section.key}
              open={isOpen}
              onOpenChange={(open) => {
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
                    <Switch
                      checked={sectionSettings.enabled}
                      onCheckedChange={(v) => toggleSection(section.key, v)}
                    />
                  </div>
                </div>

                <CollapsibleContent>
                  <div className="px-3 lg:px-4 pb-3 lg:pb-4 space-y-1.5 border-t border-border/30 pt-2">
                    {/* Built-in fields */}
                    {section.fields?.map((field) => {
                      const fieldEnabled = sectionSettings.fields?.[field.key] ?? true;
                      const displayLabel = getFieldLabel(section.key, field.key, field.label);
                      const isEditing = editingField?.section === section.key && editingField?.key === field.key;

                      return (
                        <div
                          key={field.key}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors group"
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 flex-1 mr-2">
                              <Input
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                className="h-7 text-xs"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveFieldLabel();
                                  if (e.key === "Escape") setEditingField(null);
                                }}
                              />
                              <button onClick={saveFieldLabel} className="p-1 text-green-600 hover:bg-green-50 rounded">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingField(null)} className="p-1 text-muted-foreground hover:bg-muted/50 rounded">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <Label className="text-xs lg:text-sm text-muted-foreground cursor-pointer truncate">
                                {displayLabel}
                              </Label>
                              <button
                                onClick={() => startEditLabel(section.key, field.key, displayLabel)}
                                className="p-0.5 rounded text-muted-foreground/0 group-hover:text-muted-foreground/60 hover:!text-foreground transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <Switch
                            checked={fieldEnabled}
                            onCheckedChange={(v) => toggleField(section.key, field.key, v)}
                            className="scale-75"
                          />
                        </div>
                      );
                    })}

                    {/* Custom fields */}
                    {sectionSettings.custom_fields?.map((cf) => {
                      const isEditing = editingField?.section === section.key && editingField?.key === cf.key;
                      return (
                        <div
                          key={cf.key}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors group"
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 flex-1 mr-2">
                              <Input
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                className="h-7 text-xs"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveFieldLabel();
                                  if (e.key === "Escape") setEditingField(null);
                                }}
                              />
                              <button onClick={saveFieldLabel} className="p-1 text-green-600 hover:bg-green-50 rounded">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingField(null)} className="p-1 text-muted-foreground hover:bg-muted/50 rounded">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <Label className="text-xs lg:text-sm text-muted-foreground cursor-pointer truncate">
                                {cf.label}
                              </Label>
                              <span className="text-[9px] text-muted-foreground/50 bg-muted/40 px-1.5 py-0.5 rounded">custom</span>
                              <button
                                onClick={() => startEditLabel(section.key, cf.key, cf.label)}
                                className="p-0.5 rounded text-muted-foreground/0 group-hover:text-muted-foreground/60 hover:!text-foreground transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => deleteCustomField(section.key, cf.key)}
                                className="p-0.5 rounded text-muted-foreground/0 group-hover:text-destructive/60 hover:!text-destructive transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <Switch
                            checked={cf.enabled}
                            onCheckedChange={(v) => toggleCustomField(section.key, cf.key, v)}
                            className="scale-75"
                          />
                        </div>
                      );
                    })}

                    {/* Add custom field */}
                    {addingToSection === section.key ? (
                      <div className="flex items-center gap-2 pt-1 px-2">
                        <Input
                          value={newFieldLabel}
                          onChange={(e) => setNewFieldLabel(e.target.value)}
                          placeholder="Field name"
                          className="h-7 text-xs flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addCustomField(section.key);
                            if (e.key === "Escape") setAddingToSection(null);
                          }}
                        />
                        <Select value={newFieldType} onValueChange={(v: any) => setNewFieldType(v)}>
                          <SelectTrigger className="h-7 text-xs w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="textarea">Long Text</SelectItem>
                          </SelectContent>
                        </Select>
                        <button onClick={() => addCustomField(section.key)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setAddingToSection(null)} className="p-1 text-muted-foreground hover:bg-muted/50 rounded">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingToSection(section.key)}
                        className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 px-2 py-1.5 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add Custom Field
                      </button>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
};

export { ASSESSMENT_SECTIONS };
export type { AssessmentSettings, CustomField };
