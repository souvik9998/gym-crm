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
      
      // Get trainer's time slots
      const { data: slots } = await supabase
        .from("trainer_time_slots" as any)
        .select("id")
        .eq("trainer_id", staffUser.id)
        .eq("branch_id", branchId)
        .eq("status", "available");
      
      const slotIds = (slots as any[] || []).map((s: any) => s.id);
      if (slotIds.length === 0) return [];

      // Get members assigned to those slots
      const { data: slotMembers } = await supabase
        .from("time_slot_members" as any)
        .select("member_id")
        .in("time_slot_id", slotIds);
      
      return [...new Set((slotMembers as any[] || []).map((sm: any) => sm.member_id))];
    },
    enabled: isLimitedAccess && !!staffUser?.id && !!branchId,
    staleTime: 60000,
  });

  return {
    isLimitedAccess,
    assignedMemberIds: isLimitedAccess ? (assignedMemberIds ?? []) : null,
  };
}
