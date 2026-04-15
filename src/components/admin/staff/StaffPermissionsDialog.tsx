import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { useBranch } from "@/contexts/BranchContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EyeIcon,
  PencilSquareIcon,
  BookOpenIcon,
  CurrencyRupeeIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ClockIcon,
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";

interface StaffPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: Staff | null;
  onSuccess: () => void;
}

interface Permissions {
  can_view_members: boolean;
  can_manage_members: boolean;
  can_access_ledger: boolean;
  can_access_payments: boolean;
  can_access_analytics: boolean;
  can_change_settings: boolean;
  can_send_whatsapp: boolean;
  can_access_attendance: boolean;
  can_manage_events: boolean;
  member_access_type: string;
  can_manage_time_slots: boolean;
  can_create_time_slots: boolean;
  can_edit_delete_time_slots: boolean;
  can_view_time_slots: boolean;
  can_assign_members_to_slots: boolean;
  can_view_slot_members: boolean;
}

const CORE_PERMISSIONS: Array<{ key: keyof Permissions; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "can_view_members", label: "View Members", description: "Can view member list and profiles", icon: EyeIcon },
  { key: "can_manage_members", label: "Manage Members", description: "Can create, edit, and update member records", icon: PencilSquareIcon },
  { key: "can_access_ledger", label: "Ledger Access", description: "Can access income and expense ledger", icon: BookOpenIcon },
  { key: "can_access_payments", label: "Payment Logs", description: "Can view payment history and records", icon: CurrencyRupeeIcon },
  { key: "can_access_analytics", label: "Analytics Access", description: "Can view analytics and statistics dashboards", icon: ChartBarIcon },
  { key: "can_change_settings", label: "Settings Access", description: "Can modify gym settings and configurations", icon: Cog6ToothIcon },
  { key: "can_send_whatsapp", label: "WhatsApp Access", description: "Can send WhatsApp messages to members", icon: ChatBubbleLeftRightIcon },
  { key: "can_access_attendance", label: "Attendance Access", description: "Can mark and view attendance records", icon: ClockIcon },
  { key: "can_manage_events", label: "Events Access", description: "Create and manage events & registrations", icon: CalendarDaysIcon },
];

const TIME_SLOT_PERMISSIONS: Array<{ key: keyof Permissions; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "can_manage_time_slots", label: "Manage Time Slots", description: "Full time slot management access", icon: ClockIcon },
  { key: "can_create_time_slots", label: "Create Time Slots", description: "Can create new time slots", icon: ClockIcon },
  { key: "can_edit_delete_time_slots", label: "Edit/Delete Slots", description: "Can edit or delete time slots", icon: ClockIcon },
  { key: "can_view_time_slots", label: "View Time Slots", description: "Can view time slot schedules", icon: EyeIcon },
  { key: "can_assign_members_to_slots", label: "Assign Members", description: "Can assign members to time slots", icon: UserGroupIcon },
  { key: "can_view_slot_members", label: "View Slot Members", description: "Can see members assigned to slots", icon: UserGroupIcon },
];

