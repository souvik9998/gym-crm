import { useState, useEffect, useRef } from "react";
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
import { createBranchAsOwner } from "@/api/branches/ownerBranches";
import { LimitReachedDialog } from "@/components/admin/LimitReachedDialog";
import { BranchLogo } from "./BranchLogo";
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
  CameraIcon,
} from "@heroicons/react/24/outline";

export const BranchManagement = () => {
  const { branches, allBranches, currentBranch, setCurrentBranch, refreshBranches, isStaffRestricted, tenantId } = useBranch();
  const { isStaffLoggedIn } = useStaffAuth();
  const { isAdmin, isGymOwner } = useIsAdmin();
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
  const [limitDialog, setLimitDialog] = useState<{ open: boolean; max: number; current: number }>({
    open: false, max: 0, current: 0,
  });
  
  // For admins, show all branches. For staff, show only their assigned branches.
  const displayBranches = isAdmin ? allBranches : branches;
  
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setFormData({ name: "", address: "", phone: "", email: "" });
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleOpenAdd = async () => {
    // Check branch limit before opening dialog
    if (tenantId) {
      try {
        const { data } = await supabase.rpc("tenant_can_add_resource", {
          _tenant_id: tenantId,
          _resource_type: "branch",
        });
        if (data !== true) {
          // Fetch limits for dialog
          const { data: limits } = await supabase
            .from("tenant_limits")
            .select("max_branches")
            .eq("tenant_id", tenantId)
            .single();
          setLimitDialog({
            open: true,
            max: limits?.max_branches ?? 0,
            current: displayBranches.length,
          });
          return;
        }
      } catch (err) {
        console.error("Limit check failed:", err);
      }
    }
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
    setLogoPreview(branch.logo_url || null);
    setLogoFile(null);
    setEditingBranch(branch);
    setIsAddDialogOpen(true);
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (branchId: string): Promise<string | null> => {
    if (!logoFile) return null;
    setIsUploadingLogo(true);
    try {
      const ext = logoFile.name.split(".").pop() || "png";
      const path = `${branchId}/logo.${ext}`;
      const { error } = await supabase.storage
        .from("branch-logos")
        .upload(path, logoFile, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("branch-logos").getPublicUrl(path);
      // Append timestamp to bust cache
      return urlData.publicUrl + `?t=${Date.now()}`;
    } catch (err: any) {
      console.error("Logo upload error:", err);
      toast.error("Failed to upload logo");
      return null;
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Branch name is required");
      return;
    }
    if (!editingBranch && !formData.address.trim()) {
      toast.error("Address is required");
      return;
    }
    if (!editingBranch && !formData.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    setIsLoading(true);
    try {
      if (editingBranch) {
        // Upload logo if a new file was selected
        let newLogoUrl = editingBranch.logo_url;
        if (logoFile) {
          const uploaded = await uploadLogo(editingBranch.id);
          if (uploaded) newLogoUrl = uploaded;
        }

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

          // Update logo_url separately (staff ops may not support it)
          if (logoFile && newLogoUrl) {
            await supabase.from("branches").update({ logo_url: newLogoUrl }).eq("id", editingBranch.id);
          }

          toast.success("Branch updated successfully");
          
          if (editingBranch.id === currentBranch?.id) {
            setCurrentBranch({
              ...currentBranch,
              name: formData.name.trim(),
              address: formData.address.trim() || null,
              phone: formData.phone.trim() || null,
              email: formData.email.trim() || null,
              logo_url: newLogoUrl || null,
            });
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
              logo_url: newLogoUrl || null,
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
          
          if (editingBranch.id === currentBranch?.id) {
            setCurrentBranch({
              ...currentBranch,
              name: formData.name.trim(),
              address: formData.address.trim() || null,
              phone: formData.phone.trim() || null,
              email: formData.email.trim() || null,
              logo_url: newLogoUrl || null,
            });
          }
        }
      } else {
        // Staff cannot create new branches - only admins can
        if (isStaffLoggedIn && !isAdmin) {
          toast.error("Only admins can create new branches");
          setIsLoading(false);
          return;
        }
        
        // Gym owners must have a tenant_id
        if (!tenantId) {
          toast.error("Unable to create branch", {
            description: "No organization found. Please contact support.",
          });
          setIsLoading(false);
          return;
        }
        
        // For gym owners, create via backend function to enforce limits and avoid RLS write failures
        // Double-check limit before calling the edge function
        if (tenantId) {
          const { data: canAdd, error: limitErr } = await supabase.rpc("tenant_can_add_resource", {
            _tenant_id: tenantId,
            _resource_type: "branch",
          });
          console.log("Branch limit check:", { canAdd, limitErr });
          if (canAdd !== true) {
            const { data: limits } = await supabase
              .from("tenant_limits")
              .select("max_branches")
              .eq("tenant_id", tenantId)
              .single();
            setLimitDialog({
              open: true,
              max: limits?.max_branches ?? 0,
              current: displayBranches.length,
            });
            setIsLoading(false);
            setIsAddDialogOpen(false);
            return;
          }
        }

        let data: any;
        if (isGymOwner) {
          data = await createBranchAsOwner({
            name: formData.name.trim(),
            address: formData.address.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            isDefault: displayBranches.length === 0,
          });
        } else {
          const { data: created, error } = await supabase
            .from("branches")
            .insert({
              name: formData.name.trim(),
              address: formData.address.trim() || null,
              phone: formData.phone.trim() || null,
              email: formData.email.trim() || null,
              is_default: displayBranches.length === 0,
              tenant_id: tenantId,
            })
            .select()
            .single();

          if (error) throw error;
          data = created;
        }

        if (!data) throw new Error("Failed to create branch");

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

        // Upload logo if provided
        if (logoFile && data?.id) {
          const logoUrl = await uploadLogo(data.id);
          if (logoUrl) {
            await supabase.from("branches").update({ logo_url: logoUrl }).eq("id", data.id);
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
      const msg = error?.message || "";
      if (msg.toLowerCase().includes("limit")) {
        try {
          if (tenantId) {
            const { data: limits } = await supabase
              .from("tenant_limits")
              .select("max_branches")
              .eq("tenant_id", tenantId)
              .single();
            setLimitDialog({
              open: true,
              max: limits?.max_branches ?? 0,
              current: displayBranches.length,
            });
            setIsAddDialogOpen(false);
          } else {
            toast.error("Branch limit reached", { description: "Please upgrade your plan or contact support." });
          }
        } catch {
          toast.error("Branch limit reached", { description: "Please upgrade your plan or contact support." });
        }
      } else {
        toast.error("Failed to save branch", { description: msg });
      }
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
        description: `Deleted branch: ${branch.name}`,
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
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
              <BuildingOffice2Icon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
              Gym Branches
            </CardTitle>
            <CardDescription className="text-xs lg:text-sm">
              {isStaffLoggedIn && !isAdmin
                ? "View and edit branch details for your assigned branches" 
                : "Manage gym branches"}
            </CardDescription>
          </div>
          {/* Show Add Branch button for admins (not for staff) */}
          {(!isStaffLoggedIn || isAdmin) && (
            <Button onClick={handleOpenAdd} className="gap-1.5 lg:gap-2 h-8 lg:h-10 text-xs lg:text-sm px-3 lg:px-4">
              <PlusIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              Add Branch
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
        {displayBranches.length === 0 ? (
          <div className="text-center py-6 lg:py-8 text-muted-foreground">
            <BuildingOffice2Icon className="w-10 h-10 lg:w-12 lg:h-12 mx-auto mb-2 lg:mb-3 opacity-50" />
            <p className="font-medium text-sm lg:text-base">No branches yet</p>
            <p className="text-xs lg:text-sm">Add your first branch to get started</p>
          </div>
        ) : (
          <div className="space-y-2 lg:space-y-3">
            {displayBranches.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center justify-between p-3 lg:p-4 bg-muted/50 rounded-lg gap-2"
              >
                <div className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1">
                  <BranchLogo logoUrl={branch.logo_url} name={branch.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
                      <p className="font-medium text-sm lg:text-base truncate">{branch.name}</p>
                      {currentBranch?.id === branch.id && (
                        <Badge variant="outline" className="text-[10px] lg:text-xs bg-primary/10 text-primary border-primary/30 shrink-0">
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs lg:text-sm text-muted-foreground space-y-0.5">
                      {branch.address && <p className="truncate">{branch.address}</p>}
                      <div className="flex gap-2 lg:gap-3">
                        {branch.phone && <span className="text-[11px] lg:text-sm">{branch.phone}</span>}
                        {branch.email && <span className="text-[11px] lg:text-sm hidden sm:inline">{branch.email}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 lg:gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(branch)}
                    disabled={isLoading}
                    title="Edit branch"
                    className="h-8 w-8 lg:h-10 lg:w-10"
                  >
                    <PencilIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-muted-foreground" />
                  </Button>
                  {/* Show delete button for admins (not for staff) */}
                  {(!isStaffLoggedIn || isAdmin) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm({ open: true, branch })}
                      disabled={isLoading || (branch.is_default && displayBranches.length > 1)}
                      title={branch.is_default && displayBranches.length > 1 ? "Cannot delete default branch" : "Delete branch"}
                      className="h-8 w-8 lg:h-10 lg:w-10"
                    >
                      <TrashIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-destructive" />
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
        <DialogContent className="sm:max-w-[425px] p-4 md:p-3">
          <DialogHeader className="pb-2 md:pb-2">
            <DialogTitle className="text-base md:text-lg">{editingBranch ? "Edit Branch" : "Add New Branch"}</DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              {editingBranch
                ? "Update the branch details below."
                : "Create a new gym branch. Each branch will have its own QR code for member registration."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 md:space-y-2 py-2 md:py-3">
            {/* Logo Upload */}
            <div className="flex items-center gap-4">
              <div className="relative cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                <BranchLogo
                  logoUrl={logoPreview}
                  name={formData.name || "New"}
                  size="lg"
                />
                <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <CameraIcon className="w-5 h-5 text-white" />
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoSelect}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Branch Logo</p>
                <p>Click to upload (max 2MB)</p>
              </div>
            </div>
            <div className="space-y-1.5 md:space-y-2">
              <Label htmlFor="branch-name">Branch Name *</Label>
              <Input
                id="branch-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Main Branch, Downtown Gym"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">Address {!editingBranch && "*"}</Label>
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
                <Label htmlFor="branch-phone">Phone {!editingBranch && "*"}</Label>
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
                  placeholder="Email address (optional)"
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
            <Button onClick={handleSave} disabled={isLoading || isUploadingLogo}>
              {isLoading || isUploadingLogo ? "Saving..." : editingBranch ? "Save Changes" : "Add Branch"}
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

      {/* Limit Reached Dialog */}
      <LimitReachedDialog
        open={limitDialog.open}
        onOpenChange={(open) => setLimitDialog({ ...limitDialog, open })}
        resourceType="Branches"
        currentCount={limitDialog.current}
        maxCount={limitDialog.max}
      />
    </Card>
  );
};

export default BranchManagement;
