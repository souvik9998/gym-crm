import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EyeIcon,
  PencilSquareIcon,
  BookOpenIcon,
  CurrencyRupeeIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

export interface InlinePermissions {
  can_view_members: boolean;
  can_manage_members: boolean;
  can_access_ledger: boolean;
  can_access_payments: boolean;
  can_access_analytics: boolean;
  can_change_settings: boolean;
}

interface StaffInlinePermissionsProps {
  permissions: InlinePermissions;
  onChange: (permissions: InlinePermissions) => void;
  compact?: boolean;
}

const PERMISSION_OPTIONS = [
  { 
    key: "can_view_members" as const, 
    label: "View Members", 
    description: "Can view member list and profiles",
    icon: EyeIcon,
  },
  { 
    key: "can_manage_members" as const, 
    label: "Edit/Create Members", 
    description: "Can create, edit, and update members",
    icon: PencilSquareIcon,
  },
  { 
    key: "can_access_ledger" as const, 
    label: "Ledger Access", 
    description: "Access income/expense ledger",
    icon: BookOpenIcon,
  },
  { 
    key: "can_access_payments" as const, 
    label: "Payment Logs", 
    description: "View payment history and records",
    icon: CurrencyRupeeIcon,
  },
  { 
    key: "can_access_analytics" as const, 
    label: "Analytics Access", 
    description: "View analytics dashboards",
    icon: ChartBarIcon,
  },
  { 
    key: "can_change_settings" as const, 
    label: "Settings Access", 
    description: "Modify gym settings",
    icon: Cog6ToothIcon,
  },
];

export const StaffInlinePermissions = ({
  permissions,
  onChange,
  compact = false,
}: StaffInlinePermissionsProps) => {
  const togglePermission = (key: keyof InlinePermissions) => {
    onChange({
      ...permissions,
      [key]: !permissions[key],
    });
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-3">
        {PERMISSION_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <label
              key={option.key}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={permissions[option.key]}
                onCheckedChange={() => togglePermission(option.key)}
              />
              <Icon className="w-4 h-4 text-muted-foreground" />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {PERMISSION_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <label
            key={option.key}
            className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="space-y-0.5 flex-1 min-w-0">
                <span className="text-sm font-medium block">{option.label}</span>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </div>
            <Checkbox
              checked={permissions[option.key]}
              onCheckedChange={() => togglePermission(option.key)}
              className="flex-shrink-0"
            />
          </label>
        );
      })}
    </div>
  );
};

export const getDefaultPermissions = (role: string): InlinePermissions => ({
  can_view_members: true,
  can_manage_members: role === "manager",
  can_access_ledger: role === "accountant",
  can_access_payments: role === "accountant" || role === "manager",
  can_access_analytics: role === "manager",
  can_change_settings: false,
});
