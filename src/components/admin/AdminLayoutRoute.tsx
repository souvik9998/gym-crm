import { Outlet, useLocation } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidatePublicDataCache } from "@/api/publicData";
import { useBranch } from "@/contexts/BranchContext";

// Routes whose data is consumed by the public registration/renew/extend-PT flows.
// Refreshing on these routes must also bust the public sessionStorage cache so
// open public tabs immediately drop their stale packages/trainers/branch info.
const PUBLIC_DATA_ROUTES = new Set([
  "/admin/settings",
  "/admin/trainers",
]);

// Route title mapping
const routeTitles: Record<string, { title: string; subtitle?: string }> = {
  "/admin/dashboard": { title: "Dashboard", subtitle: "Overview of your gym operations" },
  "/admin/analytics": { title: "Analytics", subtitle: "Performance insights and trends" },
  "/admin/branch-analytics": { title: "Branch Analytics", subtitle: "Comprehensive multi-branch performance insights" },
  "/admin/ledger": { title: "Ledger", subtitle: "Financial transactions and records" },
  "/admin/logs": { title: "Activity Logs", subtitle: "Track all activities" },
  "/admin/staff": { title: "Staff Management", subtitle: "Manage trainers and staff members" },
  "/admin/trainers": { title: "Trainers", subtitle: "Manage trainers" },
  "/admin/settings": { title: "Settings", subtitle: "Configure gym settings" },
  "/admin/qr-code": { title: "QR Code", subtitle: "Member Registration Portal" },
  "/admin/attendance": { title: "Attendance", subtitle: "Track member and staff attendance" },
  "/staff/dashboard": { title: "Dashboard", subtitle: "Staff dashboard overview" },
  "/staff/time-slots": { title: "Time Slots", subtitle: "Manage your trainer time slots" },
};

/**
 * Route-specific query key prefixes to invalidate.
 * These match the actual queryKey arrays used in hooks.
 */
const routeQueryKeys: Record<string, string[][]> = {
  "/admin/dashboard": [
    ["dashboard-stats"],
    ["members"],
    ["payments"],
    ["daily-pass-users"],
  ],
  "/staff/dashboard": [
    ["dashboard-stats"],
    ["members"],
    ["payments"],
  ],
  "/admin/analytics": [
    ["analytics"],
    ["analytics-aggregated"],
  ],
  "/admin/branch-analytics": [
    ["branch-analytics-data"],
  ],
  "/admin/ledger": [
    ["ledger-entries"],
    ["payments"],
  ],
  "/admin/staff": [
    ["staff-page-data"],
  ],
  "/admin/trainers": [
    ["settings-page-data"],
  ],
  "/admin/logs": [
    ["admin-activity-logs"],
    ["user-activity-logs"],
    ["staff-activity-logs"],
    ["whatsapp-logs"],
    ["log-stats"],
  ],
  "/admin/settings": [
    ["settings-page-data"],
  ],
  "/admin/attendance": [
    ["attendance-logs"],
    ["attendance-insights"],
  ],
  "/admin/qr-code": [],
};

/**
 * AdminLayoutRoute - Wraps admin routes with persistent layout
 * This ensures the sidebar and header stay mounted while only content changes
 */
export const AdminLayoutRoute = () => {
  const location = useLocation();
  const queryClient = useQueryClient();

  const { currentBranch } = useBranch();

  const { title, subtitle } = useMemo(() => {
    return routeTitles[location.pathname] || { title: "Admin", subtitle: "" };
  }, [location.pathname]);

  // Dynamic refresh: invalidates only the queries relevant to the current page
  const handleRefresh = useCallback(async () => {
    const keys = routeQueryKeys[location.pathname];

    // If we're on a route that drives public-facing data, also bust the
    // public sessionStorage cache and broadcast a cross-tab signal so any
    // open registration/renew tabs immediately fetch fresh data.
    if (PUBLIC_DATA_ROUTES.has(location.pathname)) {
      try {
        if (currentBranch?.id) {
          invalidatePublicDataCache(currentBranch.id);
        }
        if (currentBranch?.slug) {
          invalidatePublicDataCache(currentBranch.slug);
        }
        if (!currentBranch?.id && !currentBranch?.slug) {
          invalidatePublicDataCache();
        }
      } catch (err) {
        console.warn("Failed to invalidate public data cache:", err);
      }
    }

    if (keys && keys.length > 0) {
      await Promise.all(
        keys.map((key) =>
          queryClient.invalidateQueries({ queryKey: key, refetchType: "all" })
        )
      );
    } else {
      // Fallback for unknown routes — refetch everything active
      await queryClient.invalidateQueries({ refetchType: "all" });
    }
  }, [location.pathname, queryClient, currentBranch?.id, currentBranch?.slug]);

  return (
    <AdminLayout title={title} subtitle={subtitle} onRefresh={handleRefresh}>
      <Outlet />
    </AdminLayout>
  );
};
