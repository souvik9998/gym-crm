import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { InformationCircleIcon, ArrowsRightLeftIcon, DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  KeyIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
} from "@heroicons/react/24/outline";
import { toast } from "@/components/ui/sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { Staff } from "@/pages/admin/StaffManagement";
import { StaffPasswordDialog } from "./StaffPasswordDialog";
import { StaffPermissionsDialog } from "./StaffPermissionsDialog";
import { StaffBranchSelector } from "./StaffBranchSelector";
import { StaffBranchAssignmentDialog } from "./StaffBranchAssignmentDialog";
import { StaffCredentialsSection } from "./StaffCredentialsSection";
import { StaffInlinePermissions, InlinePermissions, getDefaultPermissions } from "./StaffInlinePermissions";
import { StaffWhatsAppButton, sendStaffCredentialsWhatsApp } from "./StaffWhatsAppButton";
import { StaffRoleConversionDialog } from "./StaffRoleConversionDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDownIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { StaffCardSkeleton } from "./StaffCardSkeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChangePhoneDialog } from "./ChangePhoneDialog";
import { DetailItem } from "./StaffDetailItem";
import { nameSchema, phoneSchema, getPhotoIdSchema, formatPhotoIdInput, getPhotoIdPlaceholder } from "@/lib/validation";
import { extractEdgeFunctionError } from "@/lib/edgeFunctionErrors";
import { validateStaffPassword } from "@/lib/staffPassword";

interface StaffOtherTabProps {
  staff: Staff[];
  branches: any[];
  currentBranch: any;
  onRefresh: () => void;
  isLoading: boolean;
  onConversionSuccess?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  reception: "Reception",
  accountant: "Accountant",
};


