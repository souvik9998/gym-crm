import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Plus, ChevronDown, ChevronUp, Calendar, User, Trash2, AlertTriangle } from "lucide-react";
import type { MemberAssessment } from "./MemberHealthTab";

interface AssessmentSectionProps {
  assessments: MemberAssessment[];
  memberId: string;
  branchId: string;
  onRefresh: () => Promise<void>;
}

export const AssessmentSection = ({ assessments, memberId, branchId, onRefresh }: AssessmentSectionProps) => {
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    assessed_by: "",
    current_condition: "",
    injuries_health_issues: "",
    mobility_limitations: "",
    allowed_exercises: "",
    notes: "",
  });

  const handleSave = async () => {
    if (!form.assessed_by.trim()) {
      toast.error("Please enter assessor name");
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.from("member_assessments").insert({
        member_id: memberId,
        branch_id: branchId,
        assessed_by: form.assessed_by,
        current_condition: form.current_condition || null,
        injuries_health_issues: form.injuries_health_issues || null,
        mobility_limitations: form.mobility_limitations || null,
        allowed_exercises: form.allowed_exercises || null,
        notes: form.notes || null,
      });
      if (error) throw error;
      toast.success("Assessment saved");
      setForm({ assessed_by: "", current_condition: "", injuries_health_issues: "", mobility_limitations: "", allowed_exercises: "", notes: "" });
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

  return (
    <div className="space-y-3">
      {!showForm && (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full rounded-lg">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Assessment
        </Button>
      )}

      {showForm && (
        <div className="space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
          <div>
            <Label className="text-xs">Assessed By *</Label>
            <Input value={form.assessed_by} onChange={e => setForm(f => ({ ...f, assessed_by: e.target.value }))} placeholder="Trainer / Admin name" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Current Condition</Label>
            <Textarea value={form.current_condition} onChange={e => setForm(f => ({ ...f, current_condition: e.target.value }))} placeholder="Overall physical condition..." className="mt-1 text-sm min-h-[60px]" />
          </div>
          <div>
            <Label className="text-xs">Injuries / Health Issues</Label>
            <Textarea value={form.injuries_health_issues} onChange={e => setForm(f => ({ ...f, injuries_health_issues: e.target.value }))} placeholder="Any injuries or health concerns..." className="mt-1 text-sm min-h-[60px]" />
          </div>
          <div>
            <Label className="text-xs">Mobility / Limitations</Label>
            <Textarea value={form.mobility_limitations} onChange={e => setForm(f => ({ ...f, mobility_limitations: e.target.value }))} placeholder="Movement restrictions..." className="mt-1 text-sm min-h-[60px]" />
          </div>
          <div>
            <Label className="text-xs">Allowed Exercises / Lifts</Label>
            <Textarea value={form.allowed_exercises} onChange={e => setForm(f => ({ ...f, allowed_exercises: e.target.value }))} placeholder="Safe exercises..." className="mt-1 text-sm min-h-[60px]" />
          </div>
          <div>
            <Label className="text-xs">Notes / Recommendations</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." className="mt-1 text-sm min-h-[60px]" />
          </div>
          <div className="flex gap-2">
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
        assessments.map(a => (
          <div key={a.id} className="rounded-xl border border-border/60 bg-card/50 p-3 hover:border-border transition-colors">
            {/* Inline delete confirmation */}
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
                {a.current_condition && <DetailRow label="Condition" value={a.current_condition} />}
                {a.injuries_health_issues && <DetailRow label="Injuries" value={a.injuries_health_issues} />}
                {a.mobility_limitations && <DetailRow label="Mobility" value={a.mobility_limitations} />}
                {a.allowed_exercises && <DetailRow label="Allowed Exercises" value={a.allowed_exercises} />}
                {a.notes && <DetailRow label="Notes" value={a.notes} />}
              </div>
            )}
          </div>
        ))
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
