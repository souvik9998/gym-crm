import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StaffBranchSelector } from "./StaffBranchSelector";
import { toast } from "@/components/ui/sonner";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { BuildingOfficeIcon } from "@heroicons/react/24/outline";
import { Staff } from "@/pages/admin/StaffManagement";

interface StaffBranchAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: Staff | null;
  branches: Array<{ id: string; name: string; is_active?: boolean }>;
  onSuccess: () => void;
}

export const StaffBranchAssignmentDialog = ({
  open,
  onOpenChange,
  staff,
  branches,
  onSuccess,
}: StaffBranchAssignmentDialogProps) => {
  const { currentBranch } = useBranch();
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (staff && open) {
      // Initialize with current branch assignments
      const currentAssignments = staff.branch_assignments?.map((a) => a.branch_id) || [];
      setSelectedBranches(currentAssignments);
    }
  }, [staff, open]);

  const handleSave = async () => {
    if (!staff) return;

    setIsLoading(true);
    try {
      // Get current assignments
      const { data: currentAssignments } = await supabase
        .from("staff_branch_assignments")
        .select("*")
        .eq("staff_id", staff.id);

      const currentBranchIds = currentAssignments?.map((a) => a.branch_id) || [];
      
      // Find branches to add and remove
      const branchesToAdd = selectedBranches.filter((id) => !currentBranchIds.includes(id));
      const branchesToRemove = currentBranchIds.filter((id) => !selectedBranches.includes(id));

      // Remove assignments
      if (branchesToRemove.length > 0) {
        await supabase
          .from("staff_branch_assignments")
          .delete()
          .eq("staff_id", staff.id)
          .in("branch_id", branchesToRemove);
      }

      // Add new assignments
      if (branchesToAdd.length > 0) {
        // Check if there's already a primary branch
        const hasPrimary = currentAssignments?.some((a) => a.is_primary) || false;
        
        const newAssignments = branchesToAdd.map((branchId, index) => ({
          staff_id: staff.id,
          branch_id: branchId,
          is_primary: !hasPrimary && index === 0, // Set first new branch as primary if no primary exists
        }));

        await supabase.from("staff_branch_assignments").insert(newAssignments);
      }

      // Get branch names for logging
      const addedBranchNames = branchesToAdd
        .map((id) => branches.find((b) => b.id === id)?.name)
        .filter(Boolean);
      const removedBranchNames = branchesToRemove
        .map((id) => branches.find((b) => b.id === id)?.name)
        .filter(Boolean);

      await logAdminActivity({
        category: "staff",
        type: "staff_updated",
        description: `Updated branch assignments for "${staff.full_name}"${addedBranchNames.length > 0 ? ` - Added: ${addedBranchNames.join(", ")}` : ""}${removedBranchNames.length > 0 ? ` - Removed: ${removedBranchNames.join(", ")}` : ""}`,
        entityType: "staff",
        entityId: staff.id,
        entityName: staff.full_name,
        oldValue: { branch_assignments: currentBranchIds },
        newValue: { branch_assignments: selectedBranches },
        branchId: currentBranch?.id,
      });

      toast.success("Branch assignments updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating branch assignments:", error);
      toast.error("Failed to update branch assignments", {
        description: error.message || "An error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!staff) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-4 md:p-3">
        <DialogHeader className="pb-2 md:pb-2">
          <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
            <BuildingOfficeIcon className="w-4 h-4 md:w-5 md:h-5" />
            Manage Branch Assignments
          </DialogTitle>
          <DialogDescription className="text-xs md:text-sm">
            Assign "{staff.full_name}" to one or more branches. The staff member will have access to all selected branches.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 md:space-y-2 py-2 md:py-3">
          <div className="space-y-2">
            <Label>Select Branches</Label>
            <StaffBranchSelector
              branches={branches}
              selectedBranches={selectedBranches}
              onChange={setSelectedBranches}
            />
            {selectedBranches.length === 0 && (
              <p className="text-sm text-muted-foreground">
                If no branches are selected, the staff member will be assigned to the current branch by default.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
