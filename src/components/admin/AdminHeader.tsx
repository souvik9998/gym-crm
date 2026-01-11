import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AdminHeaderProps {
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  showMobileMenu?: boolean;
  onMobileMenuClick?: () => void;
  gymName?: string;
  className?: string;
}

export const AdminHeader = ({
  title = "Dashboard",
  subtitle,
  onRefresh,
  showMobileMenu = false,
  onMobileMenuClick,
  gymName = "Pro Plus Fitness",
  className,
}: AdminHeaderProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
      toast({ title: "Data refreshed" });
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
          <div>
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1.5">
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
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{gymName}</span>
                  <span className="text-xs text-muted-foreground">Admin Account</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/admin/settings?tab=general")} className="cursor-pointer">
                <BuildingStorefrontIcon className="w-4 h-4 mr-2" />
                Gym Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/admin/settings")} className="cursor-pointer">
                <Cog6ToothIcon className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/admin/qr-code")} className="cursor-pointer">
                <QrCodeIcon className="w-4 h-4 mr-2" />
                QR Code
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                <ArrowRightOnRectangleIcon className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
