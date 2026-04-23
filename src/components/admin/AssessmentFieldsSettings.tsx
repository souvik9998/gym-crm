import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Brain, Eye, EyeOff, Plus, Pencil, Trash2, Check, X, Settings2, Repeat, TimerReset, Layers3 } from "lucide-react";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { cn } from "@/lib/utils";
import { ASSESSMENT_SECTIONS, getAssessmentFieldMeta, getAssessmentFieldUnitOptions, getDefaultAssessmentSettings, getExerciseInputMode, isExerciseAssessmentSection, type AssessmentSettings, type CustomField, type ExerciseInputMode } from "@/components/admin/health/assessmentConfig";

export const AssessmentFieldsSettings = () => {
  const { currentBranch } = useBranch();
  const [settings, setSettings] = useState<AssessmentSettings>(getDefaultAssessmentSettings());
  const [isLoading, setIsLoading] = useState(true);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [editingField, setEditingField] = useState<{ section: string; key: string } | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addingToSection, setAddingToSection] = useState<string | null>(null);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "textarea">("text");
  const [newExerciseMode, setNewExerciseMode] = useState<ExerciseInputMode>("reps");
  const [newFieldUnit, setNewFieldUnit] = useState("");

  useEffect(() => {
    if (currentBranch?.id) {
      fetchSettings();
    }
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
        const merged = getDefaultAssessmentSettings();
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
        Object.keys(updated[sectionKey].fields!).forEach((key) => {
          disabledFields[key] = false;
        });
        updated[sectionKey] = { ...updated[sectionKey], fields: disabledFields };
        if (updated[sectionKey].custom_fields) {
          updated[sectionKey].custom_fields = updated[sectionKey].custom_fields!.map((cf) => ({ ...cf, enabled: false }));
        }
      } else if (enabled && updated[sectionKey].fields) {
        const enabledFields: Record<string, boolean> = {};
        Object.keys(updated[sectionKey].fields!).forEach((key) => {
          enabledFields[key] = true;
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

      const allDisabled = Object.values(sectionFields).every((value) => !value) &&
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

  const updateExerciseMode = (sectionKey: string, fieldKey: string, mode: ExerciseInputMode) => {
    setSettings((prev) => {
      const updated = { ...prev };
      updated[sectionKey] = {
        ...updated[sectionKey],
        field_modes: {
          ...updated[sectionKey]?.field_modes,
          [fieldKey]: mode,
        },
      };
      saveSettings(updated);
      return updated;
    });
  };

  const updateFieldUnit = (sectionKey: string, fieldKey: string, unit: string) => {
    setSettings((prev) => {
      const updated = { ...prev };
      updated[sectionKey] = {
        ...updated[sectionKey],
        field_units: {
          ...updated[sectionKey]?.field_units,
          [fieldKey]: unit.trim(),
        },
      };
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
        kind: isExerciseAssessmentSection(sectionKey) ? "exercise" : "standard",
        exercise_mode: isExerciseAssessmentSection(sectionKey) ? newExerciseMode : undefined,
        unit: newFieldUnit.trim() || undefined,
      });
      updated[sectionKey] = { ...section, custom_fields: customFields, enabled: true };
      saveSettings(updated);
      return updated;
    });

    setNewFieldLabel("");
    setNewFieldType("text");
    setNewExerciseMode("reps");
    setNewFieldUnit("");
    setAddingToSection(null);
  };

  const updateCustomExerciseMode = (sectionKey: string, fieldKey: string, mode: ExerciseInputMode) => {
    setSettings((prev) => {
      const updated = { ...prev };
      const section = updated[sectionKey];
      if (section.custom_fields) {
        section.custom_fields = section.custom_fields.map((cf) =>
          cf.key === fieldKey ? { ...cf, kind: "exercise", exercise_mode: mode } : cf
        );
        updated[sectionKey] = { ...section };
      }
      saveSettings(updated);
      return updated;
    });
  };

  const updateCustomFieldUnit = (sectionKey: string, fieldKey: string, unit: string) => {
    setSettings((prev) => {
      const updated = { ...prev };
      const section = updated[sectionKey];
      if (section.custom_fields) {
        section.custom_fields = section.custom_fields.map((cf) =>
          cf.key === fieldKey ? { ...cf, unit: unit.trim() || undefined } : cf
        );
        updated[sectionKey] = { ...section };
      }
      saveSettings(updated);
      return updated;
    });
  };

  const renderExerciseModeSelect = (value: ExerciseInputMode, onChange: (mode: ExerciseInputMode) => void) => (
    <Select value={value} onValueChange={(mode: ExerciseInputMode) => onChange(mode)}>
      <SelectTrigger className="h-8 w-[138px] text-[11px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="reps">Reps only</SelectItem>
        <SelectItem value="reps_sets">Reps + sets</SelectItem>
        <SelectItem value="time">Time based</SelectItem>
      </SelectContent>
    </Select>
  );

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

  const getFieldUnit = (sectionKey: string, fieldKey: string, defaultUnit?: string) => {
    return settings[sectionKey]?.field_units?.[fieldKey] || defaultUnit || "";
  };

  const renderFieldUnitControl = (sectionKey: string, fieldKey: string, defaultUnit?: string) => {
    const unitOptions = getAssessmentFieldUnitOptions(fieldKey);
    const currentValue = getFieldUnit(sectionKey, fieldKey, defaultUnit);

    if (sectionKey === "basic_info" && unitOptions.length > 0) {
      const safeValue = unitOptions.some((option) => option.value === currentValue)
        ? currentValue || "__none__"
        : unitOptions[0].value || "__none__";

      return (
        <Select value={safeValue} onValueChange={(value) => updateFieldUnit(sectionKey, fieldKey, value === "__none__" ? "" : value)}>
          <SelectTrigger className="h-8 w-[170px] text-[11px]">
            <SelectValue placeholder="Select unit" />
          </SelectTrigger>
          <SelectContent>
            {unitOptions.map((option) => (
              <SelectItem key={`${fieldKey}-${option.value || "none"}`} value={option.value || "__none__"}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        value={currentValue}
        onChange={(e) => updateFieldUnit(sectionKey, fieldKey, e.target.value)}
        placeholder="Unit e.g. kg, cm, mmHg"
        className="h-8 w-[150px] text-[11px]"
      />
    );
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

  const enabledCount = ASSESSMENT_SECTIONS.filter((section) => settings[section.key]?.enabled).length;
  const totalVisibleFields = ASSESSMENT_SECTIONS.reduce((count, section) => {
    const sectionSettings = settings[section.key];
    const builtInCount = Object.values(sectionSettings?.fields || {}).filter(Boolean).length;
    const customCount = (sectionSettings?.custom_fields || []).filter((field) => field.enabled).length;
    return count + builtInCount + customCount + (!section.fields && sectionSettings?.enabled ? 1 : 0);
  }, 0);

  return (
    <Card className="border border-border/40 shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="p-4 lg:p-6 pb-3 lg:pb-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-accent/10 text-accent">
            <Brain className="w-4 h-4 lg:w-5 lg:h-5" />
          </div>
          <div>
            <CardTitle className="text-base lg:text-xl">Assessment Fields Configuration</CardTitle>
            <CardDescription className="text-xs lg:text-sm">
              Choose exactly what admins will record during health assessments and keep every field easy to understand.
            </CardDescription>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sections enabled</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{enabledCount}/{ASSESSMENT_SECTIONS.length}</p>
            <p className="text-xs text-muted-foreground">Only enabled sections appear in the admin assessment form.</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Visible fields</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{totalVisibleFields}</p>
            <p className="text-xs text-muted-foreground">This includes built-in fields plus any custom questions you added.</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-foreground">
              <Settings2 className="h-4 w-4 text-accent" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">How it works</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Turn on a section, rename any label, and hide fields that your team does not use.</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0 space-y-3">
        {ASSESSMENT_SECTIONS.map((section) => {
          const sectionSettings = settings[section.key] || { enabled: true };
          const Icon = section.icon;
          const isOpen = openSections.includes(section.key);
          const enabledFieldCount = Object.values(sectionSettings.fields || {}).filter(Boolean).length + (sectionSettings.custom_fields || []).filter((field) => field.enabled).length;

          return (
            <Collapsible
              key={section.key}
              open={isOpen}
              onOpenChange={(open) => {
                setOpenSections((prev) => (open ? [...prev, section.key] : prev.filter((item) => item !== section.key)));
              }}
            >
              <div
                className={cn(
                  "rounded-xl border transition-all duration-200 overflow-hidden",
                  sectionSettings.enabled ? "border-accent/20 bg-accent/5" : "border-border/40 bg-muted/20"
                )}
              >
                <div className="flex items-start justify-between gap-3 p-3 lg:p-4">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex items-start gap-3 flex-1 min-w-0 text-left rounded-lg transition-colors hover:bg-background/50 -m-1 p-1">
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
                        sectionSettings.enabled ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm lg:text-base text-foreground">{section.label}</p>
                        <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                          {section.fields ? `${enabledFieldCount} visible` : sectionSettings.enabled ? "Visible" : "Hidden"}
                        </Badge>
                        {!sectionSettings.enabled && (
                          <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] text-muted-foreground">
                            <EyeOff className="mr-1 h-3 w-3" /> Hidden
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{section.description}</p>
                      <p className="text-[11px] text-muted-foreground/90">{section.purpose}</p>
                    </div>
                  </button>
                  </CollapsibleTrigger>

                  <div className="flex items-center gap-2 flex-shrink-0">
                      <button type="button" onClick={() => setOpenSections((prev) => isOpen ? prev.filter((item) => item !== section.key) : [...prev, section.key])} className="flex h-8 w-8 items-center justify-center rounded-md border border-border/50 bg-background/70 transition-colors hover:bg-muted/50">
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
                      </button>
                    <div className={cn("flex items-center gap-2 rounded-lg border px-2 py-1 transition-colors", sectionSettings.enabled ? "border-accent/20 bg-background/80" : "border-border/50 bg-background/70")}>
                      {sectionSettings.enabled ? <Eye className="h-3.5 w-3.5 text-accent" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                      <Switch checked={sectionSettings.enabled} onCheckedChange={(value) => toggleSection(section.key, value)} />
                    </div>
                  </div>
                </div>

                <CollapsibleContent>
                  <div className="border-t border-border/40 px-3 pb-3 pt-3 lg:px-4 lg:pb-4 space-y-2">
                    {section.fields?.map((field) => {
                      const fieldEnabled = sectionSettings.fields?.[field.key] ?? true;
                      const displayLabel = getFieldLabel(section.key, field.key, field.label);
                      const isEditing = editingField?.section === section.key && editingField?.key === field.key;
                       const meta = getAssessmentFieldMeta(field.key);
                       const isExerciseField = isExerciseAssessmentSection(section.key);
                       const exerciseMode = getExerciseInputMode(settings, section.key, field.key);

                      return (
                        <div
                          key={field.key}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 transition-colors",
                            fieldEnabled ? "border-border/50 bg-background/80" : "border-border/30 bg-muted/20"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 flex-1 mr-2">
                                <Input
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  className="h-8 text-xs"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveFieldLabel();
                                    if (e.key === "Escape") setEditingField(null);
                                  }}
                                />
                                <button onClick={saveFieldLabel} className="rounded bg-success/10 p-1 text-success transition-colors hover:bg-success/20">
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setEditingField(null)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/50">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                  <Label className="cursor-pointer truncate text-xs lg:text-sm font-medium text-foreground">{displayLabel}</Label>
                                   {getFieldUnit(section.key, field.key, meta.unit) && (
                                     <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">{getFieldUnit(section.key, field.key, meta.unit)}</Badge>
                                  )}
                                </div>
                                 <p className="mt-1 text-[11px] text-muted-foreground">
                                  {meta.helpText || `Visible in ${section.label.toLowerCase()} assessments.`}
                                </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {renderFieldUnitControl(section.key, field.key, meta.unit)}
                                  </div>
                                 {isExerciseField && (
                                   <div className="mt-2 flex flex-wrap items-center gap-2">
                                     <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                                       {exerciseMode === "time" ? <TimerReset className="mr-1 h-3 w-3" /> : exerciseMode === "reps_sets" ? <Layers3 className="mr-1 h-3 w-3" /> : <Repeat className="mr-1 h-3 w-3" />}
                                       {exerciseMode === "time" ? "Time" : exerciseMode === "reps_sets" ? "Reps + sets" : "Reps"}
                                     </Badge>
                                     {renderExerciseModeSelect(exerciseMode, (mode) => updateExerciseMode(section.key, field.key, mode))}
                                   </div>
                                 )}
                              </div>
                            )}

                            {!isEditing && (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => startEditLabel(section.key, field.key, displayLabel)}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <Switch checked={fieldEnabled} onCheckedChange={(value) => toggleField(section.key, field.key, value)} className="scale-75" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {sectionSettings.custom_fields?.map((cf) => {
                      const isEditing = editingField?.section === section.key && editingField?.key === cf.key;
                       const isExerciseField = isExerciseAssessmentSection(section.key) || cf.kind === "exercise";
                       const exerciseMode = cf.exercise_mode || "reps";
                       return (
                        <div
                          key={cf.key}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 transition-colors",
                            cf.enabled ? "border-border/50 bg-background/80" : "border-border/30 bg-muted/20"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 flex-1 mr-2">
                                <Input
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  className="h-8 text-xs"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveFieldLabel();
                                    if (e.key === "Escape") setEditingField(null);
                                  }}
                                />
                                <button onClick={saveFieldLabel} className="rounded bg-success/10 p-1 text-success transition-colors hover:bg-success/20">
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setEditingField(null)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/50">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Label className="cursor-pointer truncate text-xs lg:text-sm font-medium text-foreground">{cf.label}</Label>
                                  <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">Custom</Badge>
                                  <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] capitalize">{cf.input_type}</Badge>
                                  {cf.unit && <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">{cf.unit}</Badge>}
                                </div>
                                 <p className="mt-1 text-[11px] text-muted-foreground">Custom question added by admin for this section.</p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Input
                                      value={cf.unit || ""}
                                      onChange={(e) => updateCustomFieldUnit(section.key, cf.key, e.target.value)}
                                      placeholder="Unit e.g. kg, cm, bpm"
                                      className="h-8 w-[150px] text-[11px]"
                                    />
                                  </div>
                                 {isExerciseField && (
                                   <div className="mt-2 flex flex-wrap items-center gap-2">
                                     <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                                       {exerciseMode === "time" ? <TimerReset className="mr-1 h-3 w-3" /> : exerciseMode === "reps_sets" ? <Layers3 className="mr-1 h-3 w-3" /> : <Repeat className="mr-1 h-3 w-3" />}
                                       {exerciseMode === "time" ? "Time" : exerciseMode === "reps_sets" ? "Reps + sets" : "Reps"}
                                     </Badge>
                                     {renderExerciseModeSelect(exerciseMode, (mode) => updateCustomExerciseMode(section.key, cf.key, mode))}
                                   </div>
                                 )}
                              </div>
                            )}

                            {!isEditing && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => startEditLabel(section.key, cf.key, cf.label)}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteCustomField(section.key, cf.key)}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                <Switch checked={cf.enabled} onCheckedChange={(value) => toggleCustomField(section.key, cf.key, value)} className="scale-75" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {addingToSection === section.key ? (
                      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-3">
                         <div className="grid gap-2 md:grid-cols-[1fr_120px_130px_auto_auto_auto] md:items-center">
                          <Input
                            value={newFieldLabel}
                            onChange={(e) => setNewFieldLabel(e.target.value)}
                            placeholder="Custom field label"
                            className="h-9 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addCustomField(section.key);
                              if (e.key === "Escape") setAddingToSection(null);
                            }}
                          />
                          <Select value={newFieldType} onValueChange={(value: "text" | "number" | "textarea") => setNewFieldType(value)}>
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="textarea">Long Text</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={newFieldUnit}
                            onChange={(e) => setNewFieldUnit(e.target.value)}
                            placeholder="Unit"
                            className="h-9 text-xs"
                          />
                          {isExerciseAssessmentSection(section.key) && renderExerciseModeSelect(newExerciseMode, setNewExerciseMode)}
                          <button onClick={() => addCustomField(section.key)} className="rounded bg-success/10 p-2 text-success transition-colors hover:bg-success/20">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setAddingToSection(null)} className="rounded p-2 text-muted-foreground transition-colors hover:bg-muted/50">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                         <p className="mt-2 text-[11px] text-muted-foreground">Use custom fields for branch-specific questions that are not part of the default assessment template.</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingToSection(section.key)}
                        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-accent transition-colors hover:bg-accent/5"
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
