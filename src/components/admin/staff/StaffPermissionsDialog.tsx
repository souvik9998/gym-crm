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
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { useBranch } from "@/contexts/BranchContext";
import {
  EyeIcon,
  PencilSquareIcon,
  BookOpenIcon,
  CurrencyRupeeIcon,
  ChartBarIcon,
  Cog6ToothIcon,
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
}

const PERMISSION_LABELS: Record<keyof Permissions, { label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  can_view_members: {
    label: "View Members",
    description: "Can view member list and profiles",
    icon: EyeIcon,
  },
  can_manage_members: {
    label: "Manage Members",
    description: "Can create, edit, and update member records",
    icon: PencilSquareIcon,
  },
  can_access_ledger: {
    label: "Ledger Access",
    description: "Can access income and expense ledger",
    icon: BookOpenIcon,
  },
  can_access_payments: {
    label: "Payment Logs",
    description: "Can view payment history and records",
    icon: CurrencyRupeeIcon,
  },
  can_access_analytics: {
    label: "Analytics Access",
    description: "Can view analytics and statistics dashboards",
    icon: ChartBarIcon,
  },
  can_change_settings: {
    label: "Settings Access",
    description: "Can modify gym settings and configurations",
    icon: Cog6ToothIcon,
  },
};

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
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (staff?.permissions) {
      setPermissions({
        can_view_members: staff.permissions.can_view_members,
        can_manage_members: staff.permissions.can_manage_members,
        can_access_ledger: (staff.permissions as any).can_access_ledger ?? false,
        can_access_payments: (staff.permissions as any).can_access_payments ?? false,
        can_access_analytics: staff.permissions.can_access_analytics,
        can_change_settings: staff.permissions.can_change_settings,
      });
    } else {
      // Default permissions based on role
      const defaults: Permissions = {
        can_view_members: true,
        can_manage_members: staff?.role === "manager",
        can_access_ledger: staff?.role === "accountant",
        can_access_payments: staff?.role === "accountant" || staff?.role === "manager",
        can_access_analytics: staff?.role === "manager",
        can_change_settings: false,
      };
      setPermissions(defaults);
    }
  }, [staff]);

  const handleSave = async () => {
    if (!staff) return;

    setIsLoading(true);

    try {
      // Check if permissions record exists
      const { data: existing } = await supabase
        .from("staff_permissions")
        .select("id")
        .eq("staff_id", staff.id)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("staff_permissions")
          .update(permissions)
          .eq("staff_id", staff.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("staff_permissions")
          .insert({
            staff_id: staff.id,
            ...permissions,
          });

        if (error) throw error;
      }

      await logAdminActivity({
        category: "staff",
        type: "staff_updated",
        description: `Updated permissions for "${staff.full_name}"`,
        entityType: "staff_permissions",
        entityId: staff.id,
        entityName: staff.full_name,
        oldValue: staff.permissions,
        newValue: permissions,
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
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Staff Permissions</DialogTitle>
          <DialogDescription>
            Configure what {staff?.full_name} can access and manage
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p><strong>Name:</strong> {staff?.full_name}</p>
              <p><strong>Role:</strong> {staff?.role}</p>
            </div>
          </div>

          <div className="space-y-4">
            {(Object.keys(PERMISSION_LABELS) as Array<keyof Permissions>).map((key) => {
              const Icon = PERMISSION_LABELS[key].icon;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <Label className="text-sm font-medium block">
                        {PERMISSION_LABELS[key].label}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {PERMISSION_LABELS[key].description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={permissions[key]}
                    onCheckedChange={() => togglePermission(key)}
                    className="flex-shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
