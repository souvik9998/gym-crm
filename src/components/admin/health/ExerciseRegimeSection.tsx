import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Dumbbell, AlertTriangle, Scale, Repeat, Layers3 } from "lucide-react";
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
  weight_value: string;
  weight_unit: string;
  notes: string;
}

const GOALS = ["Weight Loss", "Muscle Gain", "General Fitness", "Rehab", "Endurance", "Strength"];
const SPLITS = ["Full Body", "Push-Pull-Legs", "Upper-Lower", "Bro Split", "Custom"];
const WEIGHT_UNITS = ["kg", "lb", "bodyweight", "band", "machine"];

export const ExerciseRegimeSection = ({ plans, memberId, branchId, onRefresh }: ExerciseRegimeSectionProps) => {
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [goal, setGoal] = useState("General Fitness");
  const [workoutSplit, setWorkoutSplit] = useState("Full Body");
  const [createdBy, setCreatedBy] = useState("");
  const [exercises, setExercises] = useState<ExerciseFormItem[]>([
    { exercise_name: "", sets: 3, reps: "10", weight_value: "", weight_unit: "kg", notes: "" },
  ]);

  const addExercise = () => {
    setExercises((prev) => [...prev, { exercise_name: "", sets: 3, reps: "10", weight_value: "", weight_unit: "kg", notes: "" }]);
  };

  const removeExercise = (index: number) => {
    if (exercises.length > 1) {
      setExercises((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const updateExercise = (index: number, field: keyof ExerciseFormItem, value: string | number) => {
    setExercises((prev) => prev.map((exercise, i) => (i === index ? { ...exercise, [field]: value } : exercise)));
  };

  const handleSave = async () => {
    if (!planName.trim()) {
      toast.error("Plan name is required");
      return;
    }
    if (!createdBy.trim()) {
      toast.error("Created by is required");
      return;
    }

    const validExercises = exercises.filter((exercise) => exercise.exercise_name.trim());
    if (validExercises.length === 0) {
      toast.error("Add at least one exercise");
      return;
    }

    setIsSaving(true);
    try {
      await supabase.from("member_exercise_plans").update({ is_active: false }).eq("member_id", memberId).eq("is_active", true);

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

      const exerciseRows = validExercises.map((exercise, index) => ({
        plan_id: plan.id,
        exercise_name: exercise.exercise_name,
        sets: exercise.sets,
        reps: exercise.reps,
        weight_value: exercise.weight_value ? Number(exercise.weight_value) : null,
        weight_unit: exercise.weight_value ? exercise.weight_unit : null,
        notes: exercise.notes || null,
        sort_order: index,
      }));

      const { error: exerciseError } = await supabase.from("member_exercise_items").insert(exerciseRows as any);
      if (exerciseError) throw exerciseError;

      toast.success("Exercise plan saved");
      setShowForm(false);
      setPlanName("");
      setCreatedBy("");
      setExercises([{ exercise_name: "", sets: 3, reps: "10", weight_value: "", weight_unit: "kg", notes: "" }]);
      await onRefresh();
    } catch (err: any) {
      toast.error("Error saving plan", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    setDeletingId(planId);
    setConfirmDeleteId(null);
    try {
      const { error } = await supabase.from("member_exercise_plans").delete().eq("id", planId);
      if (error) throw error;
      toast.success("Plan deleted");
      await onRefresh();
    } catch (err: any) {
      toast.error("Error deleting plan", { description: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  const activePlan = plans.find((plan) => plan.is_active);
  const pastPlans = plans.filter((plan) => !plan.is_active);

  const formatLoad = (weightValue?: number | null, weightUnit?: string | null) => {
    if (!weightValue && weightUnit === "bodyweight") return "Bodyweight";
    if (!weightValue) return "—";
    return `${weightValue} ${weightUnit || "kg"}`;
  };

  const DeleteConfirmBanner = ({ planId, label }: { planId: string; label: string }) => (
    <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-2 mb-2 animate-in fade-in duration-200">
      <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
      <span className="text-xs text-destructive font-medium flex-1 truncate">Delete "{label}"?</span>
      <Button size="sm" variant="destructive" className="h-6 text-xs px-2 rounded-md" onClick={() => handleDeletePlan(planId)} disabled={deletingId === planId}>
        {deletingId === planId ? <ButtonSpinner /> : "Delete"}
      </Button>
      <Button size="sm" variant="outline" className="h-6 text-xs px-2 rounded-md" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
    </div>
  );

  return (
    <div className="space-y-3">
      {!showForm && (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full rounded-lg">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> {activePlan ? "Replace Plan" : "Add Exercise Plan"}
        </Button>
      )}

      {showForm && (
        <div className="space-y-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/50 bg-background/70 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Exercise details</p>
              <p className="mt-1 text-xs text-muted-foreground">Each row can include the movement name, sets, reps, and optional load.</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/70 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Load tracking</p>
              <p className="mt-1 text-xs text-muted-foreground">Use kg/lb for weights or choose bodyweight, band, or machine when needed.</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/70 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Coach notes</p>
              <p className="mt-1 text-xs text-muted-foreground">Add cues like tempo, hold time, side split, or machine setting.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Plan Name *</Label>
              <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Beginner Strength" className="h-10 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Created By *</Label>
              <Input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} placeholder="Trainer name" className="h-10 text-sm mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Goal</Label>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger className="h-10 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOALS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Workout Split</Label>
              <Select value={workoutSplit} onValueChange={setWorkoutSplit}>
                <SelectTrigger className="h-10 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPLITS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <Label className="text-xs font-semibold">Exercises</Label>
                <p className="text-[11px] text-muted-foreground mt-1">Add one line per exercise with sets, reps, and optional training load.</p>
              </div>
              <Button variant="outline" size="sm" onClick={addExercise} className="rounded-lg">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Exercise
              </Button>
            </div>

            <div className="space-y-3">
              {exercises.map((exercise, index) => (
                <div key={index} className="rounded-xl border border-border/50 bg-background/80 p-3">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent text-xs font-semibold">{index + 1}</div>
                      <span className="text-sm font-medium text-foreground">Exercise {index + 1}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeExercise(index)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" disabled={exercises.length === 1}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                    <div className="lg:col-span-4">
                      <Label className="text-xs">Exercise Name</Label>
                      <Input value={exercise.exercise_name} onChange={(e) => updateExercise(index, "exercise_name", e.target.value)} placeholder="Goblet squat, incline press..." className="h-10 text-sm mt-1" />
                    </div>
                    <div className="lg:col-span-2">
                      <Label className="text-xs flex items-center gap-1"><Layers3 className="h-3 w-3" /> Sets</Label>
                      <Input type="number" value={exercise.sets} onChange={(e) => updateExercise(index, "sets", Number(e.target.value))} placeholder="3" className="h-10 text-sm mt-1" />
                    </div>
                    <div className="lg:col-span-2">
                      <Label className="text-xs flex items-center gap-1"><Repeat className="h-3 w-3" /> Reps</Label>
                      <Input value={exercise.reps} onChange={(e) => updateExercise(index, "reps", e.target.value)} placeholder="10 or 30 sec" className="h-10 text-sm mt-1" />
                    </div>
                    <div className="lg:col-span-2">
                      <Label className="text-xs flex items-center gap-1"><Scale className="h-3 w-3" /> Weight</Label>
                      <Input value={exercise.weight_value} onChange={(e) => updateExercise(index, "weight_value", e.target.value)} placeholder="Optional" className="h-10 text-sm mt-1" />
                    </div>
                    <div className="lg:col-span-2">
                      <Label className="text-xs">Unit</Label>
                      <Select value={exercise.weight_unit} onValueChange={(value) => updateExercise(index, "weight_unit", value)}>
                        <SelectTrigger className="h-10 text-sm mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WEIGHT_UNITS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="lg:col-span-12">
                      <Label className="text-xs">Notes</Label>
                      <Textarea value={exercise.notes} onChange={(e) => updateExercise(index, "notes", e.target.value)} placeholder="Tempo, rest time, machine pin, side-specific note, hold duration..." className="mt-1 min-h-[76px] text-sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="flex-1 rounded-lg">
              {isSaving ? <><ButtonSpinner /> Saving...</> : "Save Plan"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="rounded-lg">Cancel</Button>
          </div>
        </div>
      )}

      {activePlan && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-3">
          {confirmDeleteId === activePlan.id && <DeleteConfirmBanner planId={activePlan.id} label={activePlan.plan_name} />}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <Dumbbell className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-sm font-semibold truncate text-foreground">{activePlan.plan_name}</span>
              <Badge className="bg-success/10 text-success border-success/20 text-[10px] px-1.5 py-0">Active</Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => setConfirmDeleteId(confirmDeleteId === activePlan.id ? null : activePlan.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-3 flex-wrap">
            <span>🎯 {activePlan.goal}</span>
            <span>📋 {activePlan.workout_split}</span>
            <span>By {activePlan.created_by}</span>
          </div>

          {activePlan.exercises.length > 0 && (
            <>
              <div className="space-y-2 sm:hidden">
                {activePlan.exercises.map((exercise) => (
                  <div key={exercise.id} className="rounded-lg border border-border/40 bg-background/50 p-3">
                    <p className="text-xs font-medium mb-2 break-words text-foreground">{exercise.exercise_name}</p>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="rounded-md bg-muted/30 p-2">
                        <p className="text-muted-foreground">Sets</p>
                        <p className="font-semibold text-foreground mt-0.5">{exercise.sets}</p>
                      </div>
                      <div className="rounded-md bg-muted/30 p-2">
                        <p className="text-muted-foreground">Reps</p>
                        <p className="font-semibold text-foreground mt-0.5">{exercise.reps}</p>
                      </div>
                      <div className="rounded-md bg-muted/30 p-2">
                        <p className="text-muted-foreground">Load</p>
                        <p className="font-semibold text-foreground mt-0.5">{formatLoad(exercise.weight_value, exercise.weight_unit)}</p>
                      </div>
                    </div>
                    {exercise.notes && <p className="text-[10px] text-muted-foreground mt-2 break-words italic">{exercise.notes}</p>}
                  </div>
                ))}
              </div>

              <div className="hidden sm:block rounded-lg border border-border/40 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="text-left p-2 pl-3 font-medium">Exercise</th>
                      <th className="text-center p-2 font-medium w-16">Sets</th>
                      <th className="text-center p-2 font-medium w-20">Reps</th>
                      <th className="text-center p-2 font-medium w-24">Load</th>
                      <th className="text-left p-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePlan.exercises.map((exercise, index) => (
                      <tr key={exercise.id} className={index % 2 === 0 ? "bg-background/50" : "bg-muted/10"}>
                        <td className="p-2 pl-3 font-medium text-foreground">{exercise.exercise_name}</td>
                        <td className="text-center p-2">{exercise.sets}</td>
                        <td className="text-center p-2">{exercise.reps}</td>
                        <td className="text-center p-2">{formatLoad(exercise.weight_value, exercise.weight_unit)}</td>
                        <td className="p-2 text-muted-foreground">{exercise.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {pastPlans.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Previous Plans</p>
          {pastPlans.map((plan) => (
            <div key={plan.id} className="rounded-lg border border-border/40 bg-card/30 p-2.5">
              {confirmDeleteId === plan.id && <DeleteConfirmBanner planId={plan.id} label={plan.plan_name} />}
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className="text-xs font-medium break-words min-w-0 flex-1 text-foreground">{plan.plan_name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">{plan.goal} • {plan.workout_split}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteId(confirmDeleteId === plan.id ? null : plan.id)}>
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
