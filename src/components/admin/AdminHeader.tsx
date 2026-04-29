import { useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth, useStaffPermission } from "@/contexts/StaffAuthContext";
import { performFullLogout, clearAllAppState } from "@/lib/logout";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRightOnRectangleIcon,
  ArrowPathIcon,
  QrCodeIcon,
  Cog6ToothIcon,
  Bars3Icon,
  BuildingStorefrontIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { BranchSelector } from "./BranchSelector";
import { Badge } from "@/components/ui/badge";
import { NotificationCenter } from "./NotificationCenter";
import { BranchLogo } from "./BranchLogo";
import { GuideDrawer } from "@/components/guide/GuideDrawer";

interface AdminHeaderProps {
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  showMobileMenu?: boolean;
  onMobileMenuClick?: () => void;
  className?: string;
  isStaffUser?: boolean;
  staffName?: string;
}

export const AdminHeader = ({
  title = "Dashboard",
  subtitle,
  onRefresh,
  showMobileMenu = false,
  onMobileMenuClick,
  className,
  isStaffUser = false,
  staffName,
}: AdminHeaderProps) => {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const { logout: staffLogout, staffUser } = useStaffAuth();
  const canViewSettings = useStaffPermission("can_view_settings");
  const canEditSettings = useStaffPermission("can_change_settings");
  const canAccessSettings = canViewSettings || canEditSettings;
  
  // Get branch name dynamically from currentBranch
  const gymName = currentBranch?.name || "Pro Plus Fitness";

  const handleSignOut = async () => {
    // Log logout activity before clearing state
    if (!isStaffUser) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (user) {
          await logAdminActivity({
            category: "auth",
            type: "admin_logged_out",
            description: `Admin ${user.email} logged out`,
            entityType: "user",
            entityId: user.id,
            entityName: user.email || "Admin",
            branchId: currentBranch?.id || undefined,
            metadata: {
              email: user.email,
              logout_time: new Date().toISOString(),
              user_agent: navigator.userAgent,
              platform: navigator.platform,
            },
          });
        }
      } catch (logErr) {
        console.error("Failed to log admin logout:", logErr);
      }
    }

    // Perform logout FIRST (needs session for logging), then clear state
    if (isStaffUser) {
      await staffLogout();
    } else {
      await performFullLogout();
    }
    
    // Clear any remaining app state
    clearAllAppState();
    navigate("/admin/login");
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const refreshStartRef = useRef<number>(0);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    refreshStartRef.current = Date.now();
    try {
      await Promise.resolve(onRefresh());
    } catch (err) {
      console.error("Refresh failed:", err);
      toast.error("Failed to refresh");
    } finally {
      // Enforce a minimum spin duration so the animation always feels intentional
      const elapsed = Date.now() - refreshStartRef.current;
      const minDuration = 650;
      if (elapsed < minDuration) {
        await new Promise((r) => setTimeout(r, minDuration - elapsed));
      }
      setIsRefreshing(false);
      toast.success("Data refreshed", { duration: 1500 });
    }
  };

  const displayName = isStaffUser ? (staffName || staffUser?.fullName || "Staff") : "Admin";
  const roleLabel = isStaffUser 
    ? (staffUser?.role ? staffUser.role.charAt(0).toUpperCase() + staffUser.role.slice(1) : "Staff")
    : "Admin";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border h-12 md:h-14 lg:h-16 flex items-center px-3 md:px-4 lg:px-6",
        className
      )}
    >
      {/* Browser-like refresh progress bar */}
      {isRefreshing && (
        <div className="absolute left-0 right-0 top-0 h-0.5 overflow-hidden pointer-events-none">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent animate-[refresh-sweep_0.9s_ease-in-out_infinite]" />
        </div>
      )}
      <div className="flex items-center justify-between w-full">
        {/* Left Section */}
        <div className="flex items-center gap-2 lg:gap-4">
          {showMobileMenu && (
            <button
              onClick={onMobileMenuClick}
             className="lg:hidden p-1.5 hover:bg-muted rounded-lg transition-colors"
            >
              <Bars3Icon className="w-4 h-4 lg:w-5 lg:h-5 text-foreground" />
            </button>
          )}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="min-w-0 hidden md:block">
              <h1 className="text-base lg:text-lg font-semibold text-foreground truncate">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Center Section - Branch Selector (Desktop only) */}
        <div className="hidden lg:flex items-center">
          <BranchSelector />
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1 lg:gap-1.5">
          {/* Notification Center */}
          {!isStaffUser && <NotificationCenter />}

          {/* Refresh button - desktop only, hidden on mobile */}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh"
              aria-busy={isRefreshing}
              className={cn(
                "hidden lg:inline-flex relative overflow-hidden text-muted-foreground hover:text-foreground hover:bg-muted h-9 w-9 rounded-lg",
                "transition-all duration-200 ease-out active:scale-90",
                "focus-visible:ring-2 focus-visible:ring-primary/40",
                isRefreshing && "text-primary bg-primary/10 hover:bg-primary/10"
              )}
              title="Refresh"
            >
              {isRefreshing && (
                <span className="absolute inset-0 rounded-lg bg-primary/20 animate-[refresh-ripple_0.6s_ease-out]" />
              )}
              <ArrowPathIcon
                className={cn(
                  "w-5 h-5 relative z-10 transition-transform duration-300",
                  isRefreshing && "animate-[refresh-spin_0.7s_linear_infinite]"
                )}
              />
            </Button>
          )}

          {/* Only show QR and Settings buttons if user has permission */}
          {(!isStaffUser || canAccessSettings) && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin/qr-code")}
                 className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 lg:h-9 lg:w-9"
                title="QR Code"
              >
                <QrCodeIcon className="w-4 h-4 lg:w-5 lg:h-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin/settings")}
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 lg:h-9 lg:w-9"
                title="Settings"
              >
                <Cog6ToothIcon className="w-4 h-4 lg:w-5 lg:h-5" />
              </Button>
            </>
          )}

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-xl overflow-hidden h-7 w-7 lg:h-9 lg:w-9 hover:ring-2 hover:ring-primary/50 transition-all">
                <BranchLogo logoUrl={currentBranch?.logo_url} name={gymName} size="sm" className="w-full h-full" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2 bg-card border shadow-lg">
              {/* Header Section */}
              <div className="px-2 py-2 mb-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground text-sm">{displayName}</p>
                  <Badge variant="secondary" className="text-xs">
                    {roleLabel}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{gymName}</p>
              </div>
              <DropdownMenuSeparator className="my-1" />
              
              {/* Navigation Items - Only show if permitted */}
              {(!isStaffUser || canAccessSettings) && (
                <>
                  <DropdownMenuItem 
                    onClick={() => navigate("/admin/settings?tab=general")} 
                    className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground transition-colors"
                  >
                    <BuildingStorefrontIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">Gym Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => navigate("/admin/settings")} 
                    className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground transition-colors"
                  >
                    <Cog6ToothIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => navigate("/admin/qr-code")} 
                    className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground transition-colors"
                  >
                    <QrCodeIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">QR Code</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                </>
              )}

              {/* Guide — available to everyone */}
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setIsGuideOpen(true);
                }}
                className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground transition-colors"
              >
                <SparklesIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Guide</span>
                <span className="ml-auto text-[10px] font-medium text-muted-foreground group-hover:text-primary-foreground/80">
                  Tips
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />

              {/* Sign Out */}
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-md text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive transition-colors"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;