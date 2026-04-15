import { useState } from "react";
import { LimitReachedDialog } from "@/components/admin/LimitReachedDialog";
import { useBranch, type Branch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ValidatedInput } from "@/components/ui/validated-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nameSchema, phoneSchema, optionalEmailSchema } from "@/lib/validation";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { createBranchAsOwner } from "@/api/branches/ownerBranches";
import {
  BuildingOffice2Icon,
  ChevronDownIcon,
  PlusIcon,
  CheckIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

export const BranchSelector = () => {
  const { branches, allBranches, currentBranch, setCurrentBranch, refreshBranches, isStaffRestricted, tenantId } = useBranch();
  const { isAdmin, isGymOwner } = useIsAdmin();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [limitDialog, setLimitDialog] = useState<{ open: boolean; max: number; current: number }>({
    open: false, max: 0, current: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [newBranch, setNewBranch] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  // For admins, show all branches. For staff, show only their assigned branches.
  const displayBranches = isAdmin ? allBranches : branches;

  const handleSelectBranch = (branch: Branch) => {
    setCurrentBranch(branch);
    setIsDropdownOpen(false);
    toast.success(`Switched to ${branch.name}`);
  };

  const handleOpenAddDialog = async () => {
    setIsDropdownOpen(false);
    // Check branch limit first
    if (tenantId) {
      try {
        const { data: canAdd } = await supabase.rpc("tenant_can_add_resource", {
          _tenant_id: tenantId,
          _resource_type: "branch",
        });
        if (canAdd !== true) {
          const { data: limits } = await supabase
            .from("tenant_limits")
            .select("max_branches")
            .eq("tenant_id", tenantId)
            .single();
          setTimeout(() => {
            setLimitDialog({
              open: true,
              max: limits?.max_branches ?? 0,
              current: displayBranches.length,
            });
          }, 100);
          return;
        }
      } catch (err) {
        console.error("Limit check failed:", err);
      }
    }
    setTimeout(() => {
      setIsAddDialogOpen(true);
    }, 100);
  };

  const validateFields = (): boolean => {
    const errors: Record<string, string | undefined> = {};
    const nameResult = nameSchema.safeParse(newBranch.name);
    if (!nameResult.success) errors.name = nameResult.error.errors[0]?.message;
    if (!newBranch.address.trim() || newBranch.address.trim().length < 3) {
      errors.address = "Address is required (min 3 characters)";
    }
    const phoneResult = phoneSchema.safeParse(newBranch.phone);
    if (!newBranch.phone.trim()) {
      errors.phone = "Phone number is required";
    } else if (!phoneResult.success) {
      errors.phone = phoneResult.error.errors[0]?.message;
    }
    if (newBranch.email.trim()) {
      const emailResult = optionalEmailSchema.safeParse(newBranch.email);
      if (!emailResult.success) errors.email = emailResult.error.errors[0]?.message;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddBranch = async () => {
    if (!validateFields()) return;

    setIsLoading(true);
    try {
      // Gym owners create branches via backend function (enforces tenant limits and avoids RLS failures)
      let data: any;
      if (isGymOwner) {
        data = await createBranchAsOwner({
          name: newBranch.name.trim(),
          address: newBranch.address.trim() || null,
          phone: newBranch.phone.trim() || null,
          email: newBranch.email.trim() || null,
          isDefault: displayBranches.length === 0,
        });
      } else {
        // Admin/super admin direct insert must include tenant_id to satisfy RLS
        if (!tenantId) {
          throw new Error("No organization selected. Please select an organization first.");
        }

        const { data: created, error } = await supabase
          .from("branches")
          .insert({
            name: newBranch.name.trim(),
            slug: '',
            address: newBranch.address.trim() || null,
            phone: newBranch.phone.trim() || null,
            email: newBranch.email.trim() || null,
            is_default: displayBranches.length === 0,
            tenant_id: tenantId,
          })
          .select()
          .single();

        if (error) throw error;
        data = created;

        // Auto-create gym_settings only for direct-insert path (owner-create-branch already does this)
        if (data) {
          const { error: settingsError } = await supabase
            .from("gym_settings")
            .insert({
              branch_id: data.id,
              gym_name: newBranch.name.trim(),
              gym_phone: newBranch.phone.trim() || null,
              gym_address: newBranch.address.trim() || null,
              whatsapp_enabled: false,
            });

          if (settingsError) {
            console.error("Failed to create gym_settings for branch:", settingsError);
          }
        }
      }

      if (!data) throw new Error("Failed to create branch");

      await logAdminActivity({
        category: "branch",
        type: "branch_created",
        description: `Created new branch: ${newBranch.name}`,
        entityType: "branches",
        entityId: data.id,
        entityName: newBranch.name,
        newValue: newBranch,
        branchId: data.id,
      });

      toast.success("Branch added successfully");
      setNewBranch({ name: "", address: "", phone: "", email: "" });
      setFieldErrors({});
      setIsAddDialogOpen(false);
      await refreshBranches();
      
      if (data) {
        setCurrentBranch(data as Branch);
      }
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
        toast.error("Failed to add branch", { description: msg });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // For staff with only one branch, show a simpler view (but not for admins)
  if (isStaffRestricted && !isAdmin && displayBranches.length === 1) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 border border-border/50 rounded-md bg-muted/30">
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <BuildingOffice2Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex flex-col items-start flex-1 min-w-0">
          <span className="text-xs text-muted-foreground font-normal leading-none">
            Branch
          </span>
          <span className="font-semibold text-foreground leading-tight truncate w-full text-left">
            {currentBranch?.name || displayBranches[0]?.name}
          </span>
        </div>
        <LockClosedIcon className="w-4 h-4 text-muted-foreground" title="Assigned to this branch" />
      </div>
    );
  }

  if (displayBranches.length === 0 && !currentBranch) {
    // Don't show add button for staff users (but allow for admins)
    if (isStaffRestricted && !isAdmin) {
      return (
        <div className="flex items-center gap-2 h-10 px-3 border border-destructive/30 rounded-md bg-destructive/5">
          <BuildingOffice2Icon className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive">No branch assigned</span>
        </div>
      );
    }
    
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAddDialogOpen(true)}
          className="gap-2 h-9"
        >
          <BuildingOffice2Icon className="w-4 h-4" />
          <span className="hidden sm:inline">Add Branch</span>
          <PlusIcon className="w-3 h-3 sm:hidden" />
        </Button>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[460px] p-5 md:p-6">
            <DialogHeader className="pb-2">
              <DialogTitle>Add New Branch</DialogTitle>
              <DialogDescription>
                Fields marked with * are required.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="branch-name-empty">Branch Name *</Label>
                <ValidatedInput
                  id="branch-name-empty"
                  value={newBranch.name}
                  onChange={(e) => { setNewBranch({ ...newBranch, name: e.target.value }); if (fieldErrors.name) setFieldErrors(p => ({ ...p, name: undefined })); }}
                  error={fieldErrors.name}
                  placeholder="e.g., Main Branch, Downtown Gym"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="branch-address-empty">Address *</Label>
                <Textarea
                  id="branch-address-empty"
                  value={newBranch.address}
                  onChange={(e) => { setNewBranch({ ...newBranch, address: e.target.value }); if (fieldErrors.address) setFieldErrors(p => ({ ...p, address: undefined })); }}
                  placeholder="Full address of the branch"
                  rows={2}
                  className={fieldErrors.address ? "border-destructive" : ""}
                />
                {fieldErrors.address && <p className="text-xs font-medium text-destructive mt-1 px-1">{fieldErrors.address}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="branch-phone-empty">Phone *</Label>
                  <ValidatedInput
                    id="branch-phone-empty"
                    type="tel"
                    value={newBranch.phone}
                    onChange={(e) => { setNewBranch({ ...newBranch, phone: e.target.value }); if (fieldErrors.phone) setFieldErrors(p => ({ ...p, phone: undefined })); }}
                    error={fieldErrors.phone}
                    placeholder="10-digit number"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="branch-email-empty">Email <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                  <ValidatedInput
                    id="branch-email-empty"
                    type="email"
                    value={newBranch.email}
                    onChange={(e) => { setNewBranch({ ...newBranch, email: e.target.value }); if (fieldErrors.email) setFieldErrors(p => ({ ...p, email: undefined })); }}
                    error={fieldErrors.email}
                    placeholder="Email address"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button onClick={handleAddBranch} disabled={isLoading}>
                {isLoading ? "Adding..." : "Add Branch"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 h-10 px-3 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all w-[200px] justify-start"
          >
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <BuildingOffice2Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col items-start flex-1 min-w-0">
              <span className="text-xs text-muted-foreground font-normal leading-none">
                Branch
              </span>
              <span className="font-semibold text-foreground leading-tight truncate w-full text-left">
                {currentBranch?.name || "Select Branch"}
              </span>
            </div>
            <ChevronDownIcon className="w-4 h-4 text-muted-foreground ml-auto flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px] p-1 bg-white dark:bg-card border shadow-lg">
          {/* Show restricted indicator for staff (not for admins) */}
          {isStaffRestricted && !isAdmin && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-b mb-1 flex items-center gap-2">
              <LockClosedIcon className="w-3 h-3" />
              <span>Assigned branches only</span>
            </div>
          )}
          
          {displayBranches.map((branch) => (
            <DropdownMenuItem
              key={branch.id}
              onSelect={(e) => {
                e.preventDefault();
                handleSelectBranch(branch);
              }}
              className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted focus:bg-muted transition-colors"
            >
              <div className="w-8 h-8 rounded-md bg-foreground flex items-center justify-center text-sm font-semibold text-background flex-shrink-0">
                {branch.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-medium text-foreground truncate text-sm">{branch.name}</span>
                {branch.address && (
                  <span className="text-xs text-muted-foreground truncate">
                    {branch.address}
                  </span>
                )}
              </div>
              {currentBranch?.id === branch.id && (
                <CheckIcon className="w-4 h-4 text-primary flex-shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          
          {/* Show "Add New Branch" for admins (not for staff) */}
          {(!isStaffRestricted || isAdmin) && (
            <>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  handleOpenAddDialog();
                }}
                className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-primary/10 focus:bg-primary/10 transition-colors"
              >
                <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0">
                  <PlusIcon className="w-5 h-5 text-primary" />
                </div>
                <span className="font-medium text-sm text-primary">Add New Branch</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add branch dialog - for admins (not for staff) */}
      {(!isStaffRestricted || isAdmin) && (
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[460px] p-5 md:p-6">
            <DialogHeader className="pb-2">
              <DialogTitle>Add New Branch</DialogTitle>
              <DialogDescription>
                Fields marked with * are required.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="sel-branch-name">Branch Name *</Label>
                <ValidatedInput
                  id="sel-branch-name"
                  value={newBranch.name}
                  onChange={(e) => { setNewBranch({ ...newBranch, name: e.target.value }); if (fieldErrors.name) setFieldErrors(p => ({ ...p, name: undefined })); }}
                  error={fieldErrors.name}
                  placeholder="e.g., Main Branch, Downtown Gym"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sel-branch-address">Address *</Label>
                <Textarea
                  id="sel-branch-address"
                  value={newBranch.address}
                  onChange={(e) => { setNewBranch({ ...newBranch, address: e.target.value }); if (fieldErrors.address) setFieldErrors(p => ({ ...p, address: undefined })); }}
                  placeholder="Full address of the branch"
                  rows={2}
                  className={fieldErrors.address ? "border-destructive" : ""}
                />
                {fieldErrors.address && <p className="text-xs font-medium text-destructive mt-1 px-1">{fieldErrors.address}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sel-branch-phone">Phone *</Label>
                  <ValidatedInput
                    id="sel-branch-phone"
                    type="tel"
                    value={newBranch.phone}
                    onChange={(e) => { setNewBranch({ ...newBranch, phone: e.target.value }); if (fieldErrors.phone) setFieldErrors(p => ({ ...p, phone: undefined })); }}
                    error={fieldErrors.phone}
                    placeholder="10-digit number"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sel-branch-email">Email <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                  <ValidatedInput
                    id="sel-branch-email"
                    type="email"
                    value={newBranch.email}
                    onChange={(e) => { setNewBranch({ ...newBranch, email: e.target.value }); if (fieldErrors.email) setFieldErrors(p => ({ ...p, email: undefined })); }}
                    error={fieldErrors.email}
                    placeholder="Email address"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button onClick={handleAddBranch} disabled={isLoading}>
                {isLoading ? "Adding..." : "Add Branch"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <LimitReachedDialog
        open={limitDialog.open}
        onOpenChange={(open) => setLimitDialog({ ...limitDialog, open })}
        resourceType="Branches"
        currentCount={limitDialog.current}
        maxCount={limitDialog.max}
      />
    </>
  );
};

export default BranchSelector;
