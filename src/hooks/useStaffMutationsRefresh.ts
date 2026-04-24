import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Centralized cache invalidation for staff/trainer mutations.
 *
 * Any staff or trainer add/edit/delete/toggle/permission/branch/password change
 * should call `refreshStaffData()` so every dependent surface (overview cards,
 * filter dropdowns, time slots, attendance, member rows, activity logs, etc.)
 * reflects the change instantly without a page refresh.
 */
export function useStaffMutationsRefresh() {
  const queryClient = useQueryClient();

  const refreshStaffData = useCallback(async () => {
    await Promise.all([
      // Core staff/trainer page data
      queryClient.invalidateQueries({ queryKey: ["staff-page-data"], refetchType: "all" }),

      // Filter dropdowns that list trainers / time slots
      queryClient.invalidateQueries({ queryKey: ["trainer-filter-list"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["time-slots-mega-menu"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["attendance-filter-slots"], refetchType: "all" }),

      // Time slot management surfaces
      queryClient.invalidateQueries({ queryKey: ["staff-timeslot-trainers"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["trainer-time-slots"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["time-slot-members"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["time-slot-analytics"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["time-slot-filter"], refetchType: "all" }),

      // Trainer ↔ member assignments
      queryClient.invalidateQueries({ queryKey: ["assigned-members"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["assigned-member-ids"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["pt-subscriptions"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["staff-trainer-id-filter"], refetchType: "all" }),

      // Activity logs (staff add/edit/delete/permission events)
      queryClient.invalidateQueries({ queryKey: ["staff-activity-logs"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["admin-activity-logs"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["log-stats"], refetchType: "all" }),
    ]);
  }, [queryClient]);

  return { refreshStaffData };
}
