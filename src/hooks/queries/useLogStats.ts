import { useQuery } from "@tanstack/react-query";
import { protectedFetch } from "@/api/authenticatedFetch";
import { useBranch } from "@/contexts/BranchContext";
import { STALE_TIMES, GC_TIME } from "@/lib/queryClient";

// Admin log stats
export interface AdminLogStats {
  totalActivities: number;
  activitiesToday: number;
  activitiesThisWeek: number;
  activitiesThisMonth: number;
  byCategory: Record<string, number>;
}

export function useAdminLogStats() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  return useQuery<AdminLogStats>({
    queryKey: ["log-stats", "admin", branchId],
    queryFn: () =>
      protectedFetch<AdminLogStats>({
        action: "log-stats",
        params: { branchId, logType: "admin" },
      }),
    enabled: !!branchId,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
  });
}

// User log stats
export interface UserLogStats {
  totalActivities: number;
  activitiesToday: number;
  activitiesThisWeek: number;
  activitiesThisMonth: number;
  byType: Record<string, number>;
}

export function useUserLogStats() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  return useQuery<UserLogStats>({
    queryKey: ["log-stats", "user", branchId],
    queryFn: () =>
      protectedFetch<UserLogStats>({
        action: "log-stats",
        params: { branchId, logType: "user" },
      }),
    enabled: !!branchId,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
  });
}

// Staff log stats
export interface StaffLogStats {
  totalActivities: number;
  activitiesToday: number;
  typeCounts: Record<string, number>;
  staffList: Array<{ id: string; full_name: string; phone: string }>;
}

export function useStaffLogStats() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  return useQuery<StaffLogStats>({
    queryKey: ["log-stats", "staff", branchId],
    queryFn: () =>
      protectedFetch<StaffLogStats>({
        action: "log-stats",
        params: { branchId, logType: "staff" },
      }),
    enabled: !!branchId,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
  });
}

// WhatsApp log stats
export interface WhatsAppLogStats {
  totalMessages: number;
  sentMessages: number;
  failedMessages: number;
  manualMessages: number;
  automatedMessages: number;
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
  messagesByType: Record<string, number>;
}

export function useWhatsAppLogStats() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  return useQuery<WhatsAppLogStats>({
    queryKey: ["log-stats", "whatsapp", branchId],
    queryFn: () =>
      protectedFetch<WhatsAppLogStats>({
        action: "log-stats",
        params: { branchId, logType: "whatsapp" },
      }),
    enabled: !!branchId,
    staleTime: STALE_TIMES.DYNAMIC,
    gcTime: GC_TIME,
  });
}
