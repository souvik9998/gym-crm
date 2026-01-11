import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
}

export const AdminLayout = ({ children, title, subtitle, onRefresh }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [gymName, setGymName] = useState("Pro Plus Fitness");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/admin/login");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/admin/login");
      }
      setIsLoading(false);
    });

    // Fetch gym name
    supabase.from("gym_settings").select("gym_name").limit(1).maybeSingle().then(({ data }) => {
      if (data?.gym_name) {
        setGymName(data.gym_name);
      }
    });

    // Load sidebar state from localStorage
    const savedCollapsed = localStorage.getItem("admin-sidebar-collapsed");
    if (savedCollapsed !== null) {
      setSidebarCollapsed(savedCollapsed === "true");
    }

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSidebarCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem("admin-sidebar-collapsed", String(collapsed));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={handleSidebarCollapse}
          gymName={gymName}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border z-50 transform transition-transform duration-300 lg:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary overflow-hidden">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-sidebar-foreground">{gymName}</h1>
              <p className="text-xs text-sidebar-foreground/60">Admin Panel</p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 hover:bg-sidebar-accent rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-sidebar-foreground" />
          </button>
        </div>
        <AdminSidebar
          collapsed={false}
          onCollapsedChange={() => {}}
          gymName={gymName}
        />
      </div>

      {/* Main Content */}
      <div
        className={cn(
          "min-h-screen transition-all duration-300",
          sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-64"
        )}
      >
        <AdminHeader
          title={title}
          subtitle={subtitle}
          onRefresh={onRefresh}
          showMobileMenu={true}
          onMobileMenuClick={() => setMobileMenuOpen(true)}
          gymName={gymName}
        />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
