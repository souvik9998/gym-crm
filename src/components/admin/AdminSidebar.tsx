import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth, useStaffPermission } from "@/contexts/StaffAuthContext";
import { useTenantPermissions } from "@/hooks/useTenantPermissions";
import {
  HomeIcon,
  ChartBarIcon,
  BookOpenIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  QrCodeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  UsersIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import {
  HomeIcon as HomeIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  DocumentTextIcon as DocumentTextIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  QrCodeIcon as QrCodeIconSolid,
} from "@heroicons/react/24/solid";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { BranchSelector } from "./BranchSelector";
import { BranchLogo } from "./BranchLogo";

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  isMobile?: boolean;
  isStaffUser?: boolean;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconSolid?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children?: { title: string; href: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[];
  // Permission requirements - can be a single permission or array (OR logic)
  requiresPermission?:
    | "can_view_members"
    | "can_manage_members"
    | "can_access_ledger"
    | "can_access_payments"
    | "can_access_analytics"
    | "can_change_settings"
    | ("can_view_members" | "can_manage_members" | "can_access_ledger" | "can_access_payments" | "can_access_analytics" | "can_change_settings")[];
  adminOnly?: boolean;
  staffOnly?: boolean; // Only visible to staff users
  /** Tenant module key — item hidden if this module is disabled for the tenant */
  tenantModule?: string;
}

// Navigation items with STRICT permission requirements based on policy:
// 1. View Members - can ONLY view members
// 2. Edit/Create Members - can view, add, edit members AND record cash payments
// 3. Ledger Access - can ONLY access ledger
// 4. Payment Logs - can ONLY view payment logs
// 5. Analytics Access - can ONLY view analytics
// 6. Settings Access - can add/modify everything in settings
const allNavItems: NavItem[] = [
  // Admin Dashboard - only for admin users
  {
    title: "Dashboard",
    href: "/admin/dashboard",
    icon: HomeIcon,
    iconSolid: HomeIconSolid,
    adminOnly: true, // Only for admin users - staff use /staff/dashboard
  },
  // Staff Dashboard - for staff users with view or manage permission
  {
    title: "Dashboard",
    href: "/staff/dashboard",
    icon: HomeIcon,
    iconSolid: HomeIconSolid,
    requiresPermission: ["can_view_members", "can_manage_members"], // Either permission allows access
    staffOnly: true, // Only for staff users
  },
  // Analytics - requires ONLY analytics permission
  {
    title: "Analytics",
    href: "/admin/analytics",
    icon: ChartBarIcon,
    iconSolid: ChartBarIconSolid,
    requiresPermission: "can_access_analytics",
    tenantModule: "reports_analytics",
  },
  // Branch Analytics - admin only
  {
    title: "Branch Analytics",
    href: "/admin/branch-analytics",
    icon: BuildingOffice2Icon,
    iconSolid: BuildingOffice2Icon,
    adminOnly: true,
    tenantModule: "reports_analytics",
  },
  // Attendance - admin only
  {
    title: "Attendance",
    href: "/admin/attendance",
    icon: ClipboardDocumentListIcon,
    iconSolid: ClipboardDocumentListIcon,
    adminOnly: true,
    tenantModule: "attendance",
  },
  // Ledger - requires ONLY ledger permission
  {
    title: "Ledger",
    href: "/admin/ledger",
    icon: BookOpenIcon,
    iconSolid: BookOpenIconSolid,
    requiresPermission: "can_access_ledger",
    tenantModule: "payments_billing",
  },
  // Staff Control - admin only
  {
    title: "Staff Control",
    href: "/admin/staff",
    icon: UserGroupIcon,
    iconSolid: UserGroupIcon,
    adminOnly: true, // Only for admin users
    tenantModule: "staff_management",
  },
  // Activity Logs - admin only
  {
    title: "Activity Logs",
    href: "/admin/logs",
    icon: DocumentTextIcon,
    iconSolid: DocumentTextIconSolid,
    adminOnly: true,
    children: [
      { title: "Admin Activity", href: "/admin/logs?tab=activity", icon: ClipboardDocumentListIcon },
      { title: "User Activity", href: "/admin/logs?tab=user", icon: UserGroupIcon },
      { title: "Staff Activity", href: "/admin/logs?tab=staff", icon: UsersIcon },
      { title: "WhatsApp Logs", href: "/admin/logs?tab=whatsapp", icon: ChatBubbleLeftRightIcon },
    ],
  },
];

const allBottomNavItems: NavItem[] = [
  // QR Code - requires settings permission
  {
    title: "QR Code",
    href: "/admin/qr-code",
    icon: QrCodeIcon,
    iconSolid: QrCodeIconSolid,
    requiresPermission: "can_change_settings",
  },
  // Settings - requires settings permission
  {
    title: "Settings",
    href: "/admin/settings",
    icon: Cog6ToothIcon,
    iconSolid: Cog6ToothIconSolid,
    requiresPermission: "can_change_settings",
  },
];

export const AdminSidebar = ({ collapsed, onCollapsedChange, isMobile = false, isStaffUser = false }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const { permissions, staffUser } = useStaffAuth();
  const { isModuleEnabled } = useTenantPermissions();
  const [expandedItems, setExpandedItems] = useState<string[]>(["Activity Logs"]);

  // Get branch name dynamically from currentBranch
  const gymName = currentBranch?.name || "Pro Plus Fitness";

  // Filter nav items based on permissions
  const filterNavItems = (items: NavItem[]): NavItem[] => {
    console.log("[Sidebar] Filtering nav items, isStaffUser:", isStaffUser, "permissions:", permissions);
    return items.filter((item) => {
      // Check tenant module permission first
      if (item.tenantModule && !isModuleEnabled(item.tenantModule as any)) return false;

      // Staff-only items should only show for staff users
      if (item.staffOnly && !isStaffUser) return false;
      
      // Admin-only items are hidden for staff
      if (item.adminOnly && isStaffUser) return false;

      // Check specific permission requirement
      if (item.requiresPermission) {
        // Admin users (non-staff) have all permissions
        if (!isStaffUser) return true;
        
        // For staff, check if they have the required permission(s)
        if (Array.isArray(item.requiresPermission)) {
          // OR logic - need at least one of the permissions
          const hasPermission = item.requiresPermission.some(perm => permissions?.[perm] === true);
          console.log("[Sidebar] Item:", item.title, "requires one of:", item.requiresPermission, "hasPermission:", hasPermission);
          return hasPermission;
        } else {
          const hasPermission = permissions?.[item.requiresPermission] === true;
          console.log("[Sidebar] Item:", item.title, "requires:", item.requiresPermission, "hasPermission:", hasPermission);
          return hasPermission;
        }
      }

      return true;
    });
  };

  const navItems = filterNavItems(allNavItems);
  const bottomNavItems = filterNavItems(allBottomNavItems);

  const isActive = (href: string) => {
    if (href.includes("?")) {
      return location.pathname + location.search === href;
    }
    return location.pathname === href;
  };

  const isParentActive = (item: NavItem) => {
    if (item.children) {
      return item.children.some((child) => isActive(child.href)) || location.pathname === item.href;
    }
    return isActive(item.href);
  };

  const toggleExpanded = (title: string) => {
    setExpandedItems((prev) => (prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]));
  };

  const handleNavClick = (href: string) => {
    if (href.includes("?tab=")) {
      const [path, query] = href.split("?");
      const params = new URLSearchParams(query);
      navigate(path + "?" + params.toString());
    } else {
      navigate(href);
    }
  };

  const renderNavItem = (item: NavItem, isBottom = false) => {
    const active = isParentActive(item);
    const Icon = active && item.iconSolid ? item.iconSolid : item.icon;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.title);

    if (collapsed && !isMobile) {
      return (
        <TooltipProvider key={item.title} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "w-full flex items-center justify-center p-3 rounded-xl transition-all duration-200",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="ml-2 font-medium">
              <p>{item.title}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (hasChildren) {
      return (
        <Collapsible key={item.title} open={isExpanded} onOpenChange={() => toggleExpanded(item.title)}>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-left text-sm font-medium">{item.title}</span>
              <ChevronDownIcon
                className={cn("w-4 h-4 transition-transform duration-200", isExpanded ? "rotate-180" : "")}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-4 mt-1 space-y-1">
            {item.children?.map((child) => {
              const childActive = isActive(child.href);
              const ChildIcon = child.icon;
              return (
                <button
                  key={child.title}
                  onClick={() => handleNavClick(child.href)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm",
                    childActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <ChildIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{child.title}</span>
                </button>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <button
        key={item.title}
        onClick={() => handleNavClick(item.href)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {(!collapsed || isMobile) && <span className="text-sm font-medium">{item.title}</span>}
      </button>
    );
  };

  // For mobile, render without the outer wrapper
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        {/* Branch Selector for Mobile */}
        <div className="p-3 border-b border-border">
          <BranchSelector />
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => renderNavItem(item))}
        </nav>

        {/* Bottom Navigation */}
        {bottomNavItems.length > 0 && (
          <div className="p-3 border-t border-border space-y-1.5">
            {bottomNavItems.map((item) => renderNavItem(item, true))}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      {/* Header - h-16 to match top nav */}
      <div className="h-16 px-4 border-b border-border flex items-center">
        <div className={cn("flex items-center w-full", collapsed ? "justify-center" : "gap-3")}>
          <BranchLogo logoUrl={currentBranch?.logo_url} name={gymName} size="md" />
          {!collapsed && (
            <div className="flex-1 overflow-hidden min-w-0">
              <h1 className="text-sm font-semibold text-foreground truncate">{gymName}</h1>
              <p className="text-xs text-muted-foreground">
                {isStaffUser
                  ? `${staffUser?.role ? staffUser.role.charAt(0).toUpperCase() + staffUser.role.slice(1) : "Staff"} Panel`
                  : "Admin Panel"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => renderNavItem(item))}
      </nav>

      {/* Bottom Navigation */}
      {bottomNavItems.length > 0 && (
        <div className="p-3 border-t border-border space-y-1.5">
          {bottomNavItems.map((item) => renderNavItem(item, true))}
        </div>
      )}

      {/* Toggle button - centered on right edge at middle of sidebar height */}
      <button
        onClick={() => onCollapsedChange(!collapsed)}
        className={cn(
          "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center",
          "text-muted-foreground hover:text-foreground hover:bg-muted",
          "transition-all duration-200 shadow-sm hover:shadow-md",
          "focus:outline-none focus:ring-2 focus:ring-primary/50",
        )}
      >
        {collapsed ? <ChevronRightIcon className="w-3.5 h-3.5" /> : <ChevronLeftIcon className="w-3.5 h-3.5" />}
      </button>
    </aside>
  );
};

export default AdminSidebar;
