import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  BuildingOffice2Icon,
  ChevronDownIcon,
  PlusIcon,
  CheckIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

export const BranchSelector = () => {
  const { branches, allBranches, currentBranch, setCurrentBranch, refreshBranches, isStaffRestricted } = useBranch();
  const { isAdmin } = useIsAdmin();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newBranch, setNewBranch] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });

  // For admins, show all branches. For staff, show only their assigned branches.
  const displayBranches = isAdmin ? allBranches : branches;

  const handleSelectBranch = (branch: Branch) => {
    setCurrentBranch(branch);
    setIsDropdownOpen(false);
    toast.success(`Switched to ${branch.name}`);
  };

  const handleOpenAddDialog = () => {
    setIsDropdownOpen(false);
    setTimeout(() => {
      setIsAddDialogOpen(true);
    }, 100);
  };

  const handleAddBranch = async () => {
    if (!newBranch.name.trim()) {
      toast.error("Branch name is required");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("branches")
        .insert({
          name: newBranch.name.trim(),
          address: newBranch.address.trim() || null,
          phone: newBranch.phone.trim() || null,
          email: newBranch.email.trim() || null,
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
            gym_name: newBranch.name.trim(),
            gym_phone: newBranch.phone.trim() || null,
            gym_address: newBranch.address.trim() || null,
            whatsapp_enabled: false,
          });

        if (settingsError) {
          console.error("Failed to create gym_settings for branch:", settingsError);
        }
      }

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
      setIsAddDialogOpen(false);
      await refreshBranches();
      
      if (data) {
        setCurrentBranch(data as Branch);
      }
    } catch (error: any) {
      toast.error("Failed to add branch", { description: error.message });
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
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Branch</DialogTitle>
              <DialogDescription>
                Create a new gym branch. Each branch will have its own QR code for member registration.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="branch-name">Branch Name *</Label>
                <Input
                  id="branch-name"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  placeholder="e.g., Main Branch, Downtown Gym"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-address">Address</Label>
                <Textarea
                  id="branch-address"
                  value={newBranch.address}
                  onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
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
                    value={newBranch.phone}
                    onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch-email">Email</Label>
                  <Input
                    id="branch-email"
                    type="email"
                    value={newBranch.email}
                    onChange={(e) => setNewBranch({ ...newBranch, email: e.target.value })}
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
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Branch</DialogTitle>
              <DialogDescription>
                Create a new gym branch. Each branch will have its own QR code for member registration.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="branch-name">Branch Name *</Label>
                <Input
                  id="branch-name"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  placeholder="e.g., Main Branch, Downtown Gym"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-address">Address</Label>
                <Textarea
                  id="branch-address"
                  value={newBranch.address}
                  onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
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
                    value={newBranch.phone}
                    onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch-email">Email</Label>
                  <Input
                    id="branch-email"
                    type="email"
                    value={newBranch.email}
                    onChange={(e) => setNewBranch({ ...newBranch, email: e.target.value })}
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
    </>
  );
};

export default BranchSelector;
