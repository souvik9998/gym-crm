import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth, useStaffPermission } from "@/contexts/StaffAuthContext";
import { performFullLogout, clearAllAppState } from "@/lib/logout";
import {
  ArrowRightOnRectangleIcon,
  ArrowPathIcon,
  QrCodeIcon,
  Cog6ToothIcon,
  Bars3Icon,
  BuildingStorefrontIcon,
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
  const canAccessSettings = useStaffPermission("can_change_settings");
  
  // Get branch name dynamically from currentBranch
  const gymName = currentBranch?.name || "Pro Plus Fitness";

  const handleSignOut = async () => {
    // Clear all app state first (localStorage, React Query cache, etc.)
    clearAllAppState();
    
    if (isStaffUser) {
      await staffLogout();
    } else {
      await performFullLogout();
    }
    navigate("/admin/login");
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
      toast.success("Data refreshed");
    }
  };

  const displayName = isStaffUser ? (staffName || staffUser?.fullName || "Staff") : "Admin";
  const roleLabel = isStaffUser 
    ? (staffUser?.role ? staffUser.role.charAt(0).toUpperCase() + staffUser.role.slice(1) : "Staff")
    : "Admin";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border h-12 md:h-16 flex items-center px-2 md:px-6",
        className
      )}
    >
      <div className="flex items-center justify-between w-full">
        {/* Left Section */}
        <div className="flex items-center gap-2 md:gap-4">
          {showMobileMenu && (
            <button
              onClick={onMobileMenuClick}
              className="md:hidden p-1.5 hover:bg-muted rounded-lg transition-colors"
            >
              <Bars3Icon className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
            </button>
          )}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="min-w-0 hidden md:block">
              <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate hidden sm:block">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Center Section - Branch Selector (Desktop only) */}
        <div className="hidden md:flex items-center">
          <BranchSelector />
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1 md:gap-1.5">
          {/* Notification Center */}
          {!isStaffUser && <NotificationCenter />}

          {/* Refresh button - desktop only, hidden on mobile */}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="hidden md:inline-flex text-muted-foreground hover:text-foreground hover:bg-muted h-9 w-9"
              title="Refresh"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </Button>
          )}

          {/* Only show QR and Settings buttons if user has permission */}
          {(!isStaffUser || canAccessSettings) && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin/qr-code")}
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 md:h-9 md:w-9"
                title="QR Code"
              >
                <QrCodeIcon className="w-4 h-4 md:w-5 md:h-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin/settings")}
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 md:h-9 md:w-9"
                title="Settings"
              >
                <Cog6ToothIcon className="w-4 h-4 md:w-5 md:h-5" />
              </Button>
            </>
          )}

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-xl overflow-hidden h-7 w-7 md:h-9 md:w-9 hover:ring-2 hover:ring-primary/50 transition-all">
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