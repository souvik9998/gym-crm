import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  HomeIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  Cog6ToothIcon,
  UsersIcon,
  ChartBarIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

interface SuperAdminSidebarProps {
  currentPath: string;
}

const navItems = [
  {
    label: "Dashboard",
    href: "/superadmin/dashboard",
    icon: HomeIcon,
  },
  {
    label: "Organizations",
    href: "/superadmin/tenants",
    icon: BuildingOffice2Icon,
  },
  {
    label: "All Users",
    href: "/superadmin/users",
    icon: UsersIcon,
  },
  {
    label: "Analytics",
    href: "/superadmin/analytics",
    icon: ChartBarIcon,
  },
  {
    label: "Audit Logs",
    href: "/superadmin/audit-logs",
    icon: DocumentTextIcon,
  },
  {
    label: "Settings",
    href: "/superadmin/settings",
    icon: Cog6ToothIcon,
  },
];

export function SuperAdminSidebar({ currentPath }: SuperAdminSidebarProps) {
  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      {/* Logo/Header */}
      <div className="h-16 border-b border-border flex items-center px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheckIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-foreground">Super Admin</h1>
            <p className="text-xs text-muted-foreground">Platform Control</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = currentPath === item.href || currentPath.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Quick Actions */}
      <div className="p-4 border-t border-border">
        <Link
          to="/admin/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <HomeIcon className="w-5 h-5" />
          Switch to Admin View
        </Link>
      </div>
    </aside>
  );
}
