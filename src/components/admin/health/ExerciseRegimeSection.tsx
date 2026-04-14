import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Dumbbell } from "lucide-react";
import type { ExercisePlan } from "./MemberHealthTab";

interface ExerciseRegimeSectionProps {
  plans: ExercisePlan[];
  memberId: string;
  branchId: string;
  onRefresh: () => Promise<void>;
}

interface ExerciseFormItem {
  exercise_name: string;
  sets: number;
  reps: string;
  notes: string;
}

const GOALS = ["Weight Loss", "Muscle Gain", "General Fitness", "Rehab", "Endurance", "Strength"];
const SPLITS = ["Full Body", "Push-Pull-Legs", "Upper-Lower", "Bro Split", "Custom"];

export const ExerciseRegimeSection = ({ plans, memberId, branchId, onRefresh }: ExerciseRegimeSectionProps) => {
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [planName, setPlanName] = useState("");
  const [goal, setGoal] = useState("General Fitness");
  const [workoutSplit, setWorkoutSplit] = useState("Full Body");
  const [createdBy, setCreatedBy] = useState("");
  const [exercises, setExercises] = useState<ExerciseFormItem[]>([
    { exercise_name: "", sets: 3, reps: "10", notes: "" },
  ]);

  const addExercise = () => {
    setExercises([...exercises, { exercise_name: "", sets: 3, reps: "10", notes: "" }]);
  };

  const removeExercise = (index: number) => {
    if (exercises.length > 1) setExercises(exercises.filter((_, i) => i !== index));
  };

  const updateExercise = (index: number, field: keyof ExerciseFormItem, value: any) => {
    setExercises(exercises.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const handleSave = async () => {
    if (!planName.trim()) { toast.error("Plan name is required"); return; }
    if (!createdBy.trim()) { toast.error("Created by is required"); return; }
    const validExercises = exercises.filter(e => e.exercise_name.trim());
    if (validExercises.length === 0) { toast.error("Add at least one exercise"); return; }

    setIsSaving(true);
    try {
      // Deactivate existing active plans
      await supabase
        .from("member_exercise_plans")
        .update({ is_active: false })
        .eq("member_id", memberId)
        .eq("is_active", true);

      // Create new plan
      const { data: plan, error: planError } = await supabase
        .from("member_exercise_plans")
        .insert({
          member_id: memberId,
          branch_id: branchId,
          plan_name: planName,
          goal,
          workout_split: workoutSplit,
          created_by: createdBy,
          is_active: true,
        })
        .select("id")
        .single();

      if (planError) throw planError;

      // Insert exercises
      const exerciseRows = validExercises.map((e, i) => ({
        plan_id: plan.id,
        exercise_name: e.exercise_name,
        sets: e.sets,
        reps: e.reps,
        notes: e.notes || null,
        sort_order: i,
      }));

      const { error: exError } = await supabase.from("member_exercise_items").insert(exerciseRows);
      if (exError) throw exError;

      toast.success("Exercise plan saved");
      setShowForm(false);
      setPlanName("");
      setCreatedBy("");
      setExercises([{ exercise_name: "", sets: 3, reps: "10", notes: "" }]);
      await onRefresh();
    } catch (err: any) {
      toast.error("Error saving plan", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm("Delete this exercise plan?")) return;
    try {
      const { error } = await supabase.from("member_exercise_plans").delete().eq("id", planId);
      if (error) throw error;
      toast.success("Plan deleted");
      await onRefresh();
    } catch (err: any) {
      toast.error("Error deleting plan", { description: err.message });
    }
  };

  const activePlan = plans.find(p => p.is_active);
  const pastPlans = plans.filter(p => !p.is_active);

  return (
    <div className="space-y-3">
      {!showForm && (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full rounded-lg">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> {activePlan ? "Replace Plan" : "Add Exercise Plan"}
        </Button>
      )}

      {showForm && (
        <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Plan Name *</Label>
              <Input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Beginner Strength" className="h-8 text-xs mt-0.5" />
            </div>
            <div>
              <Label className="text-xs">Created By *</Label>
              <Input value={createdBy} onChange={e => setCreatedBy(e.target.value)} placeholder="Trainer name" className="h-8 text-xs mt-0.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Goal</Label>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOALS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Workout Split</Label>
              <Select value={workoutSplit} onValueChange={setWorkoutSplit}>
                <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPLITS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Exercises</Label>
            <div className="space-y-2 mt-1">
              {exercises.map((ex, i) => (
                <div key={i} className="flex items-start gap-1.5 bg-background/50 rounded-lg p-2">
                  <div className="flex-1 grid grid-cols-4 gap-1.5">
                    <Input value={ex.exercise_name} onChange={e => updateExercise(i, "exercise_name", e.target.value)} placeholder="Exercise" className="h-7 text-xs col-span-2" />
                    <Input type="number" value={ex.sets} onChange={e => updateExercise(i, "sets", Number(e.target.value))} placeholder="Sets" className="h-7 text-xs" />
                    <Input value={ex.reps} onChange={e => updateExercise(i, "reps", e.target.value)} placeholder="Reps" className="h-7 text-xs" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeExercise(i)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" disabled={exercises.length === 1}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={addExercise} className="mt-1 h-7 text-xs text-accent">
              <Plus className="w-3 h-3 mr-1" /> Add Exercise
            </Button>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="flex-1 rounded-lg">
              {isSaving ? <><ButtonSpinner /> Saving...</> : "Save Plan"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="rounded-lg">Cancel</Button>
          </div>
        </div>
      )}

      {/* Active Plan */}
      {activePlan && (
        <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold">{activePlan.plan_name}</span>
              <Badge className="bg-emerald-500/10 text-emerald-600 text-[10px] px-1.5 py-0 border-emerald-500/20">Active</Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeletePlan(activePlan.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <span>🎯 {activePlan.goal}</span>
            <span>📋 {activePlan.workout_split}</span>
            <span>By {activePlan.created_by}</span>
          </div>
          {activePlan.exercises.length > 0 && (
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-left p-1.5 pl-2.5 font-medium">Exercise</th>
                    <th className="text-center p-1.5 font-medium w-14">Sets</th>
                    <th className="text-center p-1.5 font-medium w-14">Reps</th>
                    <th className="text-left p-1.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlan.exercises.map((ex, i) => (
                    <tr key={ex.id} className={i % 2 === 0 ? "bg-background/50" : ""}>
                      <td className="p-1.5 pl-2.5 font-medium">{ex.exercise_name}</td>
                      <td className="text-center p-1.5">{ex.sets}</td>
                      <td className="text-center p-1.5">{ex.reps}</td>
                      <td className="p-1.5 text-muted-foreground">{ex.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Past Plans */}
      {pastPlans.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Previous Plans</p>
          {pastPlans.map(plan => (
            <div key={plan.id} className="rounded-lg border border-border/40 bg-card/30 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{plan.plan_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{plan.goal} • {plan.workout_split}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeletePlan(plan.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{plan.exercises.length} exercises • By {plan.created_by}</p>
            </div>
          ))}
        </div>
      )}

      {!activePlan && plans.length === 0 && !showForm && (
        <div className="text-center py-6 text-muted-foreground">
          <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No exercise plan assigned yet</p>
        </div>
      )}
    </div>
  );
};
