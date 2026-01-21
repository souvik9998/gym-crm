import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth, useStaffPermission } from "@/contexts/StaffAuthContext";
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
  // Permission requirements
  requiresPermission?:
    | "can_view_members"
    | "can_manage_members"
    | "can_access_ledger"
    | "can_access_payments"
    | "can_access_analytics"
    | "can_change_settings";
  adminOnly?: boolean;
}

// Navigation items with permission requirements
const allNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/admin/dashboard",
    icon: HomeIcon,
    iconSolid: HomeIconSolid,
    requiresPermission: "can_view_members", // Basic access
  },
  {
    title: "Analytics",
    href: "/admin/analytics",
    icon: ChartBarIcon,
    iconSolid: ChartBarIconSolid,
    requiresPermission: "can_access_analytics",
  },
  {
    title: "Ledger",
    href: "/admin/ledger",
    icon: BookOpenIcon,
    iconSolid: BookOpenIconSolid,
    requiresPermission: "can_access_ledger",
  },
  {
    title: "Staff Control",
    href: "/admin/staff",
    icon: UserGroupIcon,
    iconSolid: UserGroupIcon,
    adminOnly: true, // Only for admin users
  },
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
  {
    title: "QR Code",
    href: "/admin/qr-code",
    icon: QrCodeIcon,
    iconSolid: QrCodeIconSolid,
    adminOnly: true,
  },
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
  const [expandedItems, setExpandedItems] = useState<string[]>(["Activity Logs"]);

  // Get branch name dynamically from currentBranch
  const gymName = currentBranch?.name || "Pro Plus Fitness";

  // Filter nav items based on permissions
  const filterNavItems = (items: NavItem[]): NavItem[] => {
    if (!isStaffUser) {
      // Admin users see everything
      return items;
    }

    return items.filter((item) => {
      // Admin-only items are hidden for staff
      if (item.adminOnly) return false;

      // Check specific permission requirement
      if (item.requiresPermission) {
        // Staff role 'admin' has all permissions
        if (staffUser?.role === "admin") return true;
        return permissions?.[item.requiresPermission] || false;
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
        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          <div className="px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Menu</p>
          </div>
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
          <div className="w-10 h-10 rounded-xl bg-primary overflow-hidden flex-shrink-0 shadow-sm">
            <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
          </div>
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
        {!collapsed && (
          <div className="px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Menu</p>
          </div>
        )}
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
