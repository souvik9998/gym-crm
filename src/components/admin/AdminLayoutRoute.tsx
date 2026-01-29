import { Outlet, useLocation } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { useMemo } from "react";

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
  
  // Get title and subtitle based on current route
  const { title, subtitle } = useMemo(() => {
    return routeTitles[location.pathname] || { title: "Admin", subtitle: "" };
  }, [location.pathname]);

  return (
    <AdminLayout title={title} subtitle={subtitle}>
      <Outlet />
    </AdminLayout>
  );
};