export const StaffPermissionsDialog = ({
  open,
  onOpenChange,
  staff,
  onSuccess,
}: StaffPermissionsDialogProps) => {
  const { currentBranch } = useBranch();
  const [permissions, setPermissions] = useState<Permissions>({
    can_view_members: false,
    can_manage_members: false,
    can_access_ledger: false,
    can_access_payments: false,
    can_access_analytics: false,
    can_change_settings: false,
    can_send_whatsapp: false,
    can_access_attendance: true,
    can_manage_events: false,
    member_access_type: "all",
    can_manage_time_slots: false,
    can_create_time_slots: false,
    can_edit_delete_time_slots: false,
    can_view_time_slots: true,
    can_assign_members_to_slots: false,
    can_view_slot_members: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (staff?.permissions) {
      const p = staff.permissions as any;
      setPermissions({
        can_view_members: p.can_view_members ?? false,
        can_manage_members: p.can_manage_members ?? false,
        can_access_ledger: p.can_access_ledger ?? false,
        can_access_payments: p.can_access_payments ?? false,
        can_access_analytics: p.can_access_analytics ?? false,
        can_change_settings: p.can_change_settings ?? false,
        can_send_whatsapp: p.can_send_whatsapp ?? false,
        can_access_attendance: p.can_access_attendance ?? true,
        can_manage_events: p.can_manage_events ?? false,
        member_access_type: p.member_access_type ?? "all",
        can_manage_time_slots: p.can_manage_time_slots ?? false,
        can_create_time_slots: p.can_create_time_slots ?? false,
        can_edit_delete_time_slots: p.can_edit_delete_time_slots ?? false,
        can_view_time_slots: p.can_view_time_slots ?? true,
        can_assign_members_to_slots: p.can_assign_members_to_slots ?? false,
        can_view_slot_members: p.can_view_slot_members ?? false,
      });
    } else {
      setPermissions({
        can_view_members: true,
        can_manage_members: staff?.role === "manager",
        can_access_ledger: staff?.role === "accountant",
        can_access_payments: staff?.role === "accountant" || staff?.role === "manager",
        can_access_analytics: staff?.role === "manager",
        can_change_settings: false,
        can_send_whatsapp: staff?.role === "manager",
        can_access_attendance: true,
        can_manage_events: staff?.role === "manager",
        member_access_type: "all",
        can_manage_time_slots: staff?.role === "manager" || staff?.role === "trainer",
        can_create_time_slots: staff?.role === "manager",
        can_edit_delete_time_slots: staff?.role === "manager",
        can_view_time_slots: true,
        can_assign_members_to_slots: staff?.role === "manager" || staff?.role === "trainer",
        can_view_slot_members: true,
      });
    }
  }, [staff]);

  const handleSave = async () => {
    if (!staff) return;
    setIsLoading(true);

    try {
      const { data: existing } = await supabase
        .from("staff_permissions")
        .select("id")
        .eq("staff_id", staff.id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("staff_permissions")
          .update(permissions)
          .eq("staff_id", staff.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("staff_permissions")
          .insert({ staff_id: staff.id, ...permissions });
        if (error) throw error;
      }

      await logAdminActivity({
        category: "staff",
        type: "staff_permissions_updated",
        description: `Updated permissions for "${staff.full_name}"`,
        entityType: "staff_permissions",
        entityId: staff.id,
        entityName: staff.full_name,
        branchId: currentBranch?.id,
      });

      toast.success("Permissions updated successfully");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error("Failed to update permissions", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePermission = (key: keyof Permissions) => {
    if (key === "member_access_type") return;
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-4 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base">Staff Permissions</DialogTitle>
          <DialogDescription className="text-xs">
            Configure what {staff?.full_name} can access and manage
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <p><strong>Name:</strong> {staff?.full_name}</p>
            <p><strong>Role:</strong> {staff?.role}</p>
          </div>

          {/* Core Permissions */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Core Permissions</p>
          <div className="space-y-2">
            {CORE_PERMISSIONS.map(({ key, label, description, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between gap-3 p-2.5 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm font-medium block">{label}</Label>
                    <p className="text-[11px] text-muted-foreground">{description}</p>
                  </div>
                </div>
                <Switch checked={!!permissions[key]} onCheckedChange={() => togglePermission(key)} className="flex-shrink-0" />
              </div>
            ))}
          </div>

          <Separator />

          {/* Member Access Control */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member Access</p>
          <div className="p-2.5 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Member Access Type</p>
                <p className="text-[11px] text-muted-foreground">Control which members this staff can see</p>
              </div>
              <Select
                value={permissions.member_access_type}
                onValueChange={(v) => setPermissions(prev => ({ ...prev, member_access_type: v }))}
              >
                <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  <SelectItem value="assigned">Assigned Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Time Slot Permissions */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time Slot Permissions</p>
          <div className="space-y-2">
            {TIME_SLOT_PERMISSIONS.map(({ key, label, description, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between gap-3 p-2.5 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm font-medium block">{label}</Label>
                    <p className="text-[11px] text-muted-foreground">{description}</p>
                  </div>
                </div>
                <Switch checked={!!permissions[key]} onCheckedChange={() => togglePermission(key)} className="flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
