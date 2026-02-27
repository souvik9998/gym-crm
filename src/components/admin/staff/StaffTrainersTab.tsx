import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/api/edgeFunctionClient";
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
import { Staff, StaffPermissions } from "@/pages/admin/StaffManagement";
import { StaffPasswordDialog } from "./StaffPasswordDialog";
import { StaffPermissionsDialog } from "./StaffPermissionsDialog";
import { StaffBranchSelector } from "./StaffBranchSelector";
import { StaffBranchAssignmentDialog } from "./StaffBranchAssignmentDialog";
import { StaffCredentialsSection } from "./StaffCredentialsSection";
import { StaffInlinePermissions, InlinePermissions, getDefaultPermissions } from "./StaffInlinePermissions";
import { StaffWhatsAppButton, sendStaffCredentialsWhatsApp } from "./StaffWhatsAppButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StaffTrainersTabProps {
  trainers: Staff[];
  branches: any[];
  currentBranch: any;
  onRefresh: () => void;
  isLoading: boolean;
}


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
    payment_category: "monthly_percentage" as "monthly_percentage" | "session_basis",
    monthly_fee: "",
    monthly_salary: "",
    percentage_fee: "",
    session_fee: "",
    selected_branches: currentBranch?.id ? [currentBranch.id] : [] as string[],
    enableLogin: false,
    password: "",
    permissions: getDefaultPermissions("trainer"),
    sendWhatsApp: true, // Default to send WhatsApp
  });
  const [isAddingTrainer, setIsAddingTrainer] = useState(false);
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

  // Update selected branches when currentBranch changes
  useEffect(() => {
    if (currentBranch?.id && !newTrainer.selected_branches.includes(currentBranch.id)) {
      setNewTrainer((prev) => ({
        ...prev,
        selected_branches: prev.selected_branches.length === 0 
          ? [currentBranch.id] 
          : prev.selected_branches,
      }));
    }
  }, [currentBranch?.id]);

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

    if (addingRef.current) return;
    addingRef.current = true;
    setIsAddingTrainer(true);
    const cleanPhone = newTrainer.phone.replace(/\D/g, "").replace(/^0/, "");
    
    try {
      const branchesToAssign = newTrainer.selected_branches.length > 0 
        ? newTrainer.selected_branches 
        : currentBranch?.id ? [currentBranch.id] : [];

      // Check if staff with this phone exists GLOBALLY
      const { data: existingStaffList } = await supabase
        .from("staff")
        .select("*, staff_permissions(*), staff_branch_assignments(*, branches(name))")
        .eq("phone", cleanPhone);

      if (existingStaffList && existingStaffList.length > 0) {
        const existing = existingStaffList[0];
        const existingMapped: Staff = {
          ...existing,
          permissions: existing.staff_permissions?.[0] || undefined,
          branch_assignments: (existing.staff_branch_assignments || []).map((a: any) => ({
            ...a,
            branch_name: a.branches?.name,
          })),
        } as Staff;

        // Show dialog to redirect admin to branch assignment
        setExistingStaffDialog({ open: true, existingStaff: existingMapped });
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
          toast.error(`A trainer with this phone already exists in ${branchName}`);
          return;
        }
      }

      // Validate monthly fee for trainers
      if (!newTrainer.monthly_fee) {
        toast.error("Monthly fee (member charge) is required");
        return;
      }

      if (newTrainer.payment_category === "session_basis" && !newTrainer.session_fee) {
        toast.error("Session fee is required for session basis category");
        return;
      }

      // Insert staff record (without password - will be set via edge function)
      const { data: staffData, error: staffError } = await supabase
        .from("staff")
        .insert({
          full_name: newTrainer.full_name,
          phone: cleanPhone,
          role: "trainer",
          specialization: newTrainer.specialization || null,
          id_type: newTrainer.id_type || null,
          id_number: newTrainer.id_number || null,
          salary_type: newTrainer.payment_category === "monthly_percentage" ? "both" : "session_based",
          monthly_salary: Number(newTrainer.monthly_salary) || 0,
          session_fee: Number(newTrainer.session_fee) || 0,
          percentage_fee: Number(newTrainer.percentage_fee) || 0,
        })
        .select()
        .single();

      if (staffError) {
        toast.error("Error adding trainer", { description: staffError.message });
        return;
      }

      // Set password via edge function if login is enabled
      if (newTrainer.enableLogin && newTrainer.password) {
        const { error: passwordError } = await invokeEdgeFunction("staff-auth?action=set-password", {
          body: {
            staffId: staffData.id,
            password: newTrainer.password,
            sendWhatsApp: newTrainer.sendWhatsApp,
          },
        });
        if (passwordError) {
          console.error("Error setting password:", passwordError);
          toast.warning("Trainer created but password setup failed", {
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
        
        // Sync to personal_trainers table for each assigned branch
        for (const branchId of branchesToAssign) {
          await supabase.from("personal_trainers").insert({
            name: newTrainer.full_name,
            phone: cleanPhone || null,
            specialization: newTrainer.specialization || null,
            monthly_fee: Number(newTrainer.monthly_fee) || 0,
            monthly_salary: Number(newTrainer.monthly_salary) || 0,
            percentage_fee: Number(newTrainer.percentage_fee) || 0,
            session_fee: Number(newTrainer.session_fee) || 0,
            payment_category: newTrainer.payment_category === "monthly_percentage" ? "monthly_percentage" : "session_basis",
            branch_id: branchId,
            is_active: true,
          });
        }
        
        // Get branch names for WhatsApp
        branchNames.push(...branchesToAssign.map(bid => branches.find(b => b.id === bid)?.name).filter(Boolean));
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

      // Send WhatsApp credentials if enabled and login is enabled
      let whatsAppSent = false;
      if (newTrainer.enableLogin && newTrainer.sendWhatsApp && newTrainer.password && cleanPhone) {
        whatsAppSent = await sendStaffCredentialsWhatsApp(
          { full_name: newTrainer.full_name, phone: cleanPhone, role: "trainer" },
          newTrainer.password,
          currentBranch?.id,
          currentBranch?.name,
          branchNames
        );
      }

      toast.success("Trainer added successfully", {
        description: newTrainer.enableLogin && newTrainer.sendWhatsApp
          ? whatsAppSent
            ? "Login credentials sent via WhatsApp"
            : "Trainer added but WhatsApp delivery failed"
          : undefined,
      });
      
      setNewTrainer({
        full_name: "",
        phone: "",
        specialization: "",
        id_type: "aadhaar",
        id_number: "",
        payment_category: "monthly_percentage",
        monthly_fee: "",
        monthly_salary: "",
        percentage_fee: "",
        session_fee: "",
        selected_branches: currentBranch?.id ? [currentBranch.id] : [],
        enableLogin: false,
        password: "",
        permissions: getDefaultPermissions("trainer"),
        sendWhatsApp: true,
      });
      onRefresh();
    } finally {
      setIsAddingTrainer(false);
      addingRef.current = false;
    }
  };

  const handleEdit = (trainer: Staff) => {
    setEditingId(trainer.id);
    // Determine payment_category from salary_type
    const paymentCategory = trainer.salary_type === "session_based" ? "session_basis" : "monthly_percentage";
    setEditData({
      full_name: trainer.full_name,
      phone: trainer.phone,
      specialization: trainer.specialization || "",
      id_type: trainer.id_type || "aadhaar",
      id_number: trainer.id_number || "",
      payment_category: paymentCategory as "monthly_percentage" | "session_basis",
      monthly_fee: String((trainer as any).monthly_fee || 0),
      monthly_salary: String(trainer.monthly_salary || 0),
      percentage_fee: String(trainer.percentage_fee || 0),
      session_fee: String(trainer.session_fee || 0),
    });
  };

  const handleSave = async (id: string) => {
    if (!editData.full_name) {
      toast.error("Name is required");
      return;
    }

    const trainer = trainers.find((t) => t.id === id);
    const cleanPhone = editData.phone.replace(/\D/g, "").replace(/^0/, "");

    // Check if phone is being changed and if new phone already exists
    if (cleanPhone !== trainer?.phone) {
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
        specialization: editData.specialization || null,
        id_type: editData.id_type || null,
        id_number: editData.id_number || null,
        salary_type: editData.payment_category === "monthly_percentage" ? "both" : "session_based",
        monthly_salary: Number(editData.monthly_salary) || 0,
        session_fee: Number(editData.session_fee) || 0,
        percentage_fee: Number(editData.percentage_fee) || 0,
      })
      .eq("id", id);

    if (error) {
      toast.error("Error updating trainer", { description: error.message });
      return;
    }

    // Filter out metadata fields and only include fields that are being updated
    const fieldsToLog = ['full_name', 'phone', 'specialization', 'id_type', 'id_number', 'salary_type', 'monthly_salary', 'session_fee', 'percentage_fee'];
    const oldValueFiltered = trainer 
      ? Object.fromEntries(
          fieldsToLog
            .filter(key => key in trainer)
            .map(key => [key, (trainer as any)[key]])
        )
      : null;
    
    const newValueFiltered = Object.fromEntries(
      fieldsToLog.map(key => {
        if (key === 'monthly_salary') {
          return [key, Number(editData.monthly_salary) || 0];
        }
        if (key === 'session_fee') {
          return [key, Number(editData.session_fee) || 0];
        }
        if (key === 'percentage_fee') {
          return [key, Number(editData.percentage_fee) || 0];
        }
        if (key === 'salary_type') {
          return [key, editData.payment_category === "monthly_percentage" ? "both" : "session_based"];
        }
        return [key, (editData as any)[key] || null];
      })
    );

    await logAdminActivity({
      category: "staff",
      type: "staff_updated",
      description: `Updated trainer "${editData.full_name}"`,
      entityType: "staff",
      entityId: id,
      entityName: editData.full_name,
      oldValue: oldValueFiltered,
      newValue: newValueFiltered,
      branchId: currentBranch?.id,
    });

    // Sync updates to personal_trainers table
    if (trainer) {
      await supabase
        .from("personal_trainers")
        .update({
          name: editData.full_name,
          phone: cleanPhone || null,
          specialization: editData.specialization || null,
          monthly_fee: Number(editData.monthly_fee) || 0,
          monthly_salary: Number(editData.monthly_salary) || 0,
          percentage_fee: Number(editData.percentage_fee) || 0,
          session_fee: Number(editData.session_fee) || 0,
          payment_category: editData.payment_category === "monthly_percentage" ? "monthly_percentage" : "session_basis",
        })
        .eq("phone", trainer.phone);
    }

    toast.success("Trainer updated");
    setEditingId(null);
    onRefresh();
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    const trainer = trainers.find((t) => t.id === id);
    await supabase.from("staff").update({ is_active: isActive }).eq("id", id);
    
    // Sync toggle to personal_trainers
    if (trainer?.phone) {
      await supabase.from("personal_trainers").update({ is_active: isActive }).eq("phone", trainer.phone);
    }
    
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
        // Delete from personal_trainers first (by phone match)
        const trainerToDelete = trainers.find(t => t.id === id);
        if (trainerToDelete?.phone) {
          await supabase.from("personal_trainers").delete().eq("phone", trainerToDelete.phone);
        }
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
          </div>

          <div className="space-y-2">
            <Label>Payment Category *</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={newTrainer.payment_category === "monthly_percentage"}
                  onChange={() => setNewTrainer({ ...newTrainer, payment_category: "monthly_percentage" })}
                  className="accent-primary"
                />
                <span className="text-sm">Monthly + Percentage</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={newTrainer.payment_category === "session_basis"}
                  onChange={() => setNewTrainer({ ...newTrainer, payment_category: "session_basis" })}
                  className="accent-primary"
                />
                <span className="text-sm">Session Basis</span>
              </label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Monthly Fee (₹) * <span className="text-xs text-muted-foreground">(Member charge)</span></Label>
              <Input
                type="number"
                value={newTrainer.monthly_fee}
                onChange={(e) => setNewTrainer({ ...newTrainer, monthly_fee: e.target.value })}
                placeholder="What members pay per month"
              />
            </div>
            
            {newTrainer.payment_category === "monthly_percentage" && (
              <>
                <div className="space-y-2">
                  <Label>Monthly Salary (₹) <span className="text-xs text-muted-foreground">(Trainer's salary)</span></Label>
                  <Input
                    type="number"
                    value={newTrainer.monthly_salary}
                    onChange={(e) => setNewTrainer({ ...newTrainer, monthly_salary: e.target.value })}
                    placeholder="Trainer's monthly salary"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Percentage Fee (%) <span className="text-xs text-muted-foreground">(% of PT fee)</span></Label>
                  <Input
                    type="number"
                    value={newTrainer.percentage_fee}
                    onChange={(e) => setNewTrainer({ ...newTrainer, percentage_fee: e.target.value })}
                    placeholder="e.g., 20"
                  />
                </div>
              </>
            )}
            {newTrainer.payment_category === "session_basis" && (
              <div className="space-y-2">
                <Label>Session Fee (₹) * <span className="text-xs text-muted-foreground">(Per session/day)</span></Label>
                <Input
                  type="number"
                  value={newTrainer.session_fee}
                  onChange={(e) => setNewTrainer({ ...newTrainer, session_fee: e.target.value })}
                  placeholder="Per session fee"
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

          {/* Login Credentials Section */}
          <StaffCredentialsSection
            enableLogin={newTrainer.enableLogin}
            onEnableLoginChange={(enabled) => setNewTrainer({ ...newTrainer, enableLogin: enabled })}
            password={newTrainer.password}
            onPasswordChange={(password) => setNewTrainer({ ...newTrainer, password })}
          />

          {newTrainer.enableLogin && (
            <>
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
              
              {/* WhatsApp Checkbox */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendWhatsAppTrainer"
                  checked={newTrainer.sendWhatsApp}
                  onCheckedChange={(checked) => setNewTrainer({ ...newTrainer, sendWhatsApp: checked === true })}
                />
                <Label htmlFor="sendWhatsAppTrainer" className="text-sm cursor-pointer">
                  Send login credentials via WhatsApp after adding
                </Label>
              </div>
            </>
          )}

          <Button onClick={handleAddTrainer} disabled={isAddingTrainer} className="gap-2">
            <PlusIcon className="w-4 h-4" />
            {isAddingTrainer ? "Adding Trainer..." : "Add Trainer"}
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
                          <Label className="text-xs">Monthly Fee (₹) * (Member charge)</Label>
                          <Input
                            type="number"
                            value={editData.monthly_fee}
                            onChange={(e) => setEditData({ ...editData, monthly_fee: e.target.value })}
                            className="h-9"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Payment Category *</Label>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              checked={editData.payment_category === "monthly_percentage"}
                              onChange={() => setEditData({ ...editData, payment_category: "monthly_percentage" })}
                              className="accent-primary"
                            />
                            <span className="text-sm">Monthly + Percentage</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              checked={editData.payment_category === "session_basis"}
                              onChange={() => setEditData({ ...editData, payment_category: "session_basis" })}
                              className="accent-primary"
                            />
                            <span className="text-sm">Session Basis</span>
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {editData.payment_category === "monthly_percentage" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-xs">Monthly Salary (₹)</Label>
                              <Input
                                type="number"
                                value={editData.monthly_salary}
                                onChange={(e) => setEditData({ ...editData, monthly_salary: e.target.value })}
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Percentage Fee (%)</Label>
                              <Input
                                type="number"
                                value={editData.percentage_fee}
                                onChange={(e) => setEditData({ ...editData, percentage_fee: e.target.value })}
                                className="h-9"
                              />
                            </div>
                          </>
                        )}
                        {editData.payment_category === "session_basis" && (
                          <div className="space-y-1">
                            <Label className="text-xs">Session Fee (₹) *</Label>
                            <Input
                              type="number"
                              value={editData.session_fee}
                              onChange={(e) => setEditData({ ...editData, session_fee: e.target.value })}
                              className="h-9"
                            />
                          </div>
                        )}
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
                            <Badge variant="secondary" className="text-xs bg-destructive/10 text-destructive">Inactive</Badge>
                          )}
                          {trainer.auth_user_id && (
                            <Badge variant="outline" className="text-xs text-primary">Has Login</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                          {trainer.phone && <span>📱 {trainer.phone}</span>}
                          {trainer.specialization && <span>🎯 {trainer.specialization}</span>}
                          {/* Show payment info based on salary_type which maps to payment_category */}
                          {trainer.salary_type === "both" && (
                            <span>💰 ₹{trainer.monthly_salary}/mo + {trainer.percentage_fee}% of PT fees</span>
                          )}
                          {trainer.salary_type === "session_based" && trainer.session_fee > 0 && (
                            <span>💰 ₹{trainer.session_fee}/session</span>
                          )}
                          {trainer.branch_assignments && trainer.branch_assignments.length > 0 && (
                            <span>
                              📍 {trainer.branch_assignments.map((a) => a.branch_name).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StaffWhatsAppButton staff={trainer} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setBranchAssignmentDialog({ open: true, staff: trainer })}
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
                              .eq("entity_id", trainer.id)
                              .eq("activity_type", "staff_password_set")
                              .order("created_at", { ascending: false })
                              .limit(1)
                              .maybeSingle();
                            
                            if (activities?.metadata && (activities.metadata as any).password) {
                              setViewPasswordDialog({
                                open: true,
                                staff: trainer,
                                password: (activities.metadata as any).password,
                              });
                            } else {
                              setPasswordDialog({ open: true, staff: trainer });
                            }
                          }}
                          title={trainer.auth_user_id ? "View/Update Password" : "Set Password"}
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

      {/* Existing Staff Found Dialog */}
      <Dialog
        open={existingStaffDialog.open}
        onOpenChange={(open) => {
          setExistingStaffDialog({ ...existingStaffDialog, open });
          if (!open) {
            setIsAddingTrainer(false);
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
              setIsAddingTrainer(false);
              addingRef.current = false;
            }}>
              Cancel
            </Button>
            <Button onClick={() => {
              const staff = existingStaffDialog.existingStaff;
              setExistingStaffDialog({ open: false, existingStaff: null });
              setIsAddingTrainer(false);
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
    </div>
  );
};
