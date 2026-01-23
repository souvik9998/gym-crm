import { useState, useEffect } from "react";
import { useBranch, type Branch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStaffOperations } from "@/hooks/useStaffOperations";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BuildingOffice2Icon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

export const BranchManagement = () => {
  const { branches, allBranches, currentBranch, setCurrentBranch, refreshBranches, isStaffRestricted } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const staffOps = useStaffOperations();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; branch: Branch | null }>({
    open: false,
    branch: null,
  });
  const [finalDeleteConfirm, setFinalDeleteConfirm] = useState<{ open: boolean; branch: Branch | null }>({
    open: false,
    branch: null,
  });
  
  // For admins, show all branches. For staff, show only their assigned branches.
  const displayBranches = isAdmin ? allBranches : branches;
  
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });

  const resetForm = () => {
    setFormData({ name: "", address: "", phone: "", email: "" });
  };

  const handleOpenAdd = () => {
    resetForm();
    setEditingBranch(null);
    setIsAddDialogOpen(true);
  };

  const handleOpenEdit = (branch: Branch) => {
    setFormData({
      name: branch.name,
      address: branch.address || "",
      phone: branch.phone || "",
      email: branch.email || "",
    });
    setEditingBranch(branch);
    setIsAddDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Branch name is required");
      return;
    }

    setIsLoading(true);
    try {
      if (editingBranch) {
        // Use staff operations if staff is logged in
        if (isStaffLoggedIn) {
          const { error } = await staffOps.updateBranch({
            branchId: editingBranch.id,
            name: formData.name.trim(),
            address: formData.address.trim() || undefined,
            phone: formData.phone.trim() || undefined,
            email: formData.email.trim() || undefined,
          });

          if (error) {
            toast.error("Failed to update branch", { description: error });
            setIsLoading(false);
            return;
          }

          toast.success("Branch updated successfully");
          
          // If the updated branch is the current branch, update currentBranch state
          if (editingBranch.id === currentBranch?.id) {
            const updatedBranch = {
              ...currentBranch,
              name: formData.name.trim(),
              address: formData.address.trim() || null,
              phone: formData.phone.trim() || null,
              email: formData.email.trim() || null,
            };
            setCurrentBranch(updatedBranch);
          }
        } else {
          // Admin flow - Update existing branch
          const { error } = await supabase
            .from("branches")
            .update({
              name: formData.name.trim(),
              address: formData.address.trim() || null,
              phone: formData.phone.trim() || null,
              email: formData.email.trim() || null,
            })
            .eq("id", editingBranch.id);

          if (error) throw error;

          await logAdminActivity({
            category: "branch",
            type: "branch_updated",
            description: `Updated branch: ${formData.name.trim()}`,
            entityType: "branches",
            entityId: editingBranch.id,
            entityName: formData.name.trim(),
            oldValue: {
              name: editingBranch.name,
              address: editingBranch.address || null,
              phone: editingBranch.phone || null,
              email: editingBranch.email || null,
            },
            newValue: {
              name: formData.name.trim(),
              address: formData.address.trim() || null,
              phone: formData.phone.trim() || null,
              email: formData.email.trim() || null,
            },
            branchId: editingBranch.id,
          });

          toast.success("Branch updated successfully");
          
          // If the updated branch is the current branch, update currentBranch state
          if (editingBranch.id === currentBranch?.id) {
            const updatedBranch = {
              ...currentBranch,
              name: formData.name.trim(),
              address: formData.address.trim() || null,
              phone: formData.phone.trim() || null,
              email: formData.email.trim() || null,
            };
            setCurrentBranch(updatedBranch);
          }
        }
      } else {
        // Staff cannot create new branches - only admins can
        if (isStaffLoggedIn && !isAdmin) {
          toast.error("Only admins can create new branches");
          setIsLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("branches")
          .insert({
            name: formData.name.trim(),
            address: formData.address.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            is_default: displayBranches.length === 0,
          })
          .select()
          .single();

        if (error) throw error;

        // Auto-create gym_settings for the new branch
        if (data) {
          const { error: settingsError } = await supabase
            .from("gym_settings")
            .insert({
              branch_id: data.id,
              gym_name: formData.name.trim(),
              gym_phone: formData.phone.trim() || null,
              gym_address: formData.address.trim() || null,
              whatsapp_enabled: false,
            });

          if (settingsError) {
            console.error("Failed to create gym_settings for branch:", settingsError);
          }
        }

        await logAdminActivity({
          category: "branch",
          type: "branch_created",
          description: `Created new branch: ${formData.name}`,
          entityType: "branches",
          entityId: data.id,
          entityName: formData.name,
          newValue: formData,
          branchId: data.id,
        });

        toast.success("Branch added successfully");
        
        // Auto-select if first branch
        if (displayBranches.length === 0 && data) {
          setCurrentBranch(data as Branch);
        }
      }

      setIsAddDialogOpen(false);
      resetForm();
      setEditingBranch(null);
      await refreshBranches();
    } catch (error: any) {
      toast.error("Failed to save branch", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDefault = async (branch: Branch) => {
    if (branch.is_default) return;

    setIsLoading(true);
    try {
      // First, unset all defaults
      await supabase.from("branches").update({ is_default: false }).neq("id", "placeholder");
      
      // Then set the selected branch as default
      const { error } = await supabase
        .from("branches")
        .update({ is_default: true })
        .eq("id", branch.id);

      if (error) throw error;

      await logAdminActivity({
        category: "branch",
        type: "branch_default_set",
        description: `Set ${branch.name} as default branch`,
        entityType: "branches",
        entityId: branch.id,
        entityName: branch.name,
        branchId: branch.id,
      });

      toast.success(`${branch.name} is now the default branch`);
      await refreshBranches();
      
      // Auto-switch to the newly set default branch
      setCurrentBranch(branch);
    } catch (error: any) {
      toast.error("Failed to set default branch", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  // First confirmation handler - triggers second confirmation
  const handleFirstDeleteConfirm = () => {
    if (!deleteConfirm.branch) return;
    
    const branch = deleteConfirm.branch;

    if (branch.is_default && displayBranches.length > 1) {
      toast.error("Cannot delete default branch", {
        description: "Please set another branch as default first",
      });
      setDeleteConfirm({ open: false, branch: null });
      return;
    }
    
    // Close first dialog and open second (final) confirmation
    setDeleteConfirm({ open: false, branch: null });
    setFinalDeleteConfirm({ open: true, branch });
  };

  // Final delete handler - Soft delete (set deleted_at instead of actual delete)
  const handleFinalDelete = async () => {
    if (!finalDeleteConfirm.branch) return;

    const branch = finalDeleteConfirm.branch;

    setIsLoading(true);
    try {
      // Soft delete: set deleted_at timestamp instead of actually deleting
      const { error } = await supabase
        .from("branches")
        .update({ 
          deleted_at: new Date().toISOString(),
          is_active: false 
        })
        .eq("id", branch.id);

      if (error) throw error;

      await logAdminActivity({
        category: "branch",
        type: "branch_deleted",
        description: `Soft deleted branch: ${branch.name}`,
        entityType: "branches",
        entityId: branch.id,
        entityName: branch.name,
        oldValue: {
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
          deleted_at: null,
        },
        newValue: {
          deleted_at: new Date().toISOString(),
          is_active: false,
        },
        branchId: currentBranch?.id || branch.id,
      });

      toast.success("Branch deleted successfully", {
        description: "All related data has been preserved for reporting purposes.",
      });
      
      // If deleted branch was current, switch to another active branch
      if (currentBranch?.id === branch.id) {
        const otherBranch = displayBranches.find(b => b.id !== branch.id && !b.deleted_at);
        if (otherBranch) {
          setCurrentBranch(otherBranch);
        }
      }

      await refreshBranches();
    } catch (error: any) {
      toast.error("Failed to delete branch", { description: error.message });
    } finally {
      setIsLoading(false);
      setFinalDeleteConfirm({ open: false, branch: null });
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BuildingOffice2Icon className="w-5 h-5 text-primary" />
              Gym Branches
            </CardTitle>
            <CardDescription>
              {isStaffLoggedIn && !isAdmin
                ? "View and edit branch details for your assigned branches" 
                : "Manage gym branches"}
            </CardDescription>
          </div>
          {/* Show Add Branch button for admins (not for staff) */}
          {(!isStaffLoggedIn || isAdmin) && (
            <Button onClick={handleOpenAdd} className="gap-2">
              <PlusIcon className="w-4 h-4" />
              Add Branch
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {displayBranches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BuildingOffice2Icon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No branches yet</p>
            <p className="text-sm">Add your first branch to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayBranches.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{branch.name}</p>
                      {currentBranch?.id === branch.id && (
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      {branch.address && <p>{branch.address}</p>}
                      <div className="flex gap-3">
                        {branch.phone && <span>{branch.phone}</span>}
                        {branch.email && <span>{branch.email}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(branch)}
                    disabled={isLoading}
                    title="Edit branch"
                  >
                    <PencilIcon className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  {/* Show delete button for admins (not for staff) */}
                  {(!isStaffLoggedIn || isAdmin) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm({ open: true, branch })}
                      disabled={isLoading || (branch.is_default && displayBranches.length > 1)}
                      title={branch.is_default && displayBranches.length > 1 ? "Cannot delete default branch" : "Delete branch"}
                    >
                      <TrashIcon className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add/Edit Branch Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingBranch ? "Edit Branch" : "Add New Branch"}</DialogTitle>
            <DialogDescription>
              {editingBranch
                ? "Update the branch details below."
                : "Create a new gym branch. Each branch will have its own QR code for member registration."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="branch-name">Branch Name *</Label>
              <Input
                id="branch-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Main Branch, Downtown Gym"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">Address</Label>
              <Textarea
                id="branch-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Full address of the branch"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch-phone">Phone</Label>
                <Input
                  id="branch-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-email">Email</Label>
                <Input
                  id="branch-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Email address"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setEditingBranch(null);
                resetForm();
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? "Saving..." : editingBranch ? "Save Changes" : "Add Branch"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* First Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Delete Branch"
        description={`Are you sure you want to delete "${deleteConfirm.branch?.name}"? This action cannot be undone and will remove all associated data.`}
        confirmText="Yes, Delete"
        variant="destructive"
        onConfirm={handleFirstDeleteConfirm}
      />

      {/* Final Delete Confirmation (Double Confirmation) */}
      <ConfirmDialog
        open={finalDeleteConfirm.open}
        onOpenChange={(open) => setFinalDeleteConfirm({ ...finalDeleteConfirm, open })}
        title="⚠️ Final Confirmation"
        description={`This is your FINAL confirmation. Deleting "${finalDeleteConfirm.branch?.name}" will permanently remove all members, payments, packages, and settings associated with this branch. Are you absolutely sure?`}
        confirmText="Delete Permanently"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleFinalDelete}
      />
    </Card>
  );
};

export default BranchManagement;
