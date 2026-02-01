import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StaffOtherTabProps {
  staff: Staff[];
  branches: any[];
  currentBranch: any;
  onRefresh: () => void;
  isLoading: boolean;
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
}: StaffOtherTabProps) => {
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
    sendWhatsApp: true, // Default to send WhatsApp
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

  // Update selected branches when currentBranch changes
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
    if (!newStaff.full_name) {
      toast.error("Please enter staff name");
      return;
    }
    if (!newStaff.phone) {
      toast.error("Please enter phone number");
      return;
    }
    if (newStaff.enableLogin && !newStaff.password) {
      toast.error("Please enter a password or disable login access");
      return;
    }

    setIsAddingStaff(true);
    const cleanPhone = newStaff.phone.replace(/\D/g, "").replace(/^0/, "");
    
    try {
      // Check for duplicate phone within selected branches
      const branchesToAssign = newStaff.selected_branches.length > 0 
        ? newStaff.selected_branches 
        : currentBranch?.id ? [currentBranch.id] : [];
      
      if (branchesToAssign.length > 0) {
        // Check if phone already exists in any of the selected branches
        const { data: existingAssignments } = await supabase
          .from("staff_branch_assignments")
          .select("staff_id, branch_id, staff!inner(phone)")
          .in("branch_id", branchesToAssign);
        
        const existingInBranch = existingAssignments?.find(
          (a: any) => a.staff?.phone === cleanPhone
        );
        
        if (existingInBranch) {
          const branchName = branches.find(b => b.id === existingInBranch.branch_id)?.name || "selected branch";
          toast.error(`A staff member with this phone already exists in ${branchName}`);
          return;
        }
      }

      // Insert staff record (without password - will be set via edge function)
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
        toast.error("Error adding staff", { description: staffError.message });
        return;
      }

      // Set password via edge function if login is enabled
      if (newStaff.enableLogin && newStaff.password) {
        const { error: passwordError } = await supabase.functions.invoke("staff-auth?action=set-password", {
          body: {
            staffId: staffData.id,
            password: newStaff.password,
            sendWhatsApp: newStaff.sendWhatsApp,
          },
        });
        if (passwordError) {
          console.error("Error setting password:", passwordError);
          toast.warning("Staff created but password setup failed", {
            description: "Please set the password manually from the staff list.",
          });
        }
      }

      // Add branch assignments (reuse branchesToAssign from validation)
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
        whatsAppSent = await sendStaffCredentialsWhatsApp(
          { full_name: newStaff.full_name, phone: cleanPhone, role: newStaff.role },
          newStaff.password,
          currentBranch?.id,
          currentBranch?.name,
          branchNames
        );
      }

      toast.success("Staff member added successfully", {
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
      onRefresh();
    } finally {
      setIsAddingStaff(false);
    }
  };

  const handleEdit = (member: Staff) => {
    setEditingId(member.id);
    setEditData({
      full_name: member.full_name,
      phone: member.phone,
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
    const cleanPhone = editData.phone.replace(/\D/g, "").replace(/^0/, "");

    // Check if phone is being changed and if new phone already exists
    if (cleanPhone !== member?.phone) {
      const { data: existingStaff } = await supabase
        .from("staff")
        .select("id")
        .eq("phone", cleanPhone)
        .neq("id", id)
        .single();

      if (existingStaff) {
        toast.error("Phone number already in use", {
          description: "Another staff member is already registered with this phone number.",
        });
        return;
      }
    }

    const { error } = await supabase
      .from("staff")
      .update({
        full_name: editData.full_name,
        phone: cleanPhone,
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
    const fieldsToLog = ['full_name', 'phone', 'role', 'id_type', 'id_number', 'monthly_salary'];
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
    onRefresh();
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

    onRefresh();
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
        onRefresh();
      },
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-red-100 text-red-800";
      case "manager": return "bg-blue-100 text-blue-800";
      case "accountant": return "bg-green-100 text-green-800";
      case "reception": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Staff Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Add New Staff</CardTitle>
          <CardDescription>Add admin, manager, reception, or accountant staff</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={newStaff.full_name}
                onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })}
                placeholder="Enter full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input
                value={newStaff.phone}
                onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                placeholder="10-digit phone number"
              />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select
                value={newStaff.role}
                onValueChange={(value: any) => handleRoleChange(value)}
              >
                <SelectTrigger>
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

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>ID Type</Label>
              <Select
                value={newStaff.id_type}
                onValueChange={(value) => setNewStaff({ ...newStaff, id_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aadhaar">Aadhaar</SelectItem>
                  <SelectItem value="pan">PAN</SelectItem>
                  <SelectItem value="voter">Voter ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ID Number</Label>
              <Input
                value={newStaff.id_number}
                onChange={(e) => setNewStaff({ ...newStaff, id_number: e.target.value })}
                placeholder="ID number"
              />
            </div>
            <div className="space-y-2">
              <Label>Monthly Salary (₹)</Label>
              <Input
                type="number"
                value={newStaff.monthly_salary}
                onChange={(e) => setNewStaff({ ...newStaff, monthly_salary: e.target.value })}
                placeholder="Monthly salary"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assigned Branches</Label>
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
        <CardHeader>
          <CardTitle>Existing Staff</CardTitle>
          <CardDescription>
            {staff.length} staff member{staff.length !== 1 ? "s" : ""} registered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : staff.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No staff members added yet</p>
          ) : (
            <div className="space-y-3">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg transition-colors duration-150 hover:bg-muted/70"
                >
                  {editingId === member.id ? (
                    <div className="flex-1 space-y-3 mr-4">
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
                          <Label className="text-xs">Phone</Label>
                          <Input
                            value={editData.phone}
                            onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
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
                          <Label className="text-xs">Monthly Salary (₹)</Label>
                          <Input
                            type="number"
                            value={editData.monthly_salary}
                            onChange={(e) => setEditData({ ...editData, monthly_salary: e.target.value })}
                            className="h-9"
                          />
                        </div>
                      </div>
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
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{member.full_name}</p>
                          <Badge className={`text-xs ${getRoleBadgeColor(member.role)}`}>
                            {ROLE_LABELS[member.role] || member.role}
                          </Badge>
                          {!member.is_active && (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                          {member.auth_user_id && (
                            <Badge variant="outline" className="text-xs text-green-600">Has Login</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                          {member.phone && <span>📱 {member.phone}</span>}
                          {member.monthly_salary > 0 && <span>💰 ₹{member.monthly_salary}/month</span>}
                          {member.branch_assignments && member.branch_assignments.length > 0 && (
                            <span>
                              📍 {member.branch_assignments.map((a) => a.branch_name).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StaffWhatsAppButton staff={member} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setBranchAssignmentDialog({ open: true, staff: member })}
                          title="Manage Branch Assignments"
                        >
                          <BuildingOfficeIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            // Try to fetch last password from activity log
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
                              setViewPasswordDialog({
                                open: true,
                                staff: member,
                                password: (activities.metadata as any).password,
                              });
                            } else {
                              setPasswordDialog({ open: true, staff: member });
                            }
                          }}
                          title={member.auth_user_id ? "View/Update Password" : "Set Password"}
                        >
                          <KeyIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPermissionsDialog({ open: true, staff: member })}
                          title="Manage Permissions"
                        >
                          <ShieldCheckIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(member)}
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        <Switch
                          checked={member.is_active}
                          onCheckedChange={(checked) => handleToggle(member.id, checked)}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(member.id, member.full_name)}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
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
        onSuccess={onRefresh}
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
        onSuccess={onRefresh}
      />

      <StaffBranchAssignmentDialog
        open={branchAssignmentDialog.open}
        onOpenChange={(open) => setBranchAssignmentDialog({ ...branchAssignmentDialog, open })}
        staff={branchAssignmentDialog.staff}
        branches={branches}
        onSuccess={onRefresh}
      />
    </div>
  );
};
