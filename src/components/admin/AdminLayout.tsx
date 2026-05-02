import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { BranchLogo } from "./BranchLogo";
import { AdminHeader } from "./AdminHeader";
import { cn } from "@/lib/utils";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useAuth } from "@/contexts/AuthContext";

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
}

export const AdminLayout = ({ children, title, subtitle, onRefresh }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const { currentBranch, isLoading: branchLoading } = useBranch();
  const { isStaffLoggedIn, staffUser, isLoading: staffLoading } = useStaffAuth();
  const { user: adminUser, isLoading, isAuthenticated } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Get branch name dynamically from currentBranch
  const gymName = currentBranch?.name || "Loading...";

  useEffect(() => {
    // Load sidebar state from localStorage
    const savedCollapsed = localStorage.getItem("admin-sidebar-collapsed");
    if (savedCollapsed !== null) {
      setSidebarCollapsed(savedCollapsed === "true");
    }
  }, []);

  // Check authentication - either admin user OR staff user
  useEffect(() => {
    if (!isLoading && !staffLoading) {
      const isAuth = isAuthenticated || isStaffLoggedIn;
      if (!isAuth) {
        navigate("/admin/login");
      }
    }
  }, [isLoading, staffLoading, isAuthenticated, isStaffLoggedIn, navigate]);

  const handleSidebarCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem("admin-sidebar-collapsed", String(collapsed));
  };

  // While auth/branch resolves, render NOTHING from this layout — the
  // ProtectedRoute wrapper already gates rendering until auth is ready, and
  // the route-level <Suspense> fallback (DashboardFullSkeleton /
  // AdminSectionSkeleton) is the SINGLE skeleton the user sees. Showing
  // a separate layout-level skeleton here would cause the dreaded
  // "skeleton-swap" flash that the user is complaining about.
  // Once auth is ready, the real sidebar+header mount once and stay
  // mounted across navigations; only the main content swaps.

  // Check if either admin or staff is logged in
  const isUserAuthenticated = isAuthenticated || isStaffLoggedIn;
  if (isLoading || staffLoading) return null;
  if (!isUserAuthenticated) return null;

  // Check if this is a staff session by examining the email pattern
  // Staff users use email format: staff_{phone}@gym.local
  const isStaffEmail = adminUser?.email?.startsWith("staff_") && adminUser?.email?.endsWith("@gym.local");
  const isStaffSession = isStaffLoggedIn || isStaffEmail;
  
  // Determine display name for header
  const displayName = isStaffSession ? (staffUser?.fullName || "Staff") : (adminUser?.email || "User");

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar - visible on lg and up */}
      <div className="hidden lg:block">
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={handleSidebarCollapse}
          isStaffUser={isStaffSession}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "fixed left-0 top-0 h-screen w-72 bg-card border-r border-border z-50 transform transition-transform duration-300 ease-in-out lg:hidden shadow-xl",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <BranchLogo logoUrl={currentBranch?.logo_url} name={currentBranch?.name || "Gym"} size="md" />
            <div>
              <h1 className="text-sm font-semibold text-foreground">{currentBranch?.name || "Loading..."}</h1>
              <p className="text-xs text-muted-foreground">
                {isStaffSession ? `${staffUser?.role} Panel` : "Admin Panel"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <AdminSidebar
          collapsed={false}
          onCollapsedChange={() => {}}
          isMobile={true}
          isStaffUser={isStaffSession}
          onNavigate={() => setMobileMenuOpen(false)}
        />
      </div>

      {/* Main Content */}
      <div
        className={cn(
          "min-h-screen transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-64"
        )}
      >
        <AdminHeader
          title={title}
          subtitle={subtitle}
          onRefresh={onRefresh}
          showMobileMenu={true}
          onMobileMenuClick={() => setMobileMenuOpen(true)}
          isStaffUser={isStaffSession}
          staffName={staffUser?.fullName}
        />
        <main className="px-3 sm:px-4 lg:px-6 pt-2 sm:pt-2.5 lg:pt-3 pb-3 sm:pb-4 lg:pb-6 max-w-full overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;