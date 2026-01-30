import { Outlet, useLocation } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { useMemo, useCallback } from "react";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { useQueryClient } from "@tanstack/react-query";

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
  "/staff/dashboard": { title: "Dashboard", subtitle: "Staff dashboard overview" },
};

/**
 * AdminLayoutRoute - Wraps admin routes with persistent layout
 * This ensures the sidebar and header stay mounted while only content changes
 */
export const AdminLayoutRoute = () => {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { invalidateAll, invalidateMembers, invalidatePayments, invalidateStaff } = useInvalidateQueries();
  
  // Get title and subtitle based on current route
  const { title, subtitle } = useMemo(() => {
    return routeTitles[location.pathname] || { title: "Admin", subtitle: "" };
  }, [location.pathname]);

  // Refresh handler that invalidates queries based on current route
  const handleRefresh = useCallback(() => {
    const path = location.pathname;
    
    // Invalidate queries based on the current route
    if (path === "/admin/dashboard" || path === "/staff/dashboard") {
      invalidateMembers();
      invalidatePayments();
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } else if (path === "/admin/analytics" || path === "/admin/branch-analytics") {
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["branch-analytics"] });
    } else if (path === "/admin/ledger") {
      invalidatePayments();
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
    } else if (path === "/admin/staff" || path === "/admin/trainers") {
      invalidateStaff();
      queryClient.invalidateQueries({ queryKey: ["trainers"] });
    } else if (path === "/admin/logs") {
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
      queryClient.invalidateQueries({ queryKey: ["user-activity"] });
      queryClient.invalidateQueries({ queryKey: ["staff-activity"] });
    } else if (path === "/admin/settings") {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    }
    
    // Always invalidate all queries as a fallback
    invalidateAll();
  }, [location.pathname, invalidateAll, invalidateMembers, invalidatePayments, invalidateStaff, queryClient]);

  return (
    <AdminLayout title={title} subtitle={subtitle} onRefresh={handleRefresh}>
      <Outlet />
    </AdminLayout>
  );
};
