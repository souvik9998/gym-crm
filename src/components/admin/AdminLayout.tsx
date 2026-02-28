import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

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
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Get branch name dynamically from currentBranch
  const gymName = currentBranch?.name || "Pro Plus Fitness";

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setAdminUser(session?.user ?? null);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAdminUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Load sidebar state from localStorage
    const savedCollapsed = localStorage.getItem("admin-sidebar-collapsed");
    if (savedCollapsed !== null) {
      setSidebarCollapsed(savedCollapsed === "true");
    }

    return () => subscription.unsubscribe();
  }, [navigate]);

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
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
            <div className="w-10 h-10 rounded-xl bg-primary overflow-hidden shadow-sm">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
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