import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffMutationsRefresh } from "@/hooks/useStaffMutationsRefresh";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { InformationCircleIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
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
import { StaffRoleConversionDialog } from "./StaffRoleConversionDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChangePhoneDialog } from "./ChangePhoneDialog";
import { DevicePhoneMobileIcon, ChevronDownIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { StaffCardSkeleton } from "./StaffCardSkeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DetailItem } from "./StaffDetailItem";
import { nameSchema, phoneSchema, getPhotoIdSchema, formatPhotoIdInput, getPhotoIdPlaceholder } from "@/lib/validation";
import { extractEdgeFunctionError } from "@/lib/edgeFunctionErrors";
import { validateStaffPassword } from "@/lib/staffPassword";

interface StaffTrainersTabProps {
  trainers: Staff[];
  branches: any[];
  currentBranch: any;
  onRefresh: () => void;
  isLoading: boolean;
  onConversionSuccess?: () => void;
}


export const StaffTrainersTab = ({
  trainers,
  branches,
  currentBranch,
  onRefresh,
  isLoading,
  onConversionSuccess,
}: StaffTrainersTabProps) => {
  const queryClient = useQueryClient();
  const isCompact = useIsTabletOrBelow();
  const { refreshStaffData } = useStaffMutationsRefresh();
  const [infoDialog, setInfoDialog] = useState<{ open: boolean; trainer: Staff | null }>({ open: false, trainer: null });
  const [conversionDialog, setConversionDialog] = useState<{ open: boolean; staff: Staff | null }>({ open: false, staff: null });
  const [changePhoneDialog, setChangePhoneDialog] = useState<{ open: boolean; staff: Staff | null }>({ open: false, staff: null });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Centralized invalidation so every dependent surface (filters, time slots,
  // attendance, member trainer names, activity logs, etc.) updates instantly.
  const refreshAll = async () => {
    await refreshStaffData();
    onRefresh();
  };

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
    sendWhatsApp: true,
  });
  const [isAddingTrainer, setIsAddingTrainer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [originalEditData, setOriginalEditData] = useState<any>({});
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
    const nameResult = nameSchema.safeParse(newTrainer.full_name);
    if (!nameResult.success) {
      toast.error(nameResult.error.errors[0]?.message || "Invalid name");
      return;
    }
    const phoneResult = phoneSchema.safeParse(newTrainer.phone);
    if (!phoneResult.success) {
      toast.error(phoneResult.error.errors[0]?.message || "Invalid phone number");
      return;
    }
    const cleanPhone = phoneResult.data;

    if (newTrainer.id_number?.trim()) {
      const idResult = getPhotoIdSchema(newTrainer.id_type).safeParse(newTrainer.id_number);
      if (!idResult.success) {
        toast.error(idResult.error.errors[0]?.message || "Invalid ID number");
        return;
      }
    }

    if (newTrainer.enableLogin) {
      const pwdResult = validateStaffPassword(newTrainer.password, {
        fullName: newTrainer.full_name,
        phone: cleanPhone,
      });
      if (pwdResult.valid === false) {
        toast.error(pwdResult.error);
        return;
      }
    }

    if (!newTrainer.monthly_fee || Number(newTrainer.monthly_fee) <= 0) {
      toast.error("Monthly fee (member charge) must be greater than 0");
      return;
    }
    if (newTrainer.payment_category === "session_basis" && (!newTrainer.session_fee || Number(newTrainer.session_fee) <= 0)) {
      toast.error("Session fee must be greater than 0 for session-basis category");
      return;
    }
    if (newTrainer.payment_category === "monthly_percentage") {
      if (newTrainer.percentage_fee && (Number(newTrainer.percentage_fee) < 0 || Number(newTrainer.percentage_fee) > 100)) {
        toast.error("Percentage fee must be between 0 and 100");
        return;
      }
    }

    if (addingRef.current) return;
    addingRef.current = true;
    setIsAddingTrainer(true);

    const loadingToastId = toast.loading("Adding trainer...", {
      description: "Please wait while we set things up.",
    });

    try {
      const branchesToAssign = newTrainer.selected_branches.length > 0 
        ? newTrainer.selected_branches 
        : currentBranch?.id ? [currentBranch.id] : [];

      // Check if staff with this phone already exists globally
      toast.loading("Checking for existing trainer...", { id: loadingToastId });
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
          toast.error(`A trainer with this phone already exists in ${branchName}`, { id: loadingToastId });
          return;
        }
      }

      // Insert staff record (without password - will be set via edge function)
      toast.loading("Creating trainer record...", { id: loadingToastId });
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
        toast.error("Error adding trainer", { id: loadingToastId, description: staffError.message });
        return;
      }

      // Set password via edge function if login is enabled
      if (newTrainer.enableLogin && newTrainer.password) {
        toast.loading("Setting up login access...", { id: loadingToastId });
        const { error: passwordError } = await supabase.functions.invoke("staff-auth?action=set-password", {
          body: {
            staffId: staffData.id,
            password: newTrainer.password,
            sendWhatsApp: newTrainer.sendWhatsApp,
          },
        });
        if (passwordError) {
          const serverMessage = await extractEdgeFunctionError(passwordError, "Password setup failed");
          console.error("Error setting password:", passwordError);
          toast.warning("Trainer created but password setup failed", {
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
        toast.loading("Sending login credentials via WhatsApp...", { id: loadingToastId });
        whatsAppSent = await sendStaffCredentialsWhatsApp(
          { full_name: newTrainer.full_name, phone: cleanPhone, role: "trainer" },
          newTrainer.password,
          currentBranch?.id,
          currentBranch?.name,
          branchNames
        );
      }

      toast.success("Trainer added successfully", {
        id: loadingToastId,
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
      await refreshAll();
    } catch (err: any) {
      toast.error("Failed to add trainer", {
        id: loadingToastId,
        description: err?.message || "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsAddingTrainer(false);
      addingRef.current = false;
    }
  };

  const handleEdit = (trainer: Staff) => {
    setEditingId(trainer.id);
    // Determine payment_category from salary_type
    const paymentCategory = trainer.salary_type === "session_based" ? "session_basis" : "monthly_percentage";
    const snapshot = {
      full_name: trainer.full_name,
      specialization: trainer.specialization || "",
      id_type: trainer.id_type || "aadhaar",
      id_number: trainer.id_number || "",
      payment_category: paymentCategory as "monthly_percentage" | "session_basis",
      monthly_fee: String((trainer as any).monthly_fee || 0),
      monthly_salary: String(trainer.monthly_salary || 0),
      percentage_fee: String(trainer.percentage_fee || 0),
      session_fee: String(trainer.session_fee || 0),
    };
    setEditData(snapshot);
    setOriginalEditData(snapshot);
  };

  // Detect whether any field changed compared to original snapshot
  const isEditDirty = (): boolean => {
    if (!editingId) return false;
    const keys = Object.keys(originalEditData);
    return keys.some((k) => String(editData?.[k] ?? "") !== String(originalEditData?.[k] ?? ""));
  };

  const handleSave = async (id: string) => {
    if (!editData.full_name) {
      toast.error("Name is required");
      return;
    }

    const trainer = trainers.find((t) => t.id === id);

    const { error } = await supabase
      .from("staff")
      .update({
        full_name: editData.full_name,
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
    const fieldsToLog = ['full_name', 'specialization', 'id_type', 'id_number', 'salary_type', 'monthly_salary', 'session_fee', 'percentage_fee'];
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

    // Sync updates to personal_trainers table (matched by stable phone — phone isn't editable here)
    if (trainer?.phone) {
      await supabase
        .from("personal_trainers")
        .update({
          name: editData.full_name,
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
    await refreshAll();
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

    await refreshAll();
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
        await refreshAll();
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Add Trainer Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-2">
          <CardTitle className="text-base lg:text-xl">Add New Trainer</CardTitle>
          <CardDescription className="text-xs lg:text-sm">Add a trainer with salary and permission settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 lg:space-y-4 p-4 lg:p-6 pt-2 lg:pt-0">
          <div className="grid gap-3 lg:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">Full Name *</Label>
              <Input
                value={newTrainer.full_name}
                onChange={(e) => setNewTrainer({ ...newTrainer, full_name: e.target.value.replace(/[^a-zA-Z\s.']/g, "").slice(0, 100) })}
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
                value={newTrainer.phone}
                onChange={(e) => setNewTrainer({ ...newTrainer, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                placeholder="10-digit phone number"
                className="h-9 lg:h-12 text-sm"
              />
            </div>
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">Specialization</Label>
              <Input
                value={newTrainer.specialization}
                onChange={(e) => setNewTrainer({ ...newTrainer, specialization: e.target.value })}
                placeholder="e.g., Weight Training"
                className="h-9 lg:h-12 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">ID Type</Label>
              <Select
                value={newTrainer.id_type}
                onValueChange={(value) => setNewTrainer({ ...newTrainer, id_type: value })}
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
                value={newTrainer.id_number}
                onChange={(e) => setNewTrainer({ ...newTrainer, id_number: formatPhotoIdInput(e.target.value, newTrainer.id_type) })}
                placeholder={getPhotoIdPlaceholder(newTrainer.id_type)}
                className="h-9 lg:h-12 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1 lg:space-y-2">
            <Label className="text-xs lg:text-sm">Payment Category *</Label>
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

          <div className="grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 lg:space-y-2">
              <Label className="text-xs lg:text-sm">Monthly Fee (₹) * <span className="text-[10px] lg:text-xs text-muted-foreground">(Member charge)</span></Label>
              <Input
                type="number"
                value={newTrainer.monthly_fee}
                onChange={(e) => setNewTrainer({ ...newTrainer, monthly_fee: e.target.value })}
                placeholder="What members pay per month"
                className="h-9 lg:h-12 text-sm"
              />
            </div>
            
            {newTrainer.payment_category === "monthly_percentage" && (
              <>
                <div className="space-y-1 lg:space-y-2">
                  <Label className="text-xs lg:text-sm">Monthly Salary (₹) <span className="text-[10px] lg:text-xs text-muted-foreground">(Trainer's salary)</span></Label>
                  <Input
                    type="number"
                    value={newTrainer.monthly_salary}
                    onChange={(e) => setNewTrainer({ ...newTrainer, monthly_salary: e.target.value })}
                    placeholder="Trainer's monthly salary"
                    className="h-9 lg:h-12 text-sm"
                  />
                </div>
                <div className="space-y-1 lg:space-y-2">
                  <Label className="text-xs lg:text-sm">Percentage Fee (%) <span className="text-[10px] lg:text-xs text-muted-foreground">(% of PT fee)</span></Label>
                  <Input
                    type="number"
                    value={newTrainer.percentage_fee}
                    onChange={(e) => setNewTrainer({ ...newTrainer, percentage_fee: e.target.value })}
                    placeholder="e.g., 20"
                    className="h-9 lg:h-12 text-sm"
                  />
                </div>
              </>
            )}
            {newTrainer.payment_category === "session_basis" && (
              <div className="space-y-1 lg:space-y-2">
                <Label className="text-xs lg:text-sm">Session Fee (₹) * <span className="text-[10px] lg:text-xs text-muted-foreground">(Per session/day)</span></Label>
                <Input
                  type="number"
                  value={newTrainer.session_fee}
                  onChange={(e) => setNewTrainer({ ...newTrainer, session_fee: e.target.value })}
                  placeholder="Per session fee"
                  className="h-9 lg:h-12 text-sm"
                />
              </div>
            )}
          </div>

          <div className="space-y-1 lg:space-y-2">
            <Label className="text-xs lg:text-sm">Assigned Branches</Label>
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
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-2">
          <CardTitle className="text-base lg:text-xl">Existing Trainers</CardTitle>
          <CardDescription className="text-xs lg:text-sm">
            {trainers.length} trainer{trainers.length !== 1 ? "s" : ""} registered
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-2 lg:pt-0">
          {isLoading ? (
            <StaffCardSkeleton count={3} />
          ) : trainers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No trainers added yet</p>
          ) : (
            <div className="space-y-3">
              {trainers.map((trainer, idx) => {
                const initials = trainer.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                const isExpanded = expandedId === trainer.id;
                const isEditing = editingId === trainer.id;

                return (
                <div
                  key={trainer.id}
                  className="group rounded-xl border border-border/60 bg-card hover:border-border hover:shadow-sm transition-all duration-200 ease-out animate-fade-in overflow-hidden"
                  style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "backwards" }}
                >
                  {isEditing ? (
                    <div className="p-4 lg:p-5 bg-gradient-to-b from-muted/30 to-transparent animate-fade-in">
                      <div className="flex-1 space-y-4 mr-0 lg:mr-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1.5 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "backwards" }}>
                            <Label className="text-xs font-medium text-foreground/80">Name *</Label>
                            <Input
                              value={editData.full_name}
                              onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                              className="h-9 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/40"
                              placeholder="Full name"
                            />
                          </div>
                          <div className="space-y-1.5 animate-fade-in" style={{ animationDelay: "40ms", animationFillMode: "backwards" }}>
                            <Label className="text-xs font-medium text-foreground/80">Specialization</Label>
                            <Input
                              value={editData.specialization}
                              onChange={(e) => setEditData({ ...editData, specialization: e.target.value })}
                              className="h-9 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/40"
                              placeholder="e.g., Cardio"
                            />
                          </div>
                          <div className="space-y-1.5 animate-fade-in md:col-span-2" style={{ animationDelay: "80ms", animationFillMode: "backwards" }}>
                            <Label className="text-xs font-medium text-foreground/80">Monthly Fee (₹) * <span className="text-muted-foreground font-normal">(Member charge)</span></Label>
                            <Input
                              type="number"
                              value={editData.monthly_fee}
                              onChange={(e) => setEditData({ ...editData, monthly_fee: e.target.value })}
                              className="h-9 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/40"
                              placeholder="0"
                            />
                          </div>
                        </div>

                        <div className="space-y-2 animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "backwards" }}>
                          <Label className="text-xs font-medium text-foreground/80">Payment Category *</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { value: "monthly_percentage", label: "Monthly + Percentage" },
                              { value: "session_basis", label: "Session Basis" },
                            ].map((opt) => {
                              const active = editData.payment_category === opt.value;
                              return (
                                <button
                                  type="button"
                                  key={opt.value}
                                  onClick={() => setEditData({ ...editData, payment_category: opt.value })}
                                  className={`relative flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 ease-out hover-scale ${
                                    active
                                      ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                                      : "border-border/60 hover:border-primary/30 hover:bg-muted/40"
                                  }`}
                                >
                                  <span
                                    className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                                      active ? "border-primary" : "border-muted-foreground/40"
                                    }`}
                                  >
                                    <span
                                      className={`h-2 w-2 rounded-full bg-primary transition-all duration-200 ${
                                        active ? "scale-100 opacity-100" : "scale-0 opacity-0"
                                      }`}
                                    />
                                  </span>
                                  <span className="text-sm font-medium">{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: "160ms", animationFillMode: "backwards" }} key={editData.payment_category}>
                          {editData.payment_category === "monthly_percentage" && (
                            <>
                              <div className="space-y-1.5 animate-fade-in">
                                <Label className="text-xs font-medium text-foreground/80">Monthly Salary (₹)</Label>
                                <Input
                                  type="number"
                                  value={editData.monthly_salary}
                                  onChange={(e) => setEditData({ ...editData, monthly_salary: e.target.value })}
                                  className="h-9 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/40"
                                  placeholder="0"
                                />
                              </div>
                              <div className="space-y-1.5 animate-fade-in" style={{ animationDelay: "60ms", animationFillMode: "backwards" }}>
                                <Label className="text-xs font-medium text-foreground/80">Percentage Fee (%)</Label>
                                <Input
                                  type="number"
                                  value={editData.percentage_fee}
                                  onChange={(e) => setEditData({ ...editData, percentage_fee: e.target.value })}
                                  className="h-9 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/40"
                                  placeholder="0"
                                />
                              </div>
                            </>
                          )}
                          {editData.payment_category === "session_basis" && (
                            <div className="space-y-1.5 animate-fade-in">
                              <Label className="text-xs font-medium text-foreground/80">Session Fee (₹) *</Label>
                              <Input
                                type="number"
                                value={editData.session_fee}
                                onChange={(e) => setEditData({ ...editData, session_fee: e.target.value })}
                                className="h-9 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/40"
                                placeholder="0"
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-1 animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "backwards" }}>
                          <Button
                            size="sm"
                            onClick={() => handleSave(trainer.id)}
                            disabled={!isEditDirty()}
                            className="gap-1.5 transition-all duration-200 ease-out hover-scale disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            <CheckIcon className="w-4 h-4" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setEditingId(null); setOriginalEditData({}); }}
                            className="gap-1.5 transition-all duration-200 hover-scale"
                          >
                            <XMarkIcon className="w-4 h-4" />
                            Cancel
                          </Button>
                          {isEditDirty() && (
                            <span className="ml-auto text-[11px] text-amber-600 dark:text-amber-400 animate-fade-in">
                              Unsaved changes
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Collapsible open={isExpanded} onOpenChange={(open) => setExpandedId(open ? trainer.id : null)}>
                      {/* Compact header — always visible */}
                      <div className="p-3 lg:p-4">
                        <div className="flex items-center gap-2 lg:gap-3 flex-wrap lg:flex-nowrap">
                          {/* Avatar with subtle gradient */}
                          <div className="flex-shrink-0 w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary font-semibold text-sm lg:text-base flex items-center justify-center ring-1 ring-primary/10 transition-transform duration-200 group-hover:scale-105">
                            {initials || "T"}
                          </div>

                          {/* Name + quick badges */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground text-sm lg:text-base truncate">
                                {trainer.full_name}
                              </h3>
                              <Badge className="text-[10px] h-5 px-1.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                                Trainer
                              </Badge>
                              {trainer.auth_user_id && (
                                <Badge className="text-[10px] h-5 px-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10">
                                  Login
                                </Badge>
                              )}
                              {!trainer.is_active && (
                                <Badge className="text-[10px] h-5 px-1.5 bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {trainer.phone || "No phone"}
                              {trainer.specialization && ` · ${trainer.specialization}`}
                            </p>
                          </div>

                          {/* Inline action toolbar */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/10 hover:border-blue-500/50 hover:text-blue-600"
                              onClick={() => setBranchAssignmentDialog({ open: true, staff: trainer })}
                              title="Manage Branch Assignments"
                            >
                              <BuildingOfficeIcon className="w-4 h-4" />
                            </Button>
                            {trainer.auth_user_id ? (
                              <>
                                <StaffWhatsAppButton staff={trainer} />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 hover:border-amber-500/50 hover:text-amber-600"
                                  onClick={async () => {
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
                                      setViewPasswordDialog({ open: true, staff: trainer, password: (activities.metadata as any).password });
                                    } else {
                                      setPasswordDialog({ open: true, staff: trainer });
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
                                  onClick={() => setPermissionsDialog({ open: true, staff: trainer })}
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
                                onClick={() => setPermissionsDialog({ open: true, staff: trainer })}
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
                              onClick={() => handleEdit(trainer)}
                              title="Edit details"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-teal-600 dark:text-teal-400 border-teal-500/30 hover:bg-teal-500/10 hover:border-teal-500/50 hover:text-teal-600"
                              onClick={() => setChangePhoneDialog({ open: true, staff: trainer })}
                              title="Change mobile number"
                            >
                              <DevicePhoneMobileIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 transition-all duration-200 hover:scale-105 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30 hover:bg-fuchsia-500/10 hover:border-fuchsia-500/50 hover:text-fuchsia-600"
                              onClick={() => setConversionDialog({ open: true, staff: trainer })}
                              title="Convert to Staff"
                            >
                              <ArrowsRightLeftIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive transition-all duration-200 hover:scale-105"
                              onClick={() => handleDelete(trainer.id, trainer.full_name)}
                              title="Delete trainer"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                            <div className="h-6 w-px bg-border/60 mx-1" />
                            <Switch
                              checked={trainer.is_active}
                              onCheckedChange={(checked) => handleToggle(trainer.id, checked)}
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

                      {/* Expanded details — populated info only */}
                      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                        <div className="px-3 lg:px-4 pb-4 pt-3 border-t border-border/40 bg-muted/20">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            <DetailItem label="Phone" value={trainer.phone || "—"} accent="teal" />
                            <DetailItem label="Specialization" value={trainer.specialization || "—"} accent="cyan" />
                            <DetailItem
                              label="Payment Type"
                              value={trainer.salary_type === "session_based" ? "Session Basis" : "Monthly + %"}
                              accent="violet"
                            />
                            {trainer.salary_type === "both" ? (
                              <>
                                <DetailItem label="Monthly Salary" value={`₹${trainer.monthly_salary || 0}`} accent="emerald" />
                                <DetailItem label="Percentage" value={`${trainer.percentage_fee || 0}%`} accent="emerald" />
                                <DetailItem label="Member Charge" value={`₹${(trainer as any).monthly_fee || 0}/mo`} accent="emerald" />
                              </>
                            ) : (
                              <DetailItem label="Session Fee" value={`₹${trainer.session_fee || 0}`} accent="emerald" />
                            )}
                            <DetailItem label="ID Type" value={trainer.id_type ? trainer.id_type.toUpperCase() : "—"} accent="amber" />
                            <DetailItem label="ID Number" value={trainer.id_number || "—"} accent="amber" />
                            <DetailItem
                              label="Branches"
                              value={
                                trainer.branch_assignments && trainer.branch_assignments.length > 0
                                  ? trainer.branch_assignments.map((a) => a.branch_name).join(", ")
                                  : "Unassigned"
                              }
                              accent="blue"
                            />
                            <DetailItem
                              label="Login Access"
                              value={trainer.auth_user_id ? "Enabled" : "Disabled"}
                              accent={trainer.auth_user_id ? "emerald" : "rose"}
                            />
                            <DetailItem
                              label="Last Login"
                              value={
                                trainer.last_login_at
                                  ? new Date(trainer.last_login_at).toLocaleString("en-IN", {
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
                              value={new Date(trainer.created_at).toLocaleDateString("en-IN", {
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

      {/* Trainer Info Dialog - Mobile/Tablet */}
      <Dialog open={infoDialog.open} onOpenChange={(open) => setInfoDialog({ ...infoDialog, open })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{infoDialog.trainer?.full_name}</DialogTitle>
            <DialogDescription>Trainer Details</DialogDescription>
          </DialogHeader>
          {infoDialog.trainer && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{infoDialog.trainer.phone}</span>
              </div>
              {infoDialog.trainer.specialization && (
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Specialization</span>
                  <span className="font-medium">{infoDialog.trainer.specialization}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b">
                <span className="text-muted-foreground">Salary</span>
                <span className="font-medium text-right">
                  {infoDialog.trainer.salary_type === "both"
                    ? `₹${infoDialog.trainer.monthly_salary}/mo + ${infoDialog.trainer.percentage_fee}%`
                    : infoDialog.trainer.session_fee > 0
                    ? `₹${infoDialog.trainer.session_fee}/session`
                    : "Not set"}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={infoDialog.trainer.is_active ? "success" : "destructive"} className="text-[10px]">
                  {infoDialog.trainer.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              {infoDialog.trainer.auth_user_id && (
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Login</span>
                  <Badge variant="outline" className="text-[10px] text-primary">Has Login</Badge>
                </div>
              )}
              {infoDialog.trainer.branch_assignments && infoDialog.trainer.branch_assignments.length > 0 && (
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Branches</span>
                  <span className="font-medium text-right">{infoDialog.trainer.branch_assignments.map(a => a.branch_name).join(", ")}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
      <StaffRoleConversionDialog
        open={conversionDialog.open}
        onOpenChange={(open) => setConversionDialog({ ...conversionDialog, open })}
        staff={conversionDialog.staff}
        direction="to_staff"
        branchId={currentBranch?.id}
        branchName={currentBranch?.name}
        onSuccess={async () => { if (onConversionSuccess) { onConversionSuccess(); } await refreshAll(); }}
      />
      <ChangePhoneDialog
        open={changePhoneDialog.open}
        onOpenChange={(open) => setChangePhoneDialog({ ...changePhoneDialog, open })}
        staff={changePhoneDialog.staff}
        branchId={currentBranch?.id}
        branchName={currentBranch?.name}
        onSuccess={refreshAll}
      />
    </div>
  );
};
