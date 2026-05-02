import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { SuperAdminHeader } from "./SuperAdminHeader";
import { PageLoader } from "@/components/ui/skeleton-loaders";

export function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSuperAdmin, isLoading } = useAuth();

  // Show centered spinner while auth resolves — never a blank screen.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
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
