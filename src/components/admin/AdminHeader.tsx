import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import {
  ArrowRightOnRectangleIcon,
  ArrowPathIcon,
  QrCodeIcon,
  Cog6ToothIcon,
  UserCircleIcon,
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

interface AdminHeaderProps {
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  showMobileMenu?: boolean;
  onMobileMenuClick?: () => void;
  className?: string;
}

export const AdminHeader = ({
  title = "Dashboard",
  subtitle,
  onRefresh,
  showMobileMenu = false,
  onMobileMenuClick,
  className,
}: AdminHeaderProps) => {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  
  // Get branch name dynamically from currentBranch
  const gymName = currentBranch?.name || "Pro Plus Fitness";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
      toast.success("Data refreshed");
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border h-16 flex items-center px-4 md:px-6",
        className
      )}
    >
      <div className="flex items-center justify-between w-full">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          {showMobileMenu && (
            <button
              onClick={onMobileMenuClick}
              className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <Bars3Icon className="w-5 h-5 text-foreground" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-foreground">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Center Section - Branch Selector */}
        <div className="hidden sm:flex items-center">
          <BranchSelector />
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1.5">
          {/* Mobile Branch Selector */}
          <div className="sm:hidden">
            <BranchSelector />
          </div>

          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="text-muted-foreground hover:text-foreground hover:bg-muted h-9 w-9"
              title="Refresh"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/qr-code")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted hidden md:flex h-9 w-9"
            title="QR Code"
          >
            <QrCodeIcon className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/settings")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted hidden md:flex h-9 w-9"
            title="Settings"
          >
            <Cog6ToothIcon className="w-5 h-5" />
          </Button>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-muted h-9 w-9"
              >
                <UserCircleIcon className="w-6 h-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-2 bg-white dark:bg-card border shadow-lg">
              {/* Header Section */}
              <div className="px-2 py-2 mb-1">
                <p className="font-semibold text-foreground text-sm">{gymName}</p>
                <p className="text-xs text-muted-foreground">Admin Account</p>
              </div>
              <DropdownMenuSeparator className="my-1" />
              
              {/* Navigation Items */}
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