export const StaffOtherTab = ({
  staff,
  branches,
  currentBranch,
  onRefresh,
  isLoading,
  onConversionSuccess,
}: StaffOtherTabProps) => {
  const queryClient = useQueryClient();
  const isCompact = useIsTabletOrBelow();

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff-page-data"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["trainer-filter-list"], refetchType: "all" }),
    ]);
    onRefresh();
  };

  const [newStaff, setNewStaff] = useState({
    full_name: "",
    phone: "",
    role: "reception" as "manager" | "reception" | "accountant",
    id_type: "aadhaar",
    id_number: "",
    monthly_salary: "",
    selected_branches: currentBranch?.id ? [currentBranch.id] : [] as string[],
    enableLogin: false,
    password: "",
    permissions: getDefaultPermissions("reception"),
    sendWhatsApp: true,
  });
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: "default" | "destructive";
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; staff: Staff | null }>({
    open: false,
    staff: null,
  });
  const [viewPasswordDialog, setViewPasswordDialog] = useState<{ open: boolean; staff: Staff | null; password: string | null }>({
    open: false,
    staff: null,
    password: null,
  });
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; staff: Staff | null }>({
    open: false,
    staff: null,
  });
  const [branchAssignmentDialog, setBranchAssignmentDialog] = useState<{ open: boolean; staff: Staff | null }>({
    open: false,
    staff: null,
  });
  const [existingStaffDialog, setExistingStaffDialog] = useState<{
    open: boolean;
    existingStaff: Staff | null;
  }>({ open: false, existingStaff: null });
  const addingRef = { current: false };
  const [conversionDialog, setConversionDialog] = useState<{ open: boolean; staff: Staff | null }>({ open: false, staff: null });
  const [changePhoneDialog, setChangePhoneDialog] = useState<{ open: boolean; staff: Staff | null }>({ open: false, staff: null });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (currentBranch?.id && !newStaff.selected_branches.includes(currentBranch.id)) {
      setNewStaff((prev) => ({
        ...prev,
        selected_branches: prev.selected_branches.length === 0
          ? [currentBranch.id]
          : prev.selected_branches,
      }));
    }
  }, [currentBranch?.id]);

  const handleRoleChange = (role: "manager" | "reception" | "accountant") => {
    setNewStaff({
      ...newStaff,
      role,
      permissions: getDefaultPermissions(role),
    });
  };

  const handleAddStaff = async () => {
    const nameResult = nameSchema.safeParse(newStaff.full_name);
    if (!nameResult.success) {
      toast.error(nameResult.error.errors[0]?.message || "Invalid name");
      return;
    }
    const phoneResult = phoneSchema.safeParse(newStaff.phone);
    if (!phoneResult.success) {
      toast.error(phoneResult.error.errors[0]?.message || "Invalid phone number");
      return;
    }
    const cleanPhone = phoneResult.data;

    if (newStaff.id_number?.trim()) {
      const idResult = getPhotoIdSchema(newStaff.id_type).safeParse(newStaff.id_number);
      if (!idResult.success) {
        toast.error(idResult.error.errors[0]?.message || "Invalid ID number");
        return;
      }
    }

    if (newStaff.monthly_salary && Number(newStaff.monthly_salary) < 0) {
      toast.error("Monthly salary cannot be negative");
      return;
    }

    if (newStaff.enableLogin) {
      const pwdResult = validateStaffPassword(newStaff.password, {
        fullName: newStaff.full_name,
        phone: cleanPhone,
      });
      if (pwdResult.valid === false) {
        toast.error(pwdResult.error);
        return;
      }
    }

    if (addingRef.current) return;
    addingRef.current = true;
    setIsAddingStaff(true);

    const loadingToastId = toast.loading("Adding staff member...", {
      description: "Please wait while we set things up.",
    });

    try {
      const branchesToAssign = newStaff.selected_branches.length > 0 
        ? newStaff.selected_branches 
        : currentBranch?.id ? [currentBranch.id] : [];

      // Check if staff with this phone already exists globally
      toast.loading("Checking for existing staff...", { id: loadingToastId });
      const { data: existingStaffData } = await supabase
        .from("staff")
        .select("*, staff_permissions(*), staff_branch_assignments(*, branches(name))")
        .eq("phone", cleanPhone)
        .maybeSingle();

      if (existingStaffData) {
        const existingMapped: Staff = {
          ...existingStaffData,
          permissions: existingStaffData.staff_permissions?.[0] || undefined,
          branch_assignments: (existingStaffData.staff_branch_assignments || []).map((a: any) => ({
            ...a,
            branch_name: a.branches?.name,
          })),
        } as Staff;

        setExistingStaffDialog({ open: true, existingStaff: existingMapped });
        toast.dismiss(loadingToastId);
        return;
      }

      // Check for duplicate phone within selected branches (legacy safety)
      if (branchesToAssign.length > 0) {
        const { data: existingAssignments } = await supabase
          .from("staff_branch_assignments")
          .select("staff_id, branch_id, staff!inner(phone)")
          .in("branch_id", branchesToAssign);
        
        const existingInBranch = existingAssignments?.find(
          (a: any) => a.staff?.phone === cleanPhone
        );
        
        if (existingInBranch) {
          const branchName = branches.find(b => b.id === existingInBranch.branch_id)?.name || "selected branch";
          toast.error(`A staff member with this phone already exists in ${branchName}`, { id: loadingToastId });
          return;
        }
      }

      // Insert staff record (without password - will be set via edge function)
      toast.loading("Creating staff record...", { id: loadingToastId });
      const { data: staffData, error: staffError } = await supabase
        .from("staff")
        .insert({
          full_name: newStaff.full_name,
          phone: cleanPhone,
          role: newStaff.role,
          id_type: newStaff.id_type || null,
          id_number: newStaff.id_number || null,
          salary_type: "monthly",
          monthly_salary: Number(newStaff.monthly_salary) || 0,
        })
        .select()
        .single();

      if (staffError) {
        toast.error("Error adding staff", { id: loadingToastId, description: staffError.message });
        return;
      }

      // Set password via edge function if login is enabled
      if (newStaff.enableLogin && newStaff.password) {
        toast.loading("Setting up login access...", { id: loadingToastId });
        const { error: passwordError } = await supabase.functions.invoke("staff-auth?action=set-password", {
          body: {
            staffId: staffData.id,
            password: newStaff.password,
            sendWhatsApp: newStaff.sendWhatsApp,
          },
        });
        if (passwordError) {
          const serverMessage = await extractEdgeFunctionError(passwordError, "Password setup failed");
          console.error("Error setting password:", passwordError);
          toast.warning("Staff created but password setup failed", {
            description: serverMessage,
          });
        }
      }

      // Add branch assignments (reuse branchesToAssign from validation)
      toast.loading("Assigning branches & permissions...", { id: loadingToastId });
      const branchNames: string[] = [];
      if (branchesToAssign.length > 0) {
        const assignments = branchesToAssign.map((branchId, index) => ({
          staff_id: staffData.id,
          branch_id: branchId,
          is_primary: index === 0,
        }));

        await supabase.from("staff_branch_assignments").insert(assignments);
        
        // Get branch names for WhatsApp
        branchNames.push(...branchesToAssign.map(bid => branches.find(b => b.id === bid)?.name).filter(Boolean));
      }

      // Insert permissions
      await supabase.from("staff_permissions").insert({
        staff_id: staffData.id,
        ...newStaff.permissions,
      });

      await logAdminActivity({
        category: "staff",
        type: "staff_added",
        description: `Added ${ROLE_LABELS[newStaff.role]} "${newStaff.full_name}"${newStaff.enableLogin ? " with login access" : ""}`,
        entityType: "staff",
        entityName: newStaff.full_name,
        newValue: { ...newStaff, password: undefined },
        branchId: currentBranch?.id,
      });

      // Send WhatsApp credentials if enabled and login is enabled
      let whatsAppSent = false;
      if (newStaff.enableLogin && newStaff.sendWhatsApp && newStaff.password && cleanPhone) {
        toast.loading("Sending login credentials via WhatsApp...", { id: loadingToastId });
        whatsAppSent = await sendStaffCredentialsWhatsApp(
          { full_name: newStaff.full_name, phone: cleanPhone, role: newStaff.role },
          newStaff.password,
          currentBranch?.id,
          currentBranch?.name,
          branchNames
        );
      }

      toast.success("Staff member added successfully", {
        id: loadingToastId,
        description: newStaff.enableLogin && newStaff.sendWhatsApp
          ? whatsAppSent
            ? "Login credentials sent via WhatsApp"
            : "Staff added but WhatsApp delivery failed"
          : undefined,
      });
      
      setNewStaff({
        full_name: "",
        phone: "",
        role: "reception",
        id_type: "aadhaar",
        id_number: "",
        monthly_salary: "",
        selected_branches: currentBranch?.id ? [currentBranch.id] : [],
        enableLogin: false,
        password: "",
        permissions: getDefaultPermissions("reception"),
        sendWhatsApp: true,
      });
      await refreshAll();
    } catch (err: any) {
      toast.error("Failed to add staff member", {
        id: loadingToastId,
        description: err?.message || "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsAddingStaff(false);
      addingRef.current = false;
    }
  };

  const handleEdit = (member: Staff) => {
    setEditingId(member.id);
    setEditData({
      full_name: member.full_name,
      role: member.role,
      id_type: member.id_type || "aadhaar",
      id_number: member.id_number || "",
      monthly_salary: String(member.monthly_salary || 0),
    });
  };

  const handleSave = async (id: string) => {
    if (!editData.full_name) {
      toast.error("Name is required");
      return;
    }

    const member = staff.find((s) => s.id === id);

    const { error } = await supabase
      .from("staff")
      .update({
        full_name: editData.full_name,
        role: editData.role,
        id_type: editData.id_type || null,
        id_number: editData.id_number || null,
        monthly_salary: Number(editData.monthly_salary) || 0,
      })
      .eq("id", id);

    if (error) {
      toast.error("Error updating staff", { description: error.message });
      return;
    }

    // Filter out metadata fields and only include fields that are being updated
    const fieldsToLog = ['full_name', 'role', 'id_type', 'id_number', 'monthly_salary'];
    const oldValueFiltered = member
      ? Object.fromEntries(
          fieldsToLog
            .filter(key => key in member)
            .map(key => [key, (member as any)[key]])
        )
      : null;

    const newValueFiltered = Object.fromEntries(
      fieldsToLog.map(key => {
        if (key === 'monthly_salary') {
          return [key, Number(editData.monthly_salary) || 0];
        }
        return [key, (editData as any)[key] || null];
      })
    );

    await logAdminActivity({
      category: "staff",
      type: "staff_updated",
      description: `Updated ${ROLE_LABELS[editData.role]} "${editData.full_name}"`,
      entityType: "staff",
      entityId: id,
      entityName: editData.full_name,
      oldValue: oldValueFiltered,
      newValue: newValueFiltered,
      branchId: currentBranch?.id,
    });

    toast.success("Staff updated");
    setEditingId(null);
    await refreshAll();
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    const member = staff.find((s) => s.id === id);
    await supabase.from("staff").update({ is_active: isActive }).eq("id", id);
    
    await logAdminActivity({
      category: "staff",
      type: "staff_toggled",
      description: `${isActive ? "Activated" : "Deactivated"} ${ROLE_LABELS[member?.role || "reception"]} "${member?.full_name}"`,
      entityType: "staff",
      entityId: id,
      entityName: member?.full_name,
      oldValue: { is_active: !isActive },
      newValue: { is_active: isActive },
      branchId: currentBranch?.id,
    });

    await refreshAll();
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Staff",
      description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      variant: "destructive",
      onConfirm: async () => {
        await supabase.from("staff").delete().eq("id", id);

        await logAdminActivity({
          category: "staff",
          type: "staff_deleted",
          description: `Deleted staff "${name}"`,
          entityType: "staff",
          entityId: id,
          entityName: name,
          branchId: currentBranch?.id,
        });

        toast.success("Staff member deleted");
        await refreshAll();
      },
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
      case "manager": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "accountant": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "reception": return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      default: return "bg-muted text-foreground border-border";
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Staff Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-2">
          <CardTitle className="text-base lg:text-xl">Add New Staff</CardTitle>
          <CardDescription className="text-xs lg:text-sm">Add admin, manager, reception, or accountant staff</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-2 lg:pt-0">
          <div className="grid gap-3 lg:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">Full Name *</Label>
              <Input
                value={newStaff.full_name}
                onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value.replace(/[^a-zA-Z\s.']/g, "").slice(0, 100) })}
                placeholder="Enter full name"
                maxLength={100}
                className="h-9 lg:h-12 text-sm"
              />
            </div>
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">Phone Number *</Label>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={newStaff.phone}
                onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                placeholder="10-digit phone number"
                className="h-9 lg:h-12 text-sm"
              />
            </div>
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">Role *</Label>
              <Select
                value={newStaff.role}
                onValueChange={(value: any) => handleRoleChange(value)}
              >
                <SelectTrigger className="h-9 lg:h-12 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="reception">Reception</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">ID Type</Label>
              <Select
                value={newStaff.id_type}
                onValueChange={(value) => setNewStaff({ ...newStaff, id_type: value })}
              >
                <SelectTrigger className="h-9 lg:h-12 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aadhaar">Aadhaar</SelectItem>
                  <SelectItem value="pan">PAN</SelectItem>
                  <SelectItem value="voter">Voter ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">ID Number</Label>
              <Input
                value={newStaff.id_number}
                onChange={(e) => setNewStaff({ ...newStaff, id_number: formatPhotoIdInput(e.target.value, newStaff.id_type) })}
                placeholder={getPhotoIdPlaceholder(newStaff.id_type)}
                className="h-9 lg:h-12 text-sm"
              />
            </div>
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">Monthly Salary (₹)</Label>
              <Input
                type="number"
                value={newStaff.monthly_salary}
                onChange={(e) => setNewStaff({ ...newStaff, monthly_salary: e.target.value })}
                placeholder="Monthly salary"
                className="h-9 lg:h-12 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1 lg:space-y-2">
            <Label className="text-xs lg:text-sm">Assigned Branches</Label>
            <StaffBranchSelector
              branches={branches}
              selectedBranches={newStaff.selected_branches}
              onChange={(selected) => setNewStaff({ ...newStaff, selected_branches: selected })}
            />
          </div>

          {/* Login Credentials Section */}
          <StaffCredentialsSection
            enableLogin={newStaff.enableLogin}
            onEnableLoginChange={(enabled) => setNewStaff({ ...newStaff, enableLogin: enabled })}
            password={newStaff.password}
            onPasswordChange={(password) => setNewStaff({ ...newStaff, password })}
          />

          {/* Permissions Section - Only show when login is enabled */}
          {newStaff.enableLogin && (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4" />
                  Access Permissions
                </Label>
                <StaffInlinePermissions
                  permissions={newStaff.permissions}
                  onChange={(permissions) => setNewStaff({ ...newStaff, permissions })}
                />
              </div>
              
              {/* WhatsApp Checkbox */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendWhatsAppStaff"
                  checked={newStaff.sendWhatsApp}
                  onCheckedChange={(checked) => setNewStaff({ ...newStaff, sendWhatsApp: checked === true })}
                />
                <Label htmlFor="sendWhatsAppStaff" className="text-sm cursor-pointer">
                  Send login credentials via WhatsApp after adding
                </Label>
              </div>
            </>
          )}

          <Button onClick={handleAddStaff} disabled={isAddingStaff} className="gap-2">
            <PlusIcon className="w-4 h-4" />
            {isAddingStaff ? "Adding Staff..." : "Add Staff"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Staff */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-2">
          <CardTitle className="text-base lg:text-xl">Existing Staff</CardTitle>
          <CardDescription className="text-xs lg:text-sm">
            {staff.length} staff member{staff.length !== 1 ? "s" : ""} registered
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-2 lg:pt-0">
          {isLoading ? (
            <StaffCardSkeleton count={3} />
          ) : staff.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No staff members added yet</p>
          ) : (
            <div className="space-y-3">
              {staff.map((member, idx) => {
                const initials = member.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                const isExpanded = expandedId === member.id;
                const isEditing = editingId === member.id;

                return (
                <div
                  key={member.id}
                  className="group rounded-xl border border-border/60 bg-card hover:border-border hover:shadow-sm transition-all duration-200 ease-out animate-fade-in overflow-hidden"
                  style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "backwards" }}
                >
                  {isEditing ? (
                    <div className="p-4 lg:p-5">
                    <div className="flex-1 space-y-3 mr-0 lg:mr-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Name *</Label>
                          <Input
                            value={editData.full_name}
                            onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Role</Label>
                          <Select
                            value={editData.role}
                            onValueChange={(value) => setEditData({ ...editData, role: value })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="reception">Reception</SelectItem>
                              <SelectItem value="accountant">Accountant</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">ID Type</Label>
                          <Select
                            value={editData.id_type}
                            onValueChange={(value) => setEditData({ ...editData, id_type: value })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="aadhaar">Aadhaar</SelectItem>
                              <SelectItem value="pan">PAN</SelectItem>
                              <SelectItem value="voter">Voter ID</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">ID Number</Label>
                          <Input
                            value={editData.id_number}
                            onChange={(e) => setEditData({ ...editData, id_number: e.target.value })}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label className="text-xs">Monthly Salary (₹)</Label>
                          <Input
                            type="number"
                            value={editData.monthly_salary}
                            onChange={(e) => setEditData({ ...editData, monthly_salary: e.target.value })}
                            className="h-9"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        To change mobile number, close this and use the phone icon.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSave(member.id)} className="gap-1">
                          <CheckIcon className="w-4 h-4" />
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="gap-1">
                          <XMarkIcon className="w-4 h-4" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                    </div>
                  ) : (
                    <Collapsible open={isExpanded} onOpenChange={(open) => setExpandedId(open ? member.id : null)}>
                      {/* Compact header — always visible */}
                      <div className="p-3 lg:p-4">
                        <div className="flex items-center gap-2 lg:gap-3 flex-wrap lg:flex-nowrap">
                          {/* Avatar with subtle gradient */}
                          <div className="flex-shrink-0 w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary font-semibold text-sm lg:text-base flex items-center justify-center ring-1 ring-primary/10 transition-transform duration-200 group-hover:scale-105">
                            {initials || "S"}
                          </div>

                          {/* Name + role + quick info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground text-sm lg:text-base truncate">
                                {member.full_name}
                              </h3>
                              <Badge className={`text-[10px] h-5 px-1.5 border ${getRoleBadgeColor(member.role)} hover:bg-opacity-100`}>
                                {ROLE_LABELS[member.role] || member.role}
                              </Badge>
                              {member.auth_user_id && (
                                <Badge className="text-[10px] h-5 px-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10">
                                  Login
                                </Badge>
                              )}
                              {!member.is_active && (
                                <Badge className="text-[10px] h-5 px-1.5 bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {member.phone || "No phone"}
                              {member.monthly_salary > 0 && ` · ₹${member.monthly_salary}/mo`}
                            </p>
                          </div>

                          {/* Inline action toolbar */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/10 hover:border-blue-500/50 hover:text-blue-600"
                              onClick={() => setBranchAssignmentDialog({ open: true, staff: member })}
                              title="Manage Branch Assignments"
                            >
                              <BuildingOfficeIcon className="w-4 h-4" />
                            </Button>
                            {member.auth_user_id ? (
                              <>
                                <StaffWhatsAppButton staff={member} />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 hover:border-amber-500/50 hover:text-amber-600"
                                  onClick={async () => {
                                    const { data: activities } = await supabase
                                      .from("admin_activity_logs")
                                      .select("metadata")
                                      .eq("entity_type", "staff")
                                      .eq("entity_id", member.id)
                                      .eq("activity_type", "staff_password_set")
                                      .order("created_at", { ascending: false })
                                      .limit(1)
                                      .maybeSingle();
                                    if (activities?.metadata && (activities.metadata as any).password) {
                                      setViewPasswordDialog({ open: true, staff: member, password: (activities.metadata as any).password });
                                    } else {
                                      setPasswordDialog({ open: true, staff: member });
                                    }
                                  }}
                                  title="View/Update Password"
                                >
                                  <KeyIcon className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-violet-600 dark:text-violet-400 border-violet-500/30 hover:bg-violet-500/10 hover:border-violet-500/50 hover:text-violet-600"
                                  onClick={() => setPermissionsDialog({ open: true, staff: member })}
                                  title="Manage Permissions"
                                >
                                  <ShieldCheckIcon className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 px-2.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-600 transition-all duration-200 hover:scale-105"
                                onClick={() => setPermissionsDialog({ open: true, staff: member })}
                                title="Grant login access, set password & permissions"
                              >
                                <LockClosedIcon className="w-4 h-4" />
                                <span className="text-xs font-medium">Grant Access</span>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10 hover:border-cyan-500/50 hover:text-cyan-600"
                              onClick={() => handleEdit(member)}
                              title="Edit details"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-teal-600 dark:text-teal-400 border-teal-500/30 hover:bg-teal-500/10 hover:border-teal-500/50 hover:text-teal-600"
                              onClick={() => setChangePhoneDialog({ open: true, staff: member })}
                              title="Change mobile number"
                            >
                              <DevicePhoneMobileIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30 hover:bg-fuchsia-500/10 hover:border-fuchsia-500/50 hover:text-fuchsia-600"
                              onClick={() => setConversionDialog({ open: true, staff: member })}
                              title="Convert to Trainer"
                            >
                              <ArrowsRightLeftIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive transition-all duration-200 hover:scale-105"
                              onClick={() => handleDelete(member.id, member.full_name)}
                              title="Delete staff"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                            <div className="h-6 w-px bg-border/60 mx-1" />
                            <Switch
                              checked={member.is_active}
                              onCheckedChange={(checked) => handleToggle(member.id, checked)}
                              className="data-[state=checked]:bg-emerald-500"
                            />
                            <CollapsibleTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 hover:bg-muted"
                                aria-label={isExpanded ? "Collapse" : "Expand"}
                              >
                                <ChevronDownIcon
                                  className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                                />
                              </Button>
                            </CollapsibleTrigger>
                          </div>
                        </div>
                      </div>

                      {/* Expanded details — populated info */}
                      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                        <div className="px-3 lg:px-4 pb-4 pt-3 border-t border-border/40 bg-muted/20">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            <DetailItem label="Phone" value={member.phone || "—"} accent="teal" />
                            <DetailItem label="Role" value={ROLE_LABELS[member.role] || member.role} accent="violet" />
                            <DetailItem
                              label="Monthly Salary"
                              value={member.monthly_salary > 0 ? `₹${member.monthly_salary}` : "—"}
                              accent="emerald"
                            />
                            <DetailItem label="ID Type" value={member.id_type ? member.id_type.toUpperCase() : "—"} accent="amber" />
                            <DetailItem label="ID Number" value={member.id_number || "—"} accent="amber" />
                            <DetailItem
                              label="Branches"
                              value={
                                member.branch_assignments && member.branch_assignments.length > 0
                                  ? member.branch_assignments.map((a) => a.branch_name).join(", ")
                                  : "Unassigned"
                              }
                              accent="blue"
                            />
                            <DetailItem
                              label="Login Access"
                              value={member.auth_user_id ? "Enabled" : "Disabled"}
                              accent={member.auth_user_id ? "emerald" : "rose"}
                            />
                            <DetailItem
                              label="Last Login"
                              value={
                                member.last_login_at
                                  ? new Date(member.last_login_at).toLocaleString("en-IN", {
                                      day: "2-digit",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "Never"
                              }
                              accent="blue"
                            />
                            <DetailItem
                              label="Joined"
                              value={new Date(member.created_at).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                              accent="blue"
                            />
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />

      <StaffPasswordDialog
        open={passwordDialog.open}
        onOpenChange={(open) => setPasswordDialog({ ...passwordDialog, open })}
        staff={passwordDialog.staff}
        onSuccess={refreshAll}
      />

      <ChangePhoneDialog
        open={changePhoneDialog.open}
        onOpenChange={(open) => setChangePhoneDialog({ ...changePhoneDialog, open })}
        staff={changePhoneDialog.staff}
        branchId={currentBranch?.id}
        branchName={currentBranch?.name}
        onSuccess={refreshAll}
      />
      
      {/* View Password Dialog */}
      <Dialog open={viewPasswordDialog.open} onOpenChange={(open) => setViewPasswordDialog({ ...viewPasswordDialog, open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Staff Password</DialogTitle>
            <DialogDescription>
              Last set password for {viewPasswordDialog.staff?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <Label className="text-sm text-muted-foreground mb-2 block">Password</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={viewPasswordDialog.password || "Not available"}
                  readOnly
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (viewPasswordDialog.password) {
                      navigator.clipboard.writeText(viewPasswordDialog.password);
                      toast.success("Password copied to clipboard");
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This is the last password that was set. Click "Update Password" to set a new one.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setViewPasswordDialog({ open: false, staff: null, password: null });
                setPasswordDialog({ open: true, staff: viewPasswordDialog.staff });
              }}
            >
              Update Password
            </Button>
            <Button onClick={() => setViewPasswordDialog({ open: false, staff: null, password: null })}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StaffPermissionsDialog
        open={permissionsDialog.open}
        onOpenChange={(open) => setPermissionsDialog({ ...permissionsDialog, open })}
        staff={permissionsDialog.staff}
        onSuccess={refreshAll}
      />

      <StaffBranchAssignmentDialog
        open={branchAssignmentDialog.open}
        onOpenChange={(open) => setBranchAssignmentDialog({ ...branchAssignmentDialog, open })}
        staff={branchAssignmentDialog.staff}
        branches={branches}
        onSuccess={refreshAll}
      />

      {/* Existing Staff Found Dialog */}
      <Dialog
        open={existingStaffDialog.open}
        onOpenChange={(open) => {
          setExistingStaffDialog({ ...existingStaffDialog, open });
          if (!open) {
            setIsAddingStaff(false);
            addingRef.current = false;
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BuildingOfficeIcon className="w-5 h-5" />
              Staff Already Registered
            </DialogTitle>
            <DialogDescription>
              A staff member with this phone number already exists. You cannot register them again — use the branch assignment feature to add them to another branch.
            </DialogDescription>
          </DialogHeader>
          {existingStaffDialog.existingStaff && (
            <div className="space-y-3 py-2">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <p className="font-medium">{existingStaffDialog.existingStaff.full_name}</p>
                <p className="text-sm text-muted-foreground">Phone: {existingStaffDialog.existingStaff.phone}</p>
                <p className="text-sm text-muted-foreground">Role: <Badge variant="secondary" className="ml-1">{existingStaffDialog.existingStaff.role}</Badge></p>
                {existingStaffDialog.existingStaff.branch_assignments && existingStaffDialog.existingStaff.branch_assignments.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    Current branches: {existingStaffDialog.existingStaff.branch_assignments.map(a => a.branch_name).filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setExistingStaffDialog({ open: false, existingStaff: null });
              setIsAddingStaff(false);
              addingRef.current = false;
            }}>
              Cancel
            </Button>
            <Button onClick={() => {
              const staff = existingStaffDialog.existingStaff;
              setExistingStaffDialog({ open: false, existingStaff: null });
              setIsAddingStaff(false);
              addingRef.current = false;
              if (staff) {
                setBranchAssignmentDialog({ open: true, staff });
              }
            }}>
              <BuildingOfficeIcon className="w-4 h-4 mr-2" />
              Manage Branches
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StaffRoleConversionDialog
        open={conversionDialog.open}
        onOpenChange={(open) => setConversionDialog({ ...conversionDialog, open })}
        staff={conversionDialog.staff}
        direction="to_trainer"
        branchId={currentBranch?.id}
        branchName={currentBranch?.name}
        onSuccess={() => { onConversionSuccess ? onConversionSuccess() : refreshAll(); }}
      />
    </div>
  );
};
