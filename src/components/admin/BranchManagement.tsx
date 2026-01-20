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
  StarIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

export const BranchManagement = () => {
  const { branches, currentBranch, setCurrentBranch, refreshBranches } = useBranch();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; branch: Branch | null }>({
    open: false,
    branch: null,
  });
  
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
        // Update existing branch
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
          description: `Updated branch: ${formData.name}`,
          entityType: "branches",
          entityId: editingBranch.id,
          entityName: formData.name,
          oldValue: {
            name: editingBranch.name,
            address: editingBranch.address,
            phone: editingBranch.phone,
            email: editingBranch.email,
          },
          newValue: formData,
        });

        toast.success("Branch updated successfully");
      } else {
        // Create new branch
        const { data, error } = await supabase
          .from("branches")
          .insert({
            name: formData.name.trim(),
            address: formData.address.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            is_default: branches.length === 0,
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
        if (branches.length === 0 && data) {
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

  const handleDelete = async () => {
    if (!deleteConfirm.branch) return;

    const branch = deleteConfirm.branch;

    if (branch.is_default && branches.length > 1) {
      toast.error("Cannot delete default branch", {
        description: "Please set another branch as default first",
      });
      setDeleteConfirm({ open: false, branch: null });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from("branches").delete().eq("id", branch.id);

      if (error) throw error;

      await logAdminActivity({
        category: "branch",
        type: "branch_deleted",
        description: `Deleted branch: ${branch.name}`,
        entityType: "branches",
        entityId: branch.id,
        entityName: branch.name,
        oldValue: {
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
        },
      });

      toast.success("Branch deleted successfully");
      
      // If deleted branch was current, switch to another branch
      if (currentBranch?.id === branch.id) {
        const otherBranch = branches.find(b => b.id !== branch.id);
        if (otherBranch) {
          setCurrentBranch(otherBranch);
        }
      }

      await refreshBranches();
    } catch (error: any) {
      toast.error("Failed to delete branch", { description: error.message });
    } finally {
      setIsLoading(false);
      setDeleteConfirm({ open: false, branch: null });
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
            <CardDescription>Manage gym branches and set default branch</CardDescription>
          </div>
          <Button onClick={handleOpenAdd} className="gap-2">
            <PlusIcon className="w-4 h-4" />
            Add Branch
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {branches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BuildingOffice2Icon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No branches yet</p>
            <p className="text-sm">Add your first branch to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{branch.name}</p>
                      {branch.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          Default
                        </Badge>
                      )}
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
                  {branch.is_default ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="gap-2 text-xs"
                    >
                      <StarIconSolid className="w-4 h-4 text-warning" />
                      <span>Default</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(branch)}
                      disabled={isLoading}
                      className="gap-2 text-xs hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                    >
                      <StarIcon className="w-4 h-4" />
                      <span>Set as Default</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(branch)}
                    disabled={isLoading}
                    title="Edit branch"
                  >
                    <PencilIcon className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirm({ open: true, branch })}
                    disabled={isLoading || (branch.is_default && branches.length > 1)}
                    title={branch.is_default && branches.length > 1 ? "Cannot delete default branch" : "Delete branch"}
                  >
                    <TrashIcon className="w-4 h-4 text-destructive" />
                  </Button>
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

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Delete Branch"
        description={`Are you sure you want to delete "${deleteConfirm.branch?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </Card>
  );
};

export default BranchManagement;
