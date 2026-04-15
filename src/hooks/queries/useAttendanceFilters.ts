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

  // Resolve staff → trainer ID
  const { data: staffTrainerId } = useQuery({
    queryKey: ["staff-trainer-id-filter", staffUser?.id, branchId],
    queryFn: async () => {
      if (!staffUser?.id || !branchId) return null;
      const { data: staffData } = await supabase.from("staff").select("phone").eq("id", staffUser.id).single();
      if (!staffData?.phone) return null;
      const { data: trainer } = await supabase.from("personal_trainers").select("id")
        .eq("phone", staffData.phone).eq("branch_id", branchId).eq("is_active", true).maybeSingle();
      return trainer?.id || null;
    },
    enabled: !!staffUser?.id && !!branchId && isLimitedAccess,
    staleTime: 60000,
  });

  // Fetch all active slots with trainer info
  const { data: allSlots = [] } = useQuery<SlotOption[]>({
    queryKey: ["attendance-filter-slots", branchId, isLimitedAccess, staffTrainerId],
    queryFn: async (): Promise<SlotOption[]> => {
      if (!branchId) return [];
      let query = supabase.from("trainer_time_slots")
        .select("id, start_time, end_time, trainer_id, personal_trainers(name)") as any;
      query = query.eq("branch_id", branchId).eq("is_active", true).order("start_time");
      if (isLimitedAccess && staffTrainerId) query = query.eq("trainer_id", staffTrainerId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((s: any) => ({
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        trainer_id: s.trainer_id,
        trainer_name: s.personal_trainers?.name || "Unassigned",
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
