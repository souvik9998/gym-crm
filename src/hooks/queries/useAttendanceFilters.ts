import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

export interface TrainerOption {
  id: string;
  name: string;
}

export interface SlotOption {
  id: string;
  start_time: string;
  end_time: string;
  trainer_id: string;
  trainer_name: string;
}

export function useAttendanceFilters() {
  const { currentBranch } = useBranch();
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const branchId = currentBranch?.id;
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  // Resolve staff → staff trainer ID (for limited access)
  const { data: staffTrainerId } = useQuery({
    queryKey: ["staff-trainer-id-filter", staffUser?.id, branchId],
    queryFn: async () => {
      if (!staffUser?.id || !branchId) return null;
      // In trainer_time_slots, trainer_id references staff.id
      // Check if this staff user has any slots
      const { data: slots } = await supabase
        .from("trainer_time_slots" as any)
        .select("trainer_id")
        .eq("branch_id", branchId)
        .eq("status", "available")
        .eq("trainer_id", staffUser.id)
        .limit(1);
      if (slots && (slots as any[]).length > 0) return staffUser.id;
      return null;
    },
    enabled: !!staffUser?.id && !!branchId && isLimitedAccess,
    staleTime: 60000,
  });

  // Fetch all active slots with trainer info from staff table
  const { data: allSlots = [] } = useQuery<SlotOption[]>({
    queryKey: ["attendance-filter-slots", branchId, isLimitedAccess, staffTrainerId],
    queryFn: async (): Promise<SlotOption[]> => {
      if (!branchId) return [];
      let query = supabase.from("trainer_time_slots" as any)
        .select("id, start_time, end_time, trainer_id") as any;
      query = query.eq("branch_id", branchId).eq("status", "available").order("start_time");
      if (isLimitedAccess && staffTrainerId) query = query.eq("trainer_id", staffTrainerId);
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Get trainer names via SECURITY DEFINER RPC so staff with all-member access
      // can see colleague trainer names (RLS on staff table only exposes self).
      const trainerIds = new Set((data as any[]).map((s: any) => s.trainer_id).filter(Boolean));
      let staffMap: Record<string, string> = {};
      if (trainerIds.size > 0) {
        const { data: staffData } = await supabase
          .rpc("get_staff_names_for_branch" as any, { _branch_id: branchId });
        if (staffData) {
          for (const s of (staffData as any[])) {
            if (trainerIds.has(s.id)) staffMap[s.id] = s.full_name;
          }
        }
      }

      return (data as any[]).map((s: any) => ({
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        trainer_id: s.trainer_id,
        trainer_name: staffMap[s.trainer_id] || "Unassigned",
      }));
    },
    enabled: !!branchId && (!isLimitedAccess || staffTrainerId !== undefined),
    staleTime: 30000,
  });

  // Derive unique trainers from slots
  const trainers: TrainerOption[] = (() => {
    const map = new Map<string, string>();
    allSlots.forEach((s) => {
      if (s.trainer_id && !map.has(s.trainer_id)) map.set(s.trainer_id, s.trainer_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  })();

  return {
    trainers,
    allSlots,
    isLimitedAccess,
    staffTrainerId: staffTrainerId || null,
  };
}

export function formatSlotTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}
