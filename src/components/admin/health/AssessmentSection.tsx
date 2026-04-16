import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Plus, ChevronDown, ChevronUp, Calendar, User, Trash2, AlertTriangle } from "lucide-react";
import type { MemberAssessment } from "./MemberHealthTab";
import { ASSESSMENT_SECTIONS, type AssessmentSettings, type CustomField } from "@/components/admin/AssessmentFieldsSettings";

interface AssessmentSectionProps {
  assessments: MemberAssessment[];
  memberId: string;
  branchId: string;
  onRefresh: () => Promise<void>;
}

// Field metadata for rendering the right input type
const FIELD_INPUT_TYPE: Record<string, "number" | "text" | "select" | "textarea"> = {
  weight: "number",
  height: "number",
  mode_of_training: "text",
  diet_type: "select",
  alcohol: "select",
  smoking: "select",
  physical_activity_current: "textarea",
  physical_activity_past: "textarea",
  deficiency: "text",
  medication: "text",
  health_conditions: "textarea",
  injuries_pain: "textarea",
  bp: "text",
  rhr: "number",
  spo2: "number",
  grip_strength: "text",
  pushups: "number",
  landmine: "number",
  pullups: "number",
  squats: "number",
  sit_to_stand: "number",
  glute_bridge: "number",
  leg_raises: "number",
  plank: "text",
  calf_raises: "number",
  neck: "number",
  chest: "number",
  arms: "text",
  upper_abdomen: "number",
  lower_abdomen: "number",
  hips: "number",
  upper_thighs: "text",
  lower_thighs: "text",
  calf: "text",
};

const SELECT_OPTIONS: Record<string, string[]> = {
  diet_type: ["Vegetarian", "Non-Vegetarian", "Vegan", "Eggetarian"],
  alcohol: ["None", "Occasional", "Regular"],
  smoking: ["None", "Occasional", "Regular"],
};

const FIELD_PLACEHOLDERS: Record<string, string> = {
  weight: "e.g. 70",
  height: "e.g. 175",
  mode_of_training: "e.g. Strength, Cardio",
  bp: "e.g. 120/80",
  rhr: "e.g. 72",
  spo2: "e.g. 98",
  grip_strength: "e.g. L:30 R:32 kg",
  plank: "e.g. 60 sec",
  arms: "e.g. L:12 R:12.5 in",
  upper_thighs: "e.g. L:22 R:22 in",
  lower_thighs: "e.g. L:16 R:16 in",
  calf: "e.g. L:14 R:14 in",
};

