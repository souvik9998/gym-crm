import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  HomeIcon,
  UsersIcon,
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
} from "@heroicons/react/24/outline";
import {
  HomeIcon as HomeIconSolid,
  UsersIcon as UsersIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  DocumentTextIcon as DocumentTextIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  QrCodeIcon as QrCodeIconSolid,
} from "@heroicons/react/24/solid";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon } from "@heroicons/react/20/solid";

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  gymName?: string;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconSolid?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children?: { title: string; href: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[];
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/admin/dashboard",
    icon: HomeIcon,
    iconSolid: HomeIconSolid,
  },
  {
    title: "Analytics",
    href: "/admin/analytics",
    icon: ChartBarIcon,
    iconSolid: ChartBarIconSolid,
  },
  {
    title: "Ledger",
    href: "/admin/ledger",
    icon: BookOpenIcon,
    iconSolid: BookOpenIconSolid,
  },
  {
    title: "Activity Logs",
    href: "/admin/logs",
    icon: DocumentTextIcon,
    iconSolid: DocumentTextIconSolid,
    children: [
      { title: "Admin Activity", href: "/admin/logs?tab=activity", icon: ClipboardDocumentListIcon },
      { title: "User Activity", href: "/admin/logs?tab=user", icon: UserGroupIcon },
      { title: "WhatsApp Logs", href: "/admin/logs?tab=whatsapp", icon: ChatBubbleLeftRightIcon },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  {
    title: "QR Code",
    href: "/admin/qr-code",
    icon: QrCodeIcon,
    iconSolid: QrCodeIconSolid,
  },
  {
    title: "Settings",
    href: "/admin/settings",
    icon: Cog6ToothIcon,
    iconSolid: Cog6ToothIconSolid,
  },
];

export const AdminSidebar = ({ collapsed, onCollapsedChange, gymName = "Pro Plus Fitness" }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedItems, setExpandedItems] = useState<string[]>(["Activity Logs"]);

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
    setExpandedItems((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
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

    if (collapsed) {
      return (
        <TooltipProvider key={item.title} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  "w-full flex items-center justify-center p-3 rounded-xl transition-all duration-200",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="ml-2">
              <p>{item.title}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (hasChildren) {
      return (
        <Collapsible
          key={item.title}
          open={isExpanded}
          onOpenChange={() => toggleExpanded(item.title)}
        >
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-left text-sm font-medium">{item.title}</span>
              <ChevronDownIcon
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  isExpanded ? "rotate-180" : ""
                )}
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
                      ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
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
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm font-medium">{item.title}</span>
      </button>
    );
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-40 flex flex-col transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center overflow-hidden flex-shrink-0">
            <img
              src="/logo.jpg"
              alt="Logo"
              className="w-full h-full object-cover"
            />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-semibold text-sidebar-foreground truncate">
                {gymName}
              </h1>
              <p className="text-xs text-sidebar-foreground/60">Admin Panel</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => renderNavItem(item))}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-3 border-t border-sidebar-border space-y-1.5">
        {bottomNavItems.map((item) => renderNavItem(item, true))}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => onCollapsedChange(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-sidebar border border-sidebar-border rounded-full flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200 shadow-sm"
      >
        {collapsed ? (
          <ChevronRightIcon className="w-4 h-4" />
        ) : (
          <ChevronLeftIcon className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
};

export default AdminSidebar;
