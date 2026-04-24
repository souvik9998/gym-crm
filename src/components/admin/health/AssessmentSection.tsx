import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Plus, ChevronDown, ChevronUp, Calendar, User, Trash2, AlertTriangle, Info, Maximize2, Minimize2, PanelTopOpen, FileEdit, CheckCircle2, Save } from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import type { MemberAssessment } from "./MemberHealthTab";
import { ASSESSMENT_SECTIONS, getAssessmentFieldMeta, getDefaultAssessmentSettings, getExerciseInputMode, isExerciseAssessmentSection, type AssessmentSettings, type CustomField, type ExerciseFieldValue, type ExerciseInputMode } from "@/components/admin/health/assessmentConfig";

interface AssessmentSectionProps {
  assessments: MemberAssessment[];
  memberId: string;
  branchId: string;
  onRefresh: () => Promise<void>;
}

interface AssessorOption {
  id: string;
  name: string;
  role?: string;
}

export const AssessmentSection = ({ assessments, memberId, branchId, onRefresh }: AssessmentSectionProps) => {
  const { isAdmin } = useIsAdmin();
  const { isStaffLoggedIn, staffUser, permissions } = useStaffAuth();
  const [showForm, setShowForm] = useState(false);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [config, setConfig] = useState<AssessmentSettings>(getDefaultAssessmentSettings());
  const [assessorOptions, setAssessorOptions] = useState<AssessorOption[]>([]);
  const [loadingAssessors, setLoadingAssessors] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({ assessed_by: "" });
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  useEffect(() => {
    fetchConfig();
  }, [branchId]);

  useEffect(() => {
    fetchAssessors();
  }, [branchId, isStaffLoggedIn, staffUser?.id, staffUser?.fullName, permissions?.member_access_type, isAdmin]);

  useEffect(() => {
    if (!showForm || assessorOptions.length === 0) return;

    setFormData((prev) => {
      if (prev.assessed_by && assessorOptions.some((option) => option.name === prev.assessed_by)) {
        return prev;
      }

      if (isStaffLoggedIn && staffUser?.fullName) {
        const selfOption = assessorOptions.find((option) => option.id === staffUser.id || option.name === staffUser.fullName);
        if (selfOption) return { ...prev, assessed_by: selfOption.name };
      }

      if (assessorOptions.length === 1) {
        return { ...prev, assessed_by: assessorOptions[0].name };
      }

      return prev;
    });
  }, [showForm, assessorOptions, isStaffLoggedIn, staffUser?.id, staffUser?.fullName]);

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
        const merged = getDefaultAssessmentSettings();
        Object.keys(parsed).forEach((key) => {
          merged[key] = { ...merged[key], ...parsed[key] };
        });
        setConfig(merged);
      }
    } catch (err) {
      console.error("Error fetching assessment config:", err);
    }
  };

  const fetchAssessors = async () => {
    if (!branchId) return;

    setLoadingAssessors(true);
    try {
      if (isLimitedAccess && staffUser) {
        setAssessorOptions([{ id: staffUser.id, name: staffUser.fullName, role: staffUser.role }]);
        return;
      }

      const [{ data: branchStaffNames, error: namesError }, { data: assignments, error: assignmentsError }] = await Promise.all([
        supabase.rpc("get_staff_names_for_branch" as any, { _branch_id: branchId }),
        supabase
          .from("staff_branch_assignments")
          .select("staff_id, staff!inner(id, full_name, role, is_active)")
          .eq("branch_id", branchId),
      ]);

      if (namesError) throw namesError;
      if (assignmentsError) throw assignmentsError;

      const roleMap = new Map<string, { id: string; role?: string }>();
      ((assignments as any[]) || []).forEach((assignment) => {
        const staff = assignment.staff;
        if (staff?.id && staff?.full_name && staff?.is_active) {
          roleMap.set(String(staff.full_name).trim().toLowerCase(), { id: staff.id, role: staff.role });
        }
      });

      const deduped = new Map<string, AssessorOption>();
      ((branchStaffNames as any[]) || []).forEach((item) => {
        if (!item?.full_name || !item?.id) return;
        const normalizedName = String(item.full_name).trim();
        const roleInfo = roleMap.get(normalizedName.toLowerCase());
        const optionId = roleInfo?.id || item.id;
        if (!deduped.has(optionId)) {
          deduped.set(optionId, {
            id: optionId,
            name: normalizedName,
            role: roleInfo?.role,
          });
        }
      });

      if (isStaffLoggedIn && staffUser && !deduped.has(staffUser.id)) {
        deduped.set(staffUser.id, { id: staffUser.id, name: staffUser.fullName, role: staffUser.role });
      }

      setAssessorOptions(Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Error fetching assessors:", err);
      if (isStaffLoggedIn && staffUser) {
        setAssessorOptions([{ id: staffUser.id, name: staffUser.fullName, role: staffUser.role }]);
      } else {
        setAssessorOptions([]);
      }
    } finally {
      setLoadingAssessors(false);
    }
  };

  const getEnabledSections = () => ASSESSMENT_SECTIONS.filter((section) => config[section.key]?.enabled);

  const getEnabledFields = (sectionKey: string): { key: string; label: string }[] => {
    const section = ASSESSMENT_SECTIONS.find((item) => item.key === sectionKey);
    const sectionConfig = config[sectionKey];
    const result: { key: string; label: string }[] = [];

    if (section?.fields) {
      section.fields.forEach((field) => {
        if (sectionConfig?.fields?.[field.key] !== false) {
          result.push({ key: field.key, label: sectionConfig?.field_labels?.[field.key] || field.label });
        }
      });
    }

    sectionConfig?.custom_fields?.forEach((field) => {
      if (field.enabled) result.push({ key: field.key, label: field.label });
    });

    return result;
  };

  const getCustomFieldInputType = (fieldKey: string): "text" | "number" | "textarea" | "select" => {
    for (const sectionKey of Object.keys(config)) {
      const field = config[sectionKey]?.custom_fields?.find((item) => item.key === fieldKey);
      if (field) return field.input_type;
    }
    return "text";
  };

  const getCustomFieldUnit = (fieldKey: string) => {
    for (const sectionKey of Object.keys(config)) {
      const field = config[sectionKey]?.custom_fields?.find((item) => item.key === fieldKey);
      if (field?.unit) return field.unit;
    }
    return "";
  };

  const updateField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updateExerciseField = (key: string, patch: Partial<ExerciseFieldValue>) => {
    const existing = (formData[key] ? JSON.parse(formData[key]) : { mode: "reps" }) as ExerciseFieldValue;
    setFormData((prev) => ({ ...prev, [key]: JSON.stringify({ ...existing, ...patch }) }));
  };

  const getExerciseValue = (key: string, mode: ExerciseInputMode): ExerciseFieldValue => {
    try {
      const parsed = formData[key] ? JSON.parse(formData[key]) : null;
      if (parsed && typeof parsed === "object") return { mode, unit: "sec", ...parsed };
    } catch {}
    return { mode, unit: "sec" };
  };

  const handleSave = async () => {
    if (!formData.assessed_by?.trim()) {
      toast.error("Please select who took this assessment");
      return;
    }

    setIsSaving(true);
    try {
      const { assessed_by, ...rest } = formData;
      const assessmentData: Record<string, string> = {};

      getEnabledSections().forEach((section) => {
        const fields = getEnabledFields(section.key);
        if (section.fields || config[section.key]?.custom_fields?.length) {
          fields.forEach((field) => {
            if (rest[field.key]) {
              assessmentData[field.key] = rest[field.key];
            }
          });
        } else if (rest[section.key]) {
          assessmentData[section.key] = rest[section.key];
        }
      });

      const { error } = await supabase.from("member_assessments").insert({
        member_id: memberId,
        branch_id: branchId,
        assessed_by,
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
      setIsFormExpanded(false);
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

  const formatDate = (date: string) => new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const renderExerciseInput = (fieldKey: string, label: string, mode: ExerciseInputMode) => {
    const value = getExerciseValue(fieldKey, mode);

    return (
      <div key={fieldKey} className="rounded-lg border border-border/50 bg-background/90 p-2.5 sm:p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs font-medium text-foreground">{label}</Label>
          <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
            {mode === "time" ? "Time" : mode === "reps_sets" ? "Reps + sets" : "Reps"}
          </Badge>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 min-[440px]:grid-cols-2">
          {mode !== "time" && (
            <div>
              <Label className="text-[11px] text-muted-foreground">Reps</Label>
              <Input value={value.reps || ""} onChange={(e) => updateExerciseField(fieldKey, { mode, reps: e.target.value })} placeholder="10" className="mt-1 h-10 text-sm" />
            </div>
          )}
          {mode === "reps_sets" && (
            <div>
              <Label className="text-[11px] text-muted-foreground">Sets</Label>
              <Input value={value.sets || ""} onChange={(e) => updateExerciseField(fieldKey, { mode, sets: e.target.value })} placeholder="3" className="mt-1 h-10 text-sm" />
            </div>
          )}
          {mode === "time" && (
            <>
              <div>
                <Label className="text-[11px] text-muted-foreground">Duration</Label>
                <Input value={value.time || ""} onChange={(e) => updateExerciseField(fieldKey, { mode, time: e.target.value })} placeholder="60" className="mt-1 h-10 text-sm" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Unit</Label>
                <Select value={value.unit || "sec"} onValueChange={(unit: "sec" | "min") => updateExerciseField(fieldKey, { mode, unit })}>
                  <SelectTrigger className="mt-1 h-10 w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sec">Seconds</SelectItem>
                    <SelectItem value="min">Minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderFieldInput = (sectionKey: string, fieldKey: string, label: string, customField?: CustomField) => {
    const isCustom = fieldKey.startsWith("custom_");
    const meta = isCustom ? { inputType: getCustomFieldInputType(fieldKey) } : getAssessmentFieldMeta(fieldKey);
    const inputType = meta.inputType || "text";
    const unit = isCustom ? getCustomFieldUnit(fieldKey) : config[sectionKey]?.field_units?.[fieldKey] || meta.unit;
    const helpText = !isCustom ? meta.helpText : undefined;
    const placeholder = meta.placeholder || `Enter ${label.toLowerCase()}`;
    const options = !isCustom ? meta.options : undefined;
    const isExerciseField = isExerciseAssessmentSection(sectionKey) || customField?.kind === "exercise";

    if (isExerciseField) {
      return renderExerciseInput(fieldKey, label, getExerciseInputMode(config, sectionKey, fieldKey, customField));
    }

    const fieldControl = (() => {
      if (inputType === "select" && options?.length) {
        return (
          <Select value={formData[fieldKey] || ""} onValueChange={(value) => updateField(fieldKey, value)}>
            <SelectTrigger className="mt-1 h-10 w-full text-sm">
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      if (inputType === "textarea") {
        return (
          <Textarea
            value={formData[fieldKey] || ""}
            onChange={(e) => updateField(fieldKey, e.target.value)}
            placeholder={placeholder}
            className="mt-1 min-h-[96px] resize-y text-sm leading-5"
          />
        );
      }

      return (
        <div className="relative mt-1">
          <Input
            type={inputType === "number" ? "number" : "text"}
            value={formData[fieldKey] || ""}
            onChange={(e) => updateField(fieldKey, e.target.value)}
            placeholder={placeholder}
            className={unit ? "h-10 pr-14 text-sm" : "h-10 text-sm"}
          />
          {unit && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
              {unit}
            </span>
          )}
        </div>
      );
    })();

    return (
      <div key={fieldKey} className="rounded-lg border border-border/50 bg-background/90 p-2.5 sm:p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs font-medium text-foreground">{label}</Label>
          {unit && <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">{unit}</Badge>}
        </div>
        {fieldControl}
        {helpText && <p className="mt-2 text-[11px] text-muted-foreground">{helpText}</p>}
      </div>
    );
  };

  const getAssessmentDisplayData = (assessment: MemberAssessment): { label: string; value: string }[] => {
    const data = assessment.assessment_data || {};
    const items: { label: string; value: string }[] = [];
    const labelMap: Record<string, string> = {};

    ASSESSMENT_SECTIONS.forEach((section) => {
      const sectionConfig = config[section.key];
      section.fields?.forEach((field) => {
        labelMap[field.key] = sectionConfig?.field_labels?.[field.key] || field.label;
      });
      labelMap[section.key] = section.label;
      sectionConfig?.custom_fields?.forEach((field) => {
        labelMap[field.key] = field.label;
      });
    });

    Object.entries(data).forEach(([key, value]) => {
      if (!value || !String(value).trim()) return;

      const sectionKey = ASSESSMENT_SECTIONS.find((section) =>
        section.fields?.some((field) => field.key === key) || config[section.key]?.custom_fields?.some((field) => field.key === key)
      )?.key;
      const customField = sectionKey ? config[sectionKey]?.custom_fields?.find((field) => field.key === key) : undefined;

      if (sectionKey && (isExerciseAssessmentSection(sectionKey) || customField?.kind === "exercise")) {
        try {
          const parsed = typeof value === "string" ? JSON.parse(value) as ExerciseFieldValue : value as ExerciseFieldValue;
          const formatted = parsed.mode === "time"
            ? `${parsed.time || "—"} ${parsed.unit || "sec"}`
            : parsed.mode === "reps_sets"
              ? `${parsed.reps || "—"} reps × ${parsed.sets || "—"} sets`
              : `${parsed.reps || "—"} reps`;

          items.push({ label: labelMap[key] || key, value: formatted });
          return;
        } catch {
          // fall through to raw rendering
        }
      }

      items.push({ label: labelMap[key] || key, value: String(value) });
    });

    if (items.length === 0) {
      if (assessment.current_condition) items.push({ label: "Condition", value: assessment.current_condition });
      if (assessment.injuries_health_issues) items.push({ label: "Injuries", value: assessment.injuries_health_issues });
      if (assessment.mobility_limitations) items.push({ label: "Mobility", value: assessment.mobility_limitations });
      if (assessment.allowed_exercises) items.push({ label: "Allowed Exercises", value: assessment.allowed_exercises });
      if (assessment.notes) items.push({ label: "Notes", value: assessment.notes });
    }

    return items;
  };

  const enabledSections = getEnabledSections();

  const renderAssessmentForm = (expanded = false) => (
    <div
      className={expanded
        ? "flex h-full max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-accent/20 bg-accent/5"
        : "space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-2 sm:p-3 lg:p-4 max-h-[76vh] overflow-y-auto overscroll-contain pr-1 sm:pr-2"
      }
    >
      <div className={expanded ? "shrink-0 border-b border-border/40 bg-background/85 px-3 py-3 sm:px-5" : "rounded-lg border border-border/50 bg-background/80 p-2.5 sm:p-3"}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-accent" />
            <div>
              <p className="text-sm font-medium text-foreground">Assessment form preview</p>
              <p className="text-xs text-muted-foreground">Only the enabled sections and fields from settings are shown here, with their configured labels and units.</p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsFormExpanded((prev) => !prev)}
            className="h-8 rounded-lg px-2.5 text-[11px]"
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {expanded ? "Exit large view" : "Enlarge"}
          </Button>
        </div>
      </div>

      <div className={expanded ? "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 pb-4 sm:px-5 sm:py-4" : "space-y-3"}>
        {expanded && (
          <div className="rounded-xl border border-border/50 bg-background/90 px-4 py-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <PanelTopOpen className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Focused assessment workspace</p>
                <p className="text-xs text-muted-foreground">This enlarged view gives the form more room so every field stays readable and easier to complete.</p>
              </div>
            </div>
          </div>
        )}

        <div className={expanded ? "rounded-xl border border-border/50 bg-background/95 p-3 sm:p-4" : "rounded-lg border border-border/50 bg-background/90 p-2.5 sm:p-3"}>
          <Label className="text-xs font-medium text-foreground">Assessed By *</Label>
          <Select value={formData.assessed_by || undefined} onValueChange={(value) => updateField("assessed_by", value)} disabled={loadingAssessors || assessorOptions.length === 0}>
            <SelectTrigger className={expanded ? "mt-1.5 h-11 text-sm" : "mt-1 h-10 text-sm"}>
              <SelectValue placeholder={loadingAssessors ? "Loading trainers / staff..." : assessorOptions.length === 0 ? "No allowed assessor available" : "Select trainer / staff"} />
            </SelectTrigger>
            <SelectContent>
              {assessorOptions.map((option) => (
                <SelectItem key={option.id} value={option.name}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{option.name}</span>
                    {option.role && (
                      <span className="text-[10px] capitalize text-muted-foreground">{option.role}</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isLimitedAccess
              ? "Restricted staff can only register assessments under their own name."
              : "Only trainers and staff allowed for this branch are shown here."}
          </p>
        </div>

        {enabledSections.map((section) => {
          const fields = getEnabledFields(section.key);
          const hasFields = !!section.fields || !!config[section.key]?.custom_fields?.length;
          const Icon = section.icon;

          return (
            <div key={section.key} className={expanded ? "rounded-2xl border border-border/50 bg-background/95 p-3 sm:p-4 lg:p-5 space-y-4 shadow-sm" : "rounded-xl border border-border/50 bg-background/80 p-2.5 sm:p-3 lg:p-3.5 space-y-3"}>
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div className={expanded ? "flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent" : "flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={expanded ? "text-base font-semibold text-foreground" : "text-sm font-semibold text-foreground"}>{section.label}</p>
                    <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                      {hasFields ? `${fields.length} fields` : "Notes"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{section.purpose}</p>
                </div>
              </div>

              {hasFields ? (
                <div className={expanded ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "grid grid-cols-1 gap-2 min-[560px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
                  {fields.map((field) => {
                    const customField = config[section.key]?.custom_fields?.find((item) => item.key === field.key);
                    return renderFieldInput(section.key, field.key, field.label, customField);
                  })}
                </div>
              ) : (
                <div className={expanded ? "rounded-xl border border-border/50 bg-background/95 p-3 sm:p-4" : "rounded-lg border border-border/50 bg-background/90 p-2.5 sm:p-3"}>
                  <Label className="text-xs font-medium text-foreground">{section.label}</Label>
                  <Textarea
                    value={formData[section.key] || ""}
                    onChange={(e) => updateField(section.key, e.target.value)}
                    placeholder={`Enter ${section.label.toLowerCase()}...`}
                    className={expanded ? "mt-1.5 min-h-[144px] resize-y text-sm leading-5" : "mt-1 min-h-[112px] resize-y text-sm leading-5"}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={expanded ? "sticky bottom-0 z-10 shrink-0 border-t border-border/40 bg-background/95 px-3 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:px-5 backdrop-blur supports-[backdrop-filter]:bg-background/85" : "sticky bottom-0 flex gap-2 border-t border-border/40 bg-background/95 px-1 pt-3 pb-1 backdrop-blur supports-[backdrop-filter]:bg-background/80"}>
        <div className={expanded ? "flex flex-col gap-2 sm:flex-row" : "flex w-full gap-2"}>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="flex-1 rounded-lg">
            {isSaving ? <><ButtonSpinner /> Saving...</> : "Save Assessment"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            if (expanded) setIsFormExpanded(false);
            else {
              setShowForm(false);
              setFormData({ assessed_by: "" });
            }
          }} className="rounded-lg">
            {expanded ? "Back to dialog" : "Cancel"}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {!showForm && (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full rounded-lg">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Assessment
        </Button>
      )}

      {showForm && !isFormExpanded && renderAssessmentForm(false)}

      <Dialog open={showForm && isFormExpanded} onOpenChange={(open) => {
        if (!open) setIsFormExpanded(false);
      }}>
        <DialogContent className="h-[calc(100dvh-0.75rem)] max-h-[calc(100dvh-0.75rem)] w-[calc(100vw-0.75rem)] max-w-[1180px] gap-0 overflow-hidden border-border/60 p-0 sm:h-[92vh] sm:max-h-[92vh] sm:w-[min(96vw,1180px)]">
          {renderAssessmentForm(true)}
        </DialogContent>
      </Dialog>

      {assessments.length === 0 && !showForm ? (
        <div className="text-center py-8 text-muted-foreground">
          <ClipboardListIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No assessments added yet</p>
        </div>
      ) : (
        assessments.map((assessment) => {
          const displayData = getAssessmentDisplayData(assessment);
          return (
            <div key={assessment.id} className="rounded-xl border border-border/60 bg-card/50 p-3 hover:border-border transition-colors">
              {confirmDeleteId === assessment.id && (
                <div className="flex flex-wrap items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 mb-2 animate-in fade-in duration-200">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <span className="text-xs text-destructive font-medium flex-1 min-w-0">Delete this assessment?</span>
                  <div className="flex gap-2 ml-auto">
                    <Button size="sm" variant="destructive" className="h-6 text-xs px-2 rounded-md" onClick={() => handleDelete(assessment.id)} disabled={deletingId === assessment.id}>
                      {deletingId === assessment.id ? <ButtonSpinner /> : "Delete"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs px-2 rounded-md" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setExpandedId(expandedId === assessment.id ? null : assessment.id)} className="flex items-center gap-1.5 sm:gap-2.5 text-left flex-1 min-w-0 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{formatDate(assessment.assessment_date)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:inline">•</span>
                  <div className="flex items-center gap-1.5 text-xs font-medium min-w-0">
                    <User className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{assessment.assessed_by}</span>
                  </div>
                  {displayData.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">{displayData.length} fields</span>
                  )}
                </button>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDeleteId(confirmDeleteId === assessment.id ? null : assessment.id)}
                    disabled={deletingId === assessment.id}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                  <button onClick={() => setExpandedId(expandedId === assessment.id ? null : assessment.id)} className="p-1">
                    {expandedId === assessment.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              {expandedId === assessment.id && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {displayData.map((item, idx) => (
                    <DetailRow key={idx} label={item.label} value={item.value} />
                  ))}
                  {displayData.length === 0 && (
                    <p className="text-xs text-muted-foreground italic sm:col-span-2">No assessment data recorded</p>
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