const getDefaultConfig = (): AssessmentSettings => {
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

export const AssessmentSection = ({ assessments, memberId, branchId, onRefresh }: AssessmentSectionProps) => {
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [config, setConfig] = useState<AssessmentSettings>(getDefaultConfig());
  const [formData, setFormData] = useState<Record<string, string>>({ assessed_by: "" });

  useEffect(() => {
    fetchConfig();
  }, [branchId]);

  const fetchConfig = async () => {
    try {
      const { data } = await supabase
        .from("gym_settings")
        .select("assessment_field_settings")
        .eq("branch_id", branchId)
        .maybeSingle();
      if (data?.assessment_field_settings) {
        const parsed = typeof data.assessment_field_settings === "string"
          ? JSON.parse(data.assessment_field_settings)
          : data.assessment_field_settings;
        const merged = getDefaultConfig();
        Object.keys(parsed).forEach((key) => {
          merged[key] = { ...merged[key], ...parsed[key] };
        });
        setConfig(merged);
      }
    } catch (err) {
      console.error("Error fetching assessment config:", err);
    }
  };

  const getEnabledSections = () => {
    return ASSESSMENT_SECTIONS.filter((s) => config[s.key]?.enabled);
  };

  const getEnabledFields = (sectionKey: string): { key: string; label: string }[] => {
    const section = ASSESSMENT_SECTIONS.find((s) => s.key === sectionKey);
    const sectionConfig = config[sectionKey];
    const result: { key: string; label: string }[] = [];

    // Built-in fields
    if (section?.fields) {
      section.fields.forEach((f) => {
        if (sectionConfig?.fields?.[f.key] !== false) {
          const label = sectionConfig?.field_labels?.[f.key] || f.label;
          result.push({ key: f.key, label });
        }
      });
    }

    // Custom fields
    if (sectionConfig?.custom_fields) {
      sectionConfig.custom_fields.forEach((cf) => {
        if (cf.enabled) {
          result.push({ key: cf.key, label: cf.label });
        }
      });
    }

    return result;
  };

  const getCustomFieldInputType = (fieldKey: string): "text" | "number" | "textarea" | "select" => {
    // Search through all sections for the custom field
    for (const sectionKey of Object.keys(config)) {
      const cf = config[sectionKey]?.custom_fields?.find((c) => c.key === fieldKey);
      if (cf) return cf.input_type;
    }
    return "text";
  };

  const updateField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!formData.assessed_by?.trim()) {
      toast.error("Please enter assessor name");
      return;
    }
    setIsSaving(true);
    try {
      const { assessed_by, ...rest } = formData;
      const assessmentData: Record<string, any> = {};

      getEnabledSections().forEach((section) => {
        const enabledFields = getEnabledFields(section.key);
        if (section.fields || config[section.key]?.custom_fields?.length) {
          enabledFields.forEach((field) => {
            if (rest[field.key]) assessmentData[field.key] = rest[field.key];
          });
        } else {
          if (rest[section.key]) assessmentData[section.key] = rest[section.key];
        }
      });

      const { error } = await supabase.from("member_assessments").insert({
        member_id: memberId,
        branch_id: branchId,
        assessed_by: assessed_by,
        assessment_data: assessmentData,
        current_condition: assessmentData.health_conditions || null,
        injuries_health_issues: assessmentData.injuries_pain || null,
        mobility_limitations: null,
        allowed_exercises: null,
        notes: assessmentData.notes || null,
      });
      if (error) throw error;
      toast.success("Assessment saved");
      setFormData({ assessed_by: "" });
      setShowForm(false);
      await onRefresh();
    } catch (err: any) {
      toast.error("Error saving assessment", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      const { error } = await supabase.from("member_assessments").delete().eq("id", id);
      if (error) throw error;
      toast.success("Assessment deleted");
      await onRefresh();
    } catch (err: any) {
      toast.error("Error deleting assessment", { description: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const renderFieldInput = (fieldKey: string, label: string) => {
    // Check custom field type first, then fall back to built-in map
    const isCustom = fieldKey.startsWith("custom_");
    const inputType = isCustom ? getCustomFieldInputType(fieldKey) : (FIELD_INPUT_TYPE[fieldKey] || "text");
    const placeholder = FIELD_PLACEHOLDERS[fieldKey] || "";

    if (inputType === "select" && SELECT_OPTIONS[fieldKey]) {
      return (
        <div key={fieldKey}>
          <Label className="text-xs">{label}</Label>
          <Select value={formData[fieldKey] || ""} onValueChange={(v) => updateField(fieldKey, v)}>
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {SELECT_OPTIONS[fieldKey].map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (inputType === "textarea") {
      return (
        <div key={fieldKey}>
          <Label className="text-xs">{label}</Label>
          <Textarea
            value={formData[fieldKey] || ""}
            onChange={(e) => updateField(fieldKey, e.target.value)}
            placeholder={placeholder || `Enter ${label.toLowerCase()}...`}
            className="mt-1 text-sm min-h-[60px]"
          />
        </div>
      );
    }

    return (
      <div key={fieldKey}>
        <Label className="text-xs">{label}</Label>
        <Input
          type={inputType === "number" ? "number" : "text"}
          value={formData[fieldKey] || ""}
          onChange={(e) => updateField(fieldKey, e.target.value)}
          placeholder={placeholder || `Enter ${label.toLowerCase()}`}
          className="mt-1 h-8 text-sm"
        />
      </div>
    );
  };

  const getAssessmentDisplayData = (a: any): { label: string; value: string }[] => {
    const data = a.assessment_data || {};
    const items: { label: string; value: string }[] = [];

    // Build label map from config (includes custom labels & custom fields)
    const labelMap: Record<string, string> = {};
    ASSESSMENT_SECTIONS.forEach((section) => {
      const sectionConfig = config[section.key];
      if (section.fields) {
        section.fields.forEach((f) => {
          labelMap[f.key] = sectionConfig?.field_labels?.[f.key] || f.label;
        });
      }
      labelMap[section.key] = section.label;
      // Custom fields
      sectionConfig?.custom_fields?.forEach((cf) => {
        labelMap[cf.key] = cf.label;
      });
    });

    Object.entries(data).forEach(([key, value]) => {
      if (value && String(value).trim()) {
        items.push({ label: labelMap[key] || key, value: String(value) });
      }
    });

    // Legacy fields fallback
    if (items.length === 0) {
      if (a.current_condition) items.push({ label: "Condition", value: a.current_condition });
      if (a.injuries_health_issues) items.push({ label: "Injuries", value: a.injuries_health_issues });
      if (a.mobility_limitations) items.push({ label: "Mobility", value: a.mobility_limitations });
      if (a.allowed_exercises) items.push({ label: "Allowed Exercises", value: a.allowed_exercises });
      if (a.notes) items.push({ label: "Notes", value: a.notes });
    }

    return items;
  };

  const enabledSections = getEnabledSections();

  return (
    <div className="space-y-3">
      {!showForm && (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full rounded-lg">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Assessment
        </Button>
      )}

      {showForm && (
        <div className="space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-3 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="text-xs">Assessed By *</Label>
            <Input
              value={formData.assessed_by || ""}
              onChange={(e) => updateField("assessed_by", e.target.value)}
              placeholder="Trainer / Admin name"
              className="mt-1 h-8 text-sm"
            />
          </div>

          {enabledSections.map((section) => {
            const fields = getEnabledFields(section.key);
            const hasFields = section.fields || config[section.key]?.custom_fields?.length;
            const Icon = section.icon;

            return (
              <div key={section.key} className="space-y-2">
                <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                  <Icon className="w-3.5 h-3.5 text-accent" />
                  <p className="text-xs font-semibold text-foreground">{section.label}</p>
                </div>
                {hasFields ? (
                  <div className={fields.length <= 3 ? "space-y-2" : "grid grid-cols-2 gap-2"}>
                    {fields.map((f) => renderFieldInput(f.key, f.label))}
                  </div>
                ) : (
                  <Textarea
                    value={formData[section.key] || ""}
                    onChange={(e) => updateField(section.key, e.target.value)}
                    placeholder={`Enter ${section.label.toLowerCase()}...`}
                    className="text-sm min-h-[60px]"
                  />
                )}
              </div>
            );
          })}

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="flex-1 rounded-lg">
              {isSaving ? <><ButtonSpinner /> Saving...</> : "Save Assessment"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="rounded-lg">Cancel</Button>
          </div>
        </div>
      )}

      {assessments.length === 0 && !showForm ? (
        <div className="text-center py-8 text-muted-foreground">
          <ClipboardListIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No assessments added yet</p>
        </div>
      ) : (
        assessments.map((a) => {
          const displayData = getAssessmentDisplayData(a);
          return (
            <div key={a.id} className="rounded-xl border border-border/60 bg-card/50 p-3 hover:border-border transition-colors">
              {confirmDeleteId === a.id && (
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 mb-2 animate-in fade-in duration-200">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <span className="text-xs text-destructive font-medium flex-1">Delete this assessment?</span>
                  <Button size="sm" variant="destructive" className="h-6 text-xs px-2 rounded-md" onClick={() => handleDelete(a.id)} disabled={deletingId === a.id}>
                    {deletingId === a.id ? <ButtonSpinner /> : "Delete"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-xs px-2 rounded-md" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <button onClick={() => setExpandedId(expandedId === a.id ? null : a.id)} className="flex items-center gap-2.5 text-left flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {formatDate(a.assessment_date)}
                  </div>
                  <span className="text-xs text-muted-foreground">•</span>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <User className="w-3 h-3" />
                    {a.assessed_by}
                  </div>
                  {displayData.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/70">{displayData.length} fields</span>
                  )}
                </button>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDeleteId(confirmDeleteId === a.id ? null : a.id)}
                    disabled={deletingId === a.id}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                  <button onClick={() => setExpandedId(expandedId === a.id ? null : a.id)} className="p-1">
                    {expandedId === a.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              {expandedId === a.id && (
                <div className="mt-3 space-y-2 text-sm">
                  {displayData.map((item, idx) => (
                    <DetailRow key={idx} label={item.label} value={item.value} />
                  ))}
                  {displayData.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No assessment data recorded</p>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-muted/30 rounded-lg p-2.5">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1">{label}</p>
    <p className="text-xs whitespace-pre-wrap">{value}</p>
  </div>
);

const ClipboardListIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);
