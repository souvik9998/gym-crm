/**
 * Hook to resolve assigned member IDs for staff with limited access.
 * Returns null for admin users or staff with "all" access (meaning no filtering needed).
 * Returns string[] of member IDs for staff with "assigned" access type.
 * 
 * Single source of truth: pt_subscriptions table.
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

      // Resolve staff_id → phone → personal_trainer_id(s)
      const { data: staffRecord } = await supabase
        .from("staff" as any)
        .select("phone")
        .eq("id", staffUser.id)
        .maybeSingle();

      if (!(staffRecord as any)?.phone) return [];

      const { data: ptProfiles } = await supabase
        .from("personal_trainers" as any)
        .select("id")
        .eq("phone", (staffRecord as any).phone)
        .eq("branch_id", branchId);

      const ptIds = (ptProfiles as any[] | null)?.map((p: any) => p.id) || [];
      if (ptIds.length === 0) return [];

      // Single query: all active PT subscriptions for this trainer
      const { data: ptSubs } = await supabase
        .from("pt_subscriptions" as any)
        .select("member_id")
        .eq("branch_id", branchId)
        .eq("status", "active")
        .gte("end_date", today)
        .in("personal_trainer_id", ptIds);

      return [...new Set((ptSubs as any[] || []).map((s: any) => s.member_id).filter(Boolean))];
    },
    enabled: isLimitedAccess && !!staffUser?.id && !!branchId,
    staleTime: 60000,
  });

  return {
    isLimitedAccess,
    assignedMemberIds: isLimitedAccess ? (assignedMemberIds ?? []) : null,
  };
}
