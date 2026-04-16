import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ArrowRightLeft } from "lucide-react";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import type { Staff } from "@/pages/admin/StaffManagement";

interface StaffRoleConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: Staff | null;
  direction: "to_trainer" | "to_staff";
  branchId: string | undefined;
  branchName?: string;
  onSuccess: () => void;
}

const STAFF_ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  reception: "Reception",
  accountant: "Accountant",
};

export const StaffRoleConversionDialog = ({
  open,
  onOpenChange,
  staff,
  direction,
  branchId,
  branchName,
  onSuccess,
}: StaffRoleConversionDialogProps) => {
  const [isConverting, setIsConverting] = useState(false);

  // To Trainer fields
  const [paymentCategory, setPaymentCategory] = useState<"monthly_percentage" | "session_basis">("monthly_percentage");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [percentageFee, setPercentageFee] = useState("");
  const [sessionFee, setSessionFee] = useState("");
  const [specialization, setSpecialization] = useState("");

  // To Staff fields
  const [newRole, setNewRole] = useState<"manager" | "reception" | "accountant">("reception");
  const [newMonthlySalary, setNewMonthlySalary] = useState("");

  // Reset form when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && staff) {
      if (direction === "to_trainer") {
        setMonthlySalary(String(staff.monthly_salary || 0));
        setPercentageFee(String(staff.percentage_fee || 0));
        setSessionFee(String(staff.session_fee || 0));
        setMonthlyFee("");
        setSpecialization(staff.specialization || "");
        setPaymentCategory("monthly_percentage");
      } else {
        setNewRole("reception");
        setNewMonthlySalary(String(staff.monthly_salary || 0));
      }
    }
    onOpenChange(isOpen);
  };

  const handleConvertToTrainer = async () => {
    if (!staff || !branchId) return;
    setIsConverting(true);

    try {
      // 1. Update staff role to trainer
      const { error: updateError } = await supabase
        .from("staff")
        .update({
          role: "trainer" as any,
          salary_type: paymentCategory === "monthly_percentage" ? "both" : "session_based",
          monthly_salary: Number(monthlySalary) || 0,
          session_fee: Number(sessionFee) || 0,
          percentage_fee: Number(percentageFee) || 0,
          specialization: specialization || null,
        })
        .eq("id", staff.id);

      if (updateError) throw updateError;

      // 2. Get all branch assignments for this staff
      const { data: assignments } = await supabase
        .from("staff_branch_assignments")
        .select("branch_id")
        .eq("staff_id", staff.id);

      const assignedBranchIds = assignments?.map((a) => a.branch_id) || [];
      if (assignedBranchIds.length === 0) {
        assignedBranchIds.push(branchId);
      }

      // 3. Create personal_trainers entry for each assigned branch (check for existing first)
      for (const bid of assignedBranchIds) {
        // Check if already exists
        const { data: existing } = await supabase
          .from("personal_trainers")
          .select("id")
          .eq("phone", staff.phone)
          .eq("branch_id", bid)
          .maybeSingle();

        if (existing) {
          // Reactivate existing entry
          await supabase
            .from("personal_trainers")
            .update({
              name: staff.full_name,
              is_active: true,
              specialization: specialization || null,
              monthly_fee: Number(monthlyFee) || 0,
              monthly_salary: Number(monthlySalary) || 0,
              percentage_fee: Number(percentageFee) || 0,
              session_fee: Number(sessionFee) || 0,
              payment_category: paymentCategory === "monthly_percentage" ? "monthly_percentage" : "session_basis",
            })
            .eq("id", existing.id);
        } else {
          // Create new entry
          await supabase.from("personal_trainers").insert({
            name: staff.full_name,
            phone: staff.phone || null,
            branch_id: bid,
            is_active: true,
            specialization: specialization || null,
            monthly_fee: Number(monthlyFee) || 0,
            monthly_salary: Number(monthlySalary) || 0,
            percentage_fee: Number(percentageFee) || 0,
            session_fee: Number(sessionFee) || 0,
            payment_category: paymentCategory === "monthly_percentage" ? "monthly_percentage" : "session_basis",
          });
        }
      }

      await logAdminActivity({
        category: "staff",
        type: "staff_role_converted",
        description: `Converted "${staff.full_name}" from ${STAFF_ROLE_LABELS[staff.role] || staff.role} to Trainer`,
        entityType: "staff",
        entityId: staff.id,
        entityName: staff.full_name,
        oldValue: { role: staff.role },
        newValue: { role: "trainer", payment_category: paymentCategory },
        branchId,
      });

      toast.success(`${staff.full_name} converted to Trainer`, {
        description: "They will now appear in the Trainers tab and can be assigned to members.",
      });

      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error("Conversion failed", { description: err.message });
    } finally {
      setIsConverting(false);
    }
  };

  const handleConvertToStaff = async () => {
    if (!staff || !branchId) return;
    setIsConverting(true);

    try {
      // 1. Update staff role
      const { error: updateError } = await supabase
        .from("staff")
        .update({
          role: newRole as any,
          salary_type: "monthly",
          monthly_salary: Number(newMonthlySalary) || 0,
          session_fee: 0,
          percentage_fee: 0,
        })
        .eq("id", staff.id);

      if (updateError) throw updateError;

      // 2. Deactivate personal_trainers entries (don't delete - preserves history)
      if (staff.phone) {
        await supabase
          .from("personal_trainers")
          .update({ is_active: false })
          .eq("phone", staff.phone);
      }

      await logAdminActivity({
        category: "staff",
        type: "staff_role_converted",
        description: `Converted "${staff.full_name}" from Trainer to ${STAFF_ROLE_LABELS[newRole]}`,
        entityType: "staff",
        entityId: staff.id,
        entityName: staff.full_name,
        oldValue: { role: "trainer" },
        newValue: { role: newRole },
        branchId,
      });

      toast.success(`${staff.full_name} converted to ${STAFF_ROLE_LABELS[newRole]}`, {
        description: "Their trainer profile has been deactivated. They will now appear in the Other Staff tab.",
      });

      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error("Conversion failed", { description: err.message });
    } finally {
      setIsConverting(false);
    }
  };

  if (!staff) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            {direction === "to_trainer" ? "Convert to Trainer" : "Convert to Staff"}
          </DialogTitle>
          <DialogDescription>
            {direction === "to_trainer"
              ? `Convert "${staff.full_name}" from ${STAFF_ROLE_LABELS[staff.role] || staff.role} to a Trainer. They will appear in the Trainers tab and can be assigned to members for PT.`
              : `Convert "${staff.full_name}" from Trainer to a staff role. Their trainer profile will be deactivated (existing PT subscriptions remain intact).`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current Role Display */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">Current Role:</span>
            <Badge variant="outline">{direction === "to_trainer" ? (STAFF_ROLE_LABELS[staff.role] || staff.role) : "Trainer"}</Badge>
            <span className="text-muted-foreground">→</span>
            <Badge className="bg-primary/10 text-primary border-primary/20">
              {direction === "to_trainer" ? "Trainer" : STAFF_ROLE_LABELS[newRole]}
            </Badge>
          </div>

          {direction === "to_trainer" ? (
            <>
              <div className="space-y-2">
                <Label className="text-sm">Specialization</Label>
                <Input
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="e.g., Weight Training, Yoga"
                  className="h-9"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Payment Category</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={paymentCategory === "monthly_percentage"}
                      onChange={() => setPaymentCategory("monthly_percentage")}
                      className="accent-primary"
                    />
                    <span className="text-sm">Monthly + Percentage</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={paymentCategory === "session_basis"}
                      onChange={() => setPaymentCategory("session_basis")}
                      className="accent-primary"
                    />
                    <span className="text-sm">Session Basis</span>
                  </label>
                </div>
              </div>

              {paymentCategory === "monthly_percentage" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Monthly Salary (₹)</Label>
                    <Input
                      type="number"
                      value={monthlySalary}
                      onChange={(e) => setMonthlySalary(e.target.value)}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Percentage Fee (%)</Label>
                    <Input
                      type="number"
                      value={percentageFee}
                      onChange={(e) => setPercentageFee(e.target.value)}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Monthly Fee to Members (₹)</Label>
                    <Input
                      type="number"
                      value={monthlyFee}
                      onChange={(e) => setMonthlyFee(e.target.value)}
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Session Fee (₹)</Label>
                  <Input
                    type="number"
                    value={sessionFee}
                    onChange={(e) => setSessionFee(e.target.value)}
                    placeholder="0"
                    className="h-9"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-sm">New Role</Label>
                <Select value={newRole} onValueChange={(v: any) => setNewRole(v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                  value={newMonthlySalary}
                  onChange={(e) => setNewMonthlySalary(e.target.value)}
                  placeholder="0"
                  className="h-9"
                />
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">Note:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-xs">
                  <li>Their trainer profile will be <strong>deactivated</strong> (not deleted)</li>
                  <li>Existing PT subscriptions and history are preserved</li>
                  <li>They will no longer appear as an assignable trainer for members</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConverting}>
            Cancel
          </Button>
          <Button
            onClick={direction === "to_trainer" ? handleConvertToTrainer : handleConvertToStaff}
            disabled={isConverting}
          >
            {isConverting ? (
              <>
                <ButtonSpinner /> Converting...
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4 mr-1.5" />
                Convert to {direction === "to_trainer" ? "Trainer" : STAFF_ROLE_LABELS[newRole]}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
