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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { useBranch } from "@/contexts/BranchContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  BookOpenIcon,
  CurrencyRupeeIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ClockIcon,
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
  KeyIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import {
  generateStaffPassword,
  STAFF_PASSWORD_RULE_TEXT,
  validateStaffPassword,
} from "@/lib/staffPassword";
import { extractEdgeFunctionError } from "@/lib/edgeFunctionErrors";

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
  can_view_settings: boolean;
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
  { key: "can_view_settings", label: "View Settings", description: "Read-only access to settings", icon: EyeIcon },
  { key: "can_change_settings", label: "Edit Settings", description: "Can add/modify everything in settings", icon: Cog6ToothIcon },
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
    can_view_settings: false,
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
  const [grantMode, setGrantMode] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendWhatsApp, setSendWhatsApp] = useState(true);

  const hasLoginAccess = !!(staff as any)?.auth_user_id;
  const showGrantGate = !!staff && !hasLoginAccess && !grantMode;

  useEffect(() => {
    if (open) {
      setGrantMode(false);
      setPassword("");
      setShowPassword(false);
      setSendWhatsApp(true);
    }
  }, [open, staff?.id]);

  useEffect(() => {
    if (staff?.permissions) {
      const p = staff.permissions as any;
      setPermissions({
        can_view_members: p.can_view_members ?? false,
        can_manage_members: p.can_manage_members ?? false,
        can_access_ledger: p.can_access_ledger ?? false,
        can_access_payments: p.can_access_payments ?? false,
        can_access_analytics: p.can_access_analytics ?? false,
        can_view_settings: p.can_view_settings ?? (p.can_change_settings ?? false),
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
        can_view_settings: false,
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

  const handleGeneratePassword = () => {
    setPassword(generateStaffPassword());
    setShowPassword(true);
  };

  const handleSave = async () => {
    if (!staff) return;

    if (grantMode && !hasLoginAccess) {
      if (!password) {
        toast.error("Please enter or generate a password");
        return;
      }
      const pwdResult = validateStaffPassword(password, {
        fullName: staff.full_name,
        phone: staff.phone,
      });
      if (pwdResult.valid === false) {
        toast.error(pwdResult.error);
        return;
      }
      if (sendWhatsApp && !staff.phone) {
        toast.error("Cannot send via WhatsApp — staff has no phone number");
        return;
      }
    }

    setIsLoading(true);

    try {
      // Step 1: Provision login if granting access
      if (grantMode && !hasLoginAccess) {
        const { data: authData, error: authError } = await supabase.functions.invoke(
          "staff-auth?action=set-password",
          {
            body: {
              staffId: staff.id,
              password,
              sendWhatsApp: sendWhatsApp && !!staff.phone,
            },
          }
        );
        if (authError) {
          const serverMessage = await extractEdgeFunctionError(authError, "Failed to grant login access");
          throw new Error(serverMessage);
        }
        const authResp = typeof authData === "string" ? JSON.parse(authData) : authData;
        if (!authResp?.success) {
          throw new Error(authResp?.error || "Failed to grant login access");
        }

        await logAdminActivity({
          category: "staff",
          type: "staff_password_set",
          description: `Granted login access to "${staff.full_name}"`,
          entityType: "staff",
          entityId: staff.id,
          entityName: staff.full_name,
          metadata: {
            phone: staff.phone,
            role: staff.role,
            credentials_sent_via_whatsapp: sendWhatsApp && !!staff.phone,
          },
          branchId: currentBranch?.id,
        });
      }

      // Step 2: Save permissions
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

      if (grantMode && !hasLoginAccess) {
        toast.success("Login access granted", {
          description: sendWhatsApp && staff.phone
            ? "Credentials sent via WhatsApp and permissions saved"
            : "Permissions saved — share the password with the staff member",
        });
      } else {
        toast.success("Permissions updated successfully");
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error("Failed to save", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePermission = (key: keyof Permissions) => {
    if (key === "member_access_type") return;
    setPermissions((prev) => {
      const next = { ...prev, [key]: !prev[key] } as Permissions;
      // Mutual dependency: enabling Edit auto-enables View; disabling View auto-disables Edit
      if (key === "can_change_settings" && next.can_change_settings) {
        next.can_view_settings = true;
      }
      if (key === "can_view_settings" && !next.can_view_settings) {
        next.can_change_settings = false;
      }
      return next;
    });
  };

  // GATE: Trainer/staff without login access — show "Grant Access" CTA first
  if (showGrantGate) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base flex items-center gap-2">
              <LockClosedIcon className="w-4 h-4 text-muted-foreground" />
              Login Access Required
            </DialogTitle>
            <DialogDescription className="text-xs">
              {staff?.full_name} doesn't have login access yet. Grant access to configure permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
              <p><strong>Name:</strong> {staff?.full_name}</p>
              <p><strong>Phone:</strong> {staff?.phone || "—"}</p>
              <p><strong>Role:</strong> {staff?.role}</p>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-400">
              Without login access, permission toggles have no effect. Grant access to set a password,
              configure permissions, and optionally notify the staff member via WhatsApp.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => setGrantMode(true)} className="gap-2">
              <KeyIcon className="w-4 h-4" />
              Grant Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
          <DialogTitle className="text-base">
            {grantMode && !hasLoginAccess ? "Grant Login Access & Permissions" : "Staff Permissions"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {grantMode && !hasLoginAccess
              ? `Set credentials and configure what ${staff?.full_name} can access`
              : `Configure what ${staff?.full_name} can access and manage`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4 py-2 flex-1 min-h-0 overflow-y-auto">
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <p><strong>Name:</strong> {staff?.full_name}</p>
            <p><strong>Role:</strong> {staff?.role}</p>
          </div>

          {/* Login Provisioning (only when granting fresh access) */}
          {grantMode && !hasLoginAccess && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Login Credentials</p>
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-dashed">
                <div className="space-y-2">
                  <Label htmlFor="grant-password" className="text-sm">Password *</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="grant-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter or generate password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleGeneratePassword}>
                      Generate
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{STAFF_PASSWORD_RULE_TEXT} Staff log in with their phone number.</p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="grant-send-wa"
                    checked={sendWhatsApp}
                    onCheckedChange={(c) => setSendWhatsApp(c === true)}
                    disabled={!staff?.phone}
                  />
                  <Label htmlFor="grant-send-wa" className="text-sm cursor-pointer flex items-center gap-1.5">
                    <ChatBubbleLeftRightIcon className="w-4 h-4 text-emerald-600" />
                    Notify via WhatsApp
                  </Label>
                </div>
                {!staff?.phone && (
                  <p className="text-[11px] text-destructive">No phone number on file — WhatsApp delivery unavailable.</p>
                )}
              </div>

              <Separator />
            </>
          )}

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

        <DialogFooter className="px-4 py-3 border-t bg-background flex-shrink-0">
          {grantMode && !hasLoginAccess ? (
            <Button variant="outline" onClick={() => setGrantMode(false)}>Back</Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          )}
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading
              ? "Saving..."
              : grantMode && !hasLoginAccess
                ? "Grant Access & Save"
                : "Save Permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
