import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AssessmentSection } from "./AssessmentSection";
import { HealthFilesSection } from "./HealthFilesSection";
import { ExerciseRegimeSection } from "./ExerciseRegimeSection";
import { ClipboardList, FileText, Dumbbell } from "lucide-react";

interface MemberHealthTabProps {
  memberId: string;
  branchId: string;
}

export interface MemberAssessment {
  id: string;
  assessment_date: string;
  assessed_by: string;
  current_condition: string | null;
  injuries_health_issues: string | null;
  mobility_limitations: string | null;
  allowed_exercises: string | null;
  notes: string | null;
  assessment_data: any;
  is_draft?: boolean;
  created_at: string;
}

export interface MemberDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface HealthDetails {
  blood_group: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  medical_conditions: string | null;
  allergies: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

export interface ExercisePlan {
  id: string;
  plan_name: string;
  goal: string;
  workout_split: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  exercises: ExerciseItem[];
}

export interface ExerciseItem {
  id: string;
  exercise_name: string;
  sets: number;
  reps: string;
  weight_value?: number | null;
  weight_unit?: string | null;
  notes: string | null;
  sort_order: number;
}

export const MemberHealthTab = ({ memberId, branchId }: MemberHealthTabProps) => {
  const [assessments, setAssessments] = useState<MemberAssessment[]>([]);
  const [documents, setDocuments] = useState<MemberDocument[]>([]);
  const [healthDetails, setHealthDetails] = useState<HealthDetails | null>(null);
  const [exercisePlans, setExercisePlans] = useState<ExercisePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (memberId) fetchAll();
  }, [memberId]);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchAssessments(), fetchDocuments(), fetchHealthDetails(), fetchExercisePlans()]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAssessments = async () => {
    const { data } = await supabase
      .from("member_assessments")
      .select("*")
      .eq("member_id", memberId)
      .order("assessment_date", { ascending: false });
    if (data) setAssessments(data);
  };

  const fetchDocuments = async () => {
    const { data } = await supabase
      .from("member_documents")
      .select("*")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });
    if (data) setDocuments(data);
  };

  const fetchHealthDetails = async () => {
    const { data } = await supabase
      .from("member_details")
      .select("blood_group, height_cm, weight_kg, medical_conditions, allergies, emergency_contact_name, emergency_contact_phone")
      .eq("member_id", memberId)
      .maybeSingle();
    if (data) setHealthDetails(data);
  };

  const fetchExercisePlans = async () => {
    const { data: plans } = await supabase
      .from("member_exercise_plans")
      .select("*")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });

    if (plans && plans.length > 0) {
      const planIds = plans.map(p => p.id);
      const { data: items } = await supabase
        .from("member_exercise_items")
        .select("*")
        .in("plan_id", planIds)
        .order("sort_order", { ascending: true });

      const plansWithExercises = plans.map(plan => ({
        ...plan,
        exercises: (items || []).filter(item => item.plan_id === plan.id),
      }));
      setExercisePlans(plansWithExercises);
    } else {
      setExercisePlans([]);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-muted/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <Accordion type="multiple" className="space-y-2">
      <AccordionItem value="assessments" className="border rounded-xl overflow-hidden">
        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/10">
              <ClipboardList className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-sm font-semibold">Assessments</span>
            {assessments.length > 0 && (
              <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">{assessments.length}</span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <AssessmentSection
            assessments={assessments}
            memberId={memberId}
            branchId={branchId}
            onRefresh={fetchAssessments}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="health-files" className="border rounded-xl overflow-hidden">
        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10">
              <FileText className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <span className="text-sm font-semibold">Health Files & Details</span>
            {documents.length > 0 && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full">{documents.length}</span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <HealthFilesSection
            documents={documents}
            healthDetails={healthDetails}
            memberId={memberId}
            branchId={branchId}
            onRefresh={() => { fetchDocuments(); fetchHealthDetails(); }}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="exercise-regime" className="border rounded-xl overflow-hidden">
        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10">
              <Dumbbell className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <span className="text-sm font-semibold">Exercise Regime</span>
            {exercisePlans.some(p => p.is_active) && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full">Active</span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <ExerciseRegimeSection
            plans={exercisePlans}
            memberId={memberId}
            branchId={branchId}
            onRefresh={fetchExercisePlans}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
