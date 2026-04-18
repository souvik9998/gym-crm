import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  EyeIcon,
  PencilSquareIcon,
  BookOpenIcon,
  CurrencyRupeeIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  UserGroupIcon,
  UsersIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

export interface InlinePermissions {
  can_view_members: boolean;
  can_manage_members: boolean;
  can_access_ledger: boolean;
  can_access_payments: boolean;
  can_access_analytics: boolean;
  can_view_settings: boolean;
  can_change_settings: boolean;
  can_send_whatsapp: boolean;
  can_access_attendance: boolean;
  can_manage_events: boolean;
  member_access_type?: string;
  can_manage_time_slots?: boolean;
  can_create_time_slots?: boolean;
  can_edit_delete_time_slots?: boolean;
  can_view_time_slots?: boolean;
  can_assign_members_to_slots?: boolean;
  can_view_slot_members?: boolean;
}

interface StaffInlinePermissionsProps {
  permissions: InlinePermissions;
  onChange: (permissions: InlinePermissions) => void;
  compact?: boolean;
}

const CORE_PERMISSION_OPTIONS = [
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
    key: "can_view_settings" as const, 
    label: "View Settings", 
    description: "View gym settings (read-only)",
    icon: EyeIcon,
  },
  { 
    key: "can_change_settings" as const, 
    label: "Edit Settings", 
    description: "Modify gym settings (auto-includes view)",
    icon: Cog6ToothIcon,
  },
  { 
    key: "can_send_whatsapp" as const, 
    label: "WhatsApp Access", 
    description: "Send WhatsApp messages to members",
    icon: ChatBubbleLeftRightIcon,
  },
  { 
    key: "can_access_attendance" as const, 
    label: "Attendance Access", 
    description: "Mark and view attendance records",
    icon: ClockIcon,
  },
  { 
    key: "can_manage_events" as const, 
    label: "Events Access", 
    description: "Create and manage events & registrations",
    icon: CalendarDaysIcon,
  },
];

const TIME_SLOT_PERMISSION_OPTIONS = [
  {
    key: "can_manage_time_slots" as const,
    label: "Manage Time Slots",
    description: "Full time slot management access",
    icon: ClockIcon,
  },
  {
    key: "can_create_time_slots" as const,
    label: "Create Time Slots",
    description: "Can create new time slots",
    icon: ClockIcon,
  },
  {
    key: "can_edit_delete_time_slots" as const,
    label: "Edit/Delete Slots",
    description: "Can edit or delete time slots",
    icon: ClockIcon,
  },
  {
    key: "can_view_time_slots" as const,
    label: "View Time Slots",
    description: "Can view time slot schedules",
    icon: EyeIcon,
  },
  {
    key: "can_assign_members_to_slots" as const,
    label: "Assign Members",
    description: "Can assign members to time slots",
    icon: UserGroupIcon,
  },
  {
    key: "can_view_slot_members" as const,
    label: "View Slot Members",
    description: "Can see members in each slot",
    icon: UsersIcon,
  },
];

export const StaffInlinePermissions = ({
  permissions,
  onChange,
  compact = false,
}: StaffInlinePermissionsProps) => {
  const togglePermission = (key: keyof InlinePermissions) => {
    if (key === "member_access_type") return;
    const next = !permissions[key];
    const updated: InlinePermissions = { ...permissions, [key]: next };

    // Mutual logic between view and edit settings:
    // - Enabling "Edit Settings" auto-enables "View Settings"
    // - Disabling "View Settings" auto-disables "Edit Settings"
    if (key === "can_change_settings" && next) {
      updated.can_view_settings = true;
    }
    if (key === "can_view_settings" && !next) {
      updated.can_change_settings = false;
    }

    onChange(updated);
  };

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          {CORE_PERMISSION_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <label key={option.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={!!permissions[option.key]}
                  onCheckedChange={() => togglePermission(option.key)}
                />
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        <Separator />
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Member Access</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...permissions, member_access_type: "all" })}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md border transition-colors",
                (permissions.member_access_type || "all") === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              )}
            >
              All Members
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...permissions, member_access_type: "assigned" })}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md border transition-colors",
                permissions.member_access_type === "assigned"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              )}
            >
              Assigned Only
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Time Slot Permissions</p>
          <div className="flex flex-wrap gap-3">
            {TIME_SLOT_PERMISSION_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <label key={option.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!permissions[option.key]}
                    onCheckedChange={() => togglePermission(option.key)}
                  />
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Core Permissions */}
      <div>
        <p className="text-sm font-medium mb-2">Core Permissions</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CORE_PERMISSION_OPTIONS.map((option) => {
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
                  checked={!!permissions[option.key]}
                  onCheckedChange={() => togglePermission(option.key)}
                  className="flex-shrink-0"
                />
              </label>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Member Access Control */}
      <div>
        <p className="text-sm font-medium mb-2">Member Access Control</p>
        <div className="p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-3">
            <UsersIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Member Access Type</p>
              <p className="text-xs text-muted-foreground">Control which members this staff can see</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...permissions, member_access_type: "all" })}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md border transition-colors",
                  (permissions.member_access_type || "all") === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                )}
              >
                All Members
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...permissions, member_access_type: "assigned" })}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md border transition-colors",
                  permissions.member_access_type === "assigned"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                )}
              >
                Assigned Only
              </button>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Time Slot Permissions */}
      <div>
        <p className="text-sm font-medium mb-2">Time Slot Permissions</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TIME_SLOT_PERMISSION_OPTIONS.map((option) => {
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
                  checked={!!permissions[option.key]}
                  onCheckedChange={() => togglePermission(option.key)}
                  className="flex-shrink-0"
                />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const getDefaultPermissions = (role: string): InlinePermissions => ({
  can_view_members: true,
  can_manage_members: role === "manager",
  can_access_ledger: role === "accountant",
  can_access_payments: role === "accountant" || role === "manager",
  can_access_analytics: role === "manager",
  can_view_settings: false,
  can_change_settings: false,
  can_send_whatsapp: role === "manager",
  can_access_attendance: true,
  can_manage_events: role === "manager",
  member_access_type: "all",
  can_manage_time_slots: role === "manager" || role === "trainer",
  can_create_time_slots: role === "manager",
  can_edit_delete_time_slots: role === "manager",
  can_view_time_slots: true,
  can_assign_members_to_slots: role === "manager" || role === "trainer",
  can_view_slot_members: true,
});