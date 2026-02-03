import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUserRoles";
import { PageLoader } from "@/components/ui/skeleton-loaders";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { SuperAdminHeader } from "./SuperAdminHeader";

export function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSuperAdmin, isLoading } = useIsSuperAdmin();

  if (isLoading) {
    return <PageLoader />;
  }

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
