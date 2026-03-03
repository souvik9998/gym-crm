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
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, staffUser, isLoading: staffLoading } = useStaffAuth();
  const { user: adminUser, isLoading, isAuthenticated } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Get branch name dynamically from currentBranch
  const gymName = currentBranch?.name || "Pro Plus Fitness";

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
      const isAuthenticated = !!adminUser || isStaffLoggedIn;
      if (!isAuthenticated) {
        navigate("/admin/login");
      }
    }
  }, [isLoading, staffLoading, adminUser, isStaffLoggedIn, navigate]);

  const handleSidebarCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem("admin-sidebar-collapsed", String(collapsed));
  };

  if (isLoading || staffLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Skeleton sidebar - desktop only */}
        <div className="hidden lg:block fixed left-0 top-0 h-screen w-64 bg-card border-r border-border">
          <div className="p-4 space-y-2 border-b border-border">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="p-3 space-y-1 mt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
        {/* Skeleton main content */}
        <div className="lg:pl-64">
          {/* Skeleton header */}
          <div className="h-14 border-b border-border bg-card px-4 flex items-center gap-4">
            <Skeleton className="h-5 w-40" />
            <div className="ml-auto flex gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
          {/* Skeleton page content */}
          <div className="p-3 sm:p-4 lg:p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-5">
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <Skeleton className="h-5 w-32 mb-4" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full mb-2" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if either admin or staff is logged in
  const isAuthenticated = !!adminUser || isStaffLoggedIn;
  if (!isAuthenticated) return null;

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
              <h1 className="text-sm font-semibold text-foreground">{currentBranch?.name || "Pro Plus Fitness"}</h1>
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
        <main className="p-3 sm:p-4 lg:p-6 max-w-full overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;