import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  KeyIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { toast } from "@/components/ui/sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { Staff, StaffPermissions } from "@/pages/admin/StaffManagement";
import { StaffPasswordDialog } from "./StaffPasswordDialog";
import { StaffPermissionsDialog } from "./StaffPermissionsDialog";
import { StaffBranchSelector } from "./StaffBranchSelector";
import { StaffCredentialsSection } from "./StaffCredentialsSection";
import { StaffInlinePermissions, InlinePermissions, getDefaultPermissions } from "./StaffInlinePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StaffTrainersTabProps {
  trainers: Staff[];
  branches: any[];
  currentBranch: any;
  onRefresh: () => void;
  isLoading: boolean;
}

// Hash password for storage
const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const encoder = new TextEncoder();
  const data = encoder.encode(password + saltHex);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
};

export const StaffTrainersTab = ({
  trainers,
  branches,
  currentBranch,
  onRefresh,
  isLoading,
}: StaffTrainersTabProps) => {
  const [newTrainer, setNewTrainer] = useState({
    full_name: "",
    phone: "",
    specialization: "",
    id_type: "aadhaar",
    id_number: "",
    salary_type: "monthly" as "monthly" | "session_based" | "percentage" | "both",
    monthly_salary: "",
    session_fee: "",
    percentage_fee: "",
    selected_branches: [] as string[],
    enableLogin: false,
    password: "",
    permissions: getDefaultPermissions("trainer"),
  });
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
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; staff: Staff | null }>({
    open: false,
    staff: null,
  });

  const handleAddTrainer = async () => {
    if (!newTrainer.full_name) {
      toast.error("Please enter trainer name");
      return;
    }
    if (!newTrainer.phone) {
      toast.error("Please enter phone number");
      return;
    }
    if (newTrainer.enableLogin && !newTrainer.password) {
      toast.error("Please enter a password or disable login access");
      return;
    }

    // Check for duplicate phone
    const { data: existing } = await supabase
      .from("staff")
      .select("id")
      .eq("phone", newTrainer.phone.replace(/\D/g, ""))
      .single();

    if (existing) {
      toast.error("A staff member with this phone number already exists");
      return;
    }

    const cleanPhone = newTrainer.phone.replace(/\D/g, "").replace(/^0/, "");

    // Hash password if login is enabled
    let passwordHash = null;
    if (newTrainer.enableLogin && newTrainer.password) {
      passwordHash = await hashPassword(newTrainer.password);
    }

    // Insert staff record
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .insert({
        full_name: newTrainer.full_name,
        phone: cleanPhone,
        role: "trainer",
        specialization: newTrainer.specialization || null,
        id_type: newTrainer.id_type || null,
        id_number: newTrainer.id_number || null,
        salary_type: newTrainer.salary_type,
        monthly_salary: Number(newTrainer.monthly_salary) || 0,
        session_fee: Number(newTrainer.session_fee) || 0,
        percentage_fee: Number(newTrainer.percentage_fee) || 0,
        password_hash: passwordHash,
        password_set_at: passwordHash ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (staffError) {
      toast.error("Error adding trainer", { description: staffError.message });
      return;
    }

    // Add branch assignments
    const branchesToAssign = newTrainer.selected_branches.length > 0
      ? newTrainer.selected_branches
      : currentBranch?.id ? [currentBranch.id] : [];

    if (branchesToAssign.length > 0) {
      const assignments = branchesToAssign.map((branchId, index) => ({
        staff_id: staffData.id,
        branch_id: branchId,
        is_primary: index === 0,
      }));

      await supabase.from("staff_branch_assignments").insert(assignments);
    }

    // Insert permissions
    await supabase.from("staff_permissions").insert({
      staff_id: staffData.id,
      ...newTrainer.permissions,
    });

    await logAdminActivity({
      category: "staff",
      type: "staff_added",
      description: `Added trainer "${newTrainer.full_name}"${newTrainer.enableLogin ? " with login access" : ""}`,
      entityType: "staff",
      entityName: newTrainer.full_name,
      newValue: { ...newTrainer, password: undefined, role: "trainer" },
      branchId: currentBranch?.id,
    });

    toast.success("Trainer added successfully");
    setNewTrainer({
      full_name: "",
      phone: "",
      specialization: "",
      id_type: "aadhaar",
      id_number: "",
      salary_type: "monthly",
      monthly_salary: "",
      session_fee: "",
      percentage_fee: "",
      selected_branches: [],
      enableLogin: false,
      password: "",
      permissions: getDefaultPermissions("trainer"),
    });
    onRefresh();
  };

  const handleEdit = (trainer: Staff) => {
    setEditingId(trainer.id);
    setEditData({
      full_name: trainer.full_name,
      phone: trainer.phone,
      specialization: trainer.specialization || "",
      id_type: trainer.id_type || "aadhaar",
      id_number: trainer.id_number || "",
      salary_type: trainer.salary_type,
      monthly_salary: String(trainer.monthly_salary || 0),
      session_fee: String(trainer.session_fee || 0),
      percentage_fee: String(trainer.percentage_fee || 0),
    });
  };

  const handleSave = async (id: string) => {
    if (!editData.full_name) {
      toast.error("Name is required");
      return;
    }

    const trainer = trainers.find((t) => t.id === id);
    const cleanPhone = editData.phone.replace(/\D/g, "").replace(/^0/, "");

    const { error } = await supabase
      .from("staff")
      .update({
        full_name: editData.full_name,
        phone: cleanPhone,
        specialization: editData.specialization || null,
        id_type: editData.id_type || null,
        id_number: editData.id_number || null,
        salary_type: editData.salary_type,
        monthly_salary: Number(editData.monthly_salary) || 0,
        session_fee: Number(editData.session_fee) || 0,
        percentage_fee: Number(editData.percentage_fee) || 0,
      })
      .eq("id", id);

    if (error) {
      toast.error("Error updating trainer", { description: error.message });
      return;
    }

    await logAdminActivity({
      category: "staff",
      type: "staff_updated",
      description: `Updated trainer "${editData.full_name}"`,
      entityType: "staff",
      entityId: id,
      entityName: editData.full_name,
      oldValue: trainer,
      newValue: editData,
      branchId: currentBranch?.id,
    });

    toast.success("Trainer updated");
    setEditingId(null);
    onRefresh();
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    const trainer = trainers.find((t) => t.id === id);
    await supabase.from("staff").update({ is_active: isActive }).eq("id", id);
    
    await logAdminActivity({
      category: "staff",
      type: "staff_toggled",
      description: `${isActive ? "Activated" : "Deactivated"} trainer "${trainer?.full_name}"`,
      entityType: "staff",
      entityId: id,
      entityName: trainer?.full_name,
      oldValue: { is_active: !isActive },
      newValue: { is_active: isActive },
      branchId: currentBranch?.id,
    });

    onRefresh();
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Trainer",
      description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      variant: "destructive",
      onConfirm: async () => {
        await supabase.from("staff").delete().eq("id", id);
        
        await logAdminActivity({
          category: "staff",
          type: "staff_deleted",
          description: `Deleted trainer "${name}"`,
          entityType: "staff",
          entityId: id,
          entityName: name,
          branchId: currentBranch?.id,
        });

        toast.success("Trainer deleted");
        onRefresh();
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Add Trainer Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Add New Trainer</CardTitle>
          <CardDescription>Add a trainer with salary and permission settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={newTrainer.full_name}
                onChange={(e) => setNewTrainer({ ...newTrainer, full_name: e.target.value })}
                placeholder="Enter full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input
                value={newTrainer.phone}
                onChange={(e) => setNewTrainer({ ...newTrainer, phone: e.target.value })}
                placeholder="10-digit phone number"
              />
            </div>
            <div className="space-y-2">
              <Label>Specialization</Label>
              <Input
                value={newTrainer.specialization}
                onChange={(e) => setNewTrainer({ ...newTrainer, specialization: e.target.value })}
                placeholder="e.g., Weight Training"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>ID Type</Label>
              <Select
                value={newTrainer.id_type}
                onValueChange={(value) => setNewTrainer({ ...newTrainer, id_type: value })}
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
                value={newTrainer.id_number}
                onChange={(e) => setNewTrainer({ ...newTrainer, id_number: e.target.value })}
                placeholder="ID number"
              />
            </div>
            <div className="space-y-2">
              <Label>Salary Type</Label>
              <Select
                value={newTrainer.salary_type}
                onValueChange={(value: any) => setNewTrainer({ ...newTrainer, salary_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly Salary</SelectItem>
                  <SelectItem value="session_based">Session Based</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="both">Monthly + Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {(newTrainer.salary_type === "monthly" || newTrainer.salary_type === "both") && (
              <div className="space-y-2">
                <Label>Monthly Salary (₹)</Label>
                <Input
                  type="number"
                  value={newTrainer.monthly_salary}
                  onChange={(e) => setNewTrainer({ ...newTrainer, monthly_salary: e.target.value })}
                  placeholder="Monthly salary"
                />
              </div>
            )}
            {newTrainer.salary_type === "session_based" && (
              <div className="space-y-2">
                <Label>Session Fee (₹)</Label>
                <Input
                  type="number"
                  value={newTrainer.session_fee}
                  onChange={(e) => setNewTrainer({ ...newTrainer, session_fee: e.target.value })}
                  placeholder="Per session fee"
                />
              </div>
            )}
            {(newTrainer.salary_type === "percentage" || newTrainer.salary_type === "both") && (
              <div className="space-y-2">
                <Label>Percentage Fee (%)</Label>
                <Input
                  type="number"
                  value={newTrainer.percentage_fee}
                  onChange={(e) => setNewTrainer({ ...newTrainer, percentage_fee: e.target.value })}
                  placeholder="e.g., 20"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Assigned Branches</Label>
            <StaffBranchSelector
              branches={branches}
              selectedBranches={newTrainer.selected_branches}
              onChange={(selected) => setNewTrainer({ ...newTrainer, selected_branches: selected })}
            />
          </div>

          {/* Permissions Section */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4" />
              Access Permissions
            </Label>
            <StaffInlinePermissions
              permissions={newTrainer.permissions}
              onChange={(permissions) => setNewTrainer({ ...newTrainer, permissions })}
            />
          </div>

          {/* Login Credentials Section */}
          <StaffCredentialsSection
            enableLogin={newTrainer.enableLogin}
            onEnableLoginChange={(enabled) => setNewTrainer({ ...newTrainer, enableLogin: enabled })}
            password={newTrainer.password}
            onPasswordChange={(password) => setNewTrainer({ ...newTrainer, password })}
          />

          <Button onClick={handleAddTrainer} className="gap-2">
            <PlusIcon className="w-4 h-4" />
            Add Trainer
          </Button>
        </CardContent>
      </Card>

      {/* Existing Trainers */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Existing Trainers</CardTitle>
          <CardDescription>
            {trainers.length} trainer{trainers.length !== 1 ? "s" : ""} registered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : trainers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No trainers added yet</p>
          ) : (
            <div className="space-y-3">
              {trainers.map((trainer) => (
                <div
                  key={trainer.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg transition-colors duration-150 hover:bg-muted/70"
                >
                  {editingId === trainer.id ? (
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
                          <Label className="text-xs">Specialization</Label>
                          <Input
                            value={editData.specialization}
                            onChange={(e) => setEditData({ ...editData, specialization: e.target.value })}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Salary Type</Label>
                          <Select
                            value={editData.salary_type}
                            onValueChange={(value) => setEditData({ ...editData, salary_type: value })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="session_based">Session</SelectItem>
                              <SelectItem value="percentage">Percentage</SelectItem>
                              <SelectItem value="both">Both</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSave(trainer.id)} className="gap-1">
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
                          <p className="font-medium">{trainer.full_name}</p>
                          <Badge variant="secondary" className="text-xs">Trainer</Badge>
                          {!trainer.is_active && (
                            <Badge variant="secondary" className="text-xs bg-red-100 text-red-800">Inactive</Badge>
                          )}
                          {trainer.password_hash && (
                            <Badge variant="outline" className="text-xs text-green-600">Has Login</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                          {trainer.phone && <span>📱 {trainer.phone}</span>}
                          {trainer.specialization && <span>🎯 {trainer.specialization}</span>}
                          {trainer.salary_type === "monthly" && trainer.monthly_salary > 0 && (
                            <span>💰 ₹{trainer.monthly_salary}/month</span>
                          )}
                          {trainer.salary_type === "session_based" && trainer.session_fee > 0 && (
                            <span>💰 ₹{trainer.session_fee}/session</span>
                          )}
                          {trainer.salary_type === "percentage" && trainer.percentage_fee > 0 && (
                            <span>💰 {trainer.percentage_fee}%</span>
                          )}
                          {trainer.salary_type === "both" && (
                            <span>💰 ₹{trainer.monthly_salary}/mo + {trainer.percentage_fee}%</span>
                          )}
                          {trainer.branch_assignments && trainer.branch_assignments.length > 0 && (
                            <span>
                              📍 {trainer.branch_assignments.map((a) => a.branch_name).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPasswordDialog({ open: true, staff: trainer })}
                          title="Set Password"
                        >
                          <KeyIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPermissionsDialog({ open: true, staff: trainer })}
                          title="Manage Permissions"
                        >
                          <ShieldCheckIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(trainer)}
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        <Switch
                          checked={trainer.is_active}
                          onCheckedChange={(checked) => handleToggle(trainer.id, checked)}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(trainer.id, trainer.full_name)}
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

      <StaffPermissionsDialog
        open={permissionsDialog.open}
        onOpenChange={(open) => setPermissionsDialog({ ...permissionsDialog, open })}
        staff={permissionsDialog.staff}
        onSuccess={onRefresh}
      />
    </div>
  );
};
