import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

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
  { key: "can_view_members" as const, label: "View Members", description: "Can view member list and profiles" },
  { key: "can_manage_members" as const, label: "Edit/Create Members", description: "Can create, edit, and update members" },
  { key: "can_access_ledger" as const, label: "Ledger Access", description: "Access income/expense ledger" },
  { key: "can_access_payments" as const, label: "Payment Logs", description: "View payment history and records" },
  { key: "can_access_analytics" as const, label: "Analytics Access", description: "View analytics dashboards" },
  { key: "can_change_settings" as const, label: "Settings Access", description: "Modify gym settings" },
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
        {PERMISSION_OPTIONS.map((option) => (
          <label
            key={option.key}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              checked={permissions[option.key]}
              onCheckedChange={() => togglePermission(option.key)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {PERMISSION_OPTIONS.map((option) => (
        <label
          key={option.key}
          className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
        >
          <Checkbox
            checked={permissions[option.key]}
            onCheckedChange={() => togglePermission(option.key)}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{option.label}</span>
            <p className="text-xs text-muted-foreground">{option.description}</p>
          </div>
        </label>
      ))}
    </div>
  );
};

export const getDefaultPermissions = (role: string): InlinePermissions => ({
  can_view_members: true,
  can_manage_members: role === "admin" || role === "manager",
  can_access_ledger: role === "admin" || role === "accountant",
  can_access_payments: role === "admin" || role === "accountant" || role === "manager",
  can_access_analytics: role === "admin" || role === "manager",
  can_change_settings: role === "admin",
});
