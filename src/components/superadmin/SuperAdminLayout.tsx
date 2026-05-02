import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { SuperAdminHeader } from "./SuperAdminHeader";

export function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSuperAdmin, isLoading } = useAuth();

  // Defer to route-level <Suspense> skeleton — render nothing while auth
  // resolves so the user sees ONE seamless skeleton instead of a layout
  // skeleton swapping into a content skeleton.
  if (isLoading) return null;

  if (!isSuperAdmin) {
    navigate("/admin/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <SuperAdminSidebar currentPath={location.pathname} />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <SuperAdminHeader />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
