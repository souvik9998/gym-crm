/**
 * Hook to resolve assigned member IDs for staff with limited access.
 * Returns null for admin users or staff with "all" access (meaning no filtering needed).
 * Returns string[] of member IDs for staff with "assigned" access type.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useBranch } from "@/contexts/BranchContext";

export function useAssignedMemberIds() {
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  const { data: assignedMemberIds } = useQuery<string[] | null>({
    queryKey: ["assigned-member-ids", staffUser?.id, branchId],
    queryFn: async () => {
      if (!staffUser?.id || !branchId) return [];

      const today = new Date().toISOString().split("T")[0];

      const [{ data: staffRecord }, { data: slots }] = await Promise.all([
        supabase
          .from("staff" as any)
          .select("phone")
          .eq("id", staffUser.id)
          .maybeSingle(),
        supabase
          .from("trainer_time_slots" as any)
          .select("id")
          .eq("trainer_id", staffUser.id)
          .eq("branch_id", branchId)
          .eq("status", "available"),
      ]);

      const slotIds = (slots as any[] | null | undefined)?.map((slot: any) => slot.id) || [];

      let trainerProfileIds: string[] = [];
      if ((staffRecord as any)?.phone) {
        const { data: trainerProfiles } = await supabase
          .from("personal_trainers" as any)
          .select("id")
          .eq("phone", (staffRecord as any).phone)
          .eq("branch_id", branchId);

        trainerProfileIds = (trainerProfiles as any[] | null | undefined)?.map((trainer: any) => trainer.id) || [];
      }

      const assignmentQueries: Promise<{ data: any[] | null; error: any }>[] = [];

      if (slotIds.length > 0) {
        assignmentQueries.push(
          supabase
            .from("pt_subscriptions" as any)
            .select("member_id")
            .eq("branch_id", branchId)
            .eq("status", "active")
            .gte("end_date", today)
            .in("time_slot_id", slotIds)
        );
      }

      if (trainerProfileIds.length > 0) {
        assignmentQueries.push(
          supabase
            .from("pt_subscriptions" as any)
            .select("member_id")
            .eq("branch_id", branchId)
            .eq("status", "active")
            .gte("end_date", today)
            .in("personal_trainer_id", trainerProfileIds)
        );
      }

      if (assignmentQueries.length === 0) return [];

      const assignmentResults = await Promise.all(assignmentQueries);

      return [
        ...new Set(
          assignmentResults.flatMap((result) =>
            (result.data || []).map((assignment: any) => assignment.member_id).filter(Boolean)
          )
        ),
      ];
    },
    enabled: isLimitedAccess && !!staffUser?.id && !!branchId,
    staleTime: 60000,
  });

  return {
    isLimitedAccess,
    assignedMemberIds: isLimitedAccess ? (assignedMemberIds ?? []) : null,
  };
}
