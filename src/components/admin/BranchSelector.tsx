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
import {
  BuildingOffice2Icon,
  ChevronDownIcon,
  PlusIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

export const BranchSelector = () => {
  const { branches, currentBranch, setCurrentBranch, refreshBranches } = useBranch();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newBranch, setNewBranch] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });

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
          is_default: branches.length === 0,
        })
        .select()
        .single();

      if (error) throw error;

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

  if (branches.length === 0 && !currentBranch) {
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
            className="gap-2 h-10 px-3 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BuildingOffice2Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-xs text-muted-foreground font-normal leading-none">
                Branch
              </span>
              <span className="font-semibold text-foreground truncate max-w-[140px] leading-tight">
                {currentBranch?.name || "Select"}
              </span>
            </div>
            <ChevronDownIcon className="w-4 h-4 text-muted-foreground ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 p-2">
          <div className="px-2 py-1.5 mb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Your Branches
            </p>
          </div>
          {branches.map((branch) => (
            <DropdownMenuItem
              key={branch.id}
              onSelect={(e) => {
                e.preventDefault();
                handleSelectBranch(branch);
              }}
              className={cn(
                "cursor-pointer flex items-center justify-between p-3 rounded-lg mb-1 transition-colors",
                currentBranch?.id === branch.id 
                  ? "bg-primary/10 border border-primary/20" 
                  : "hover:bg-muted"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold",
                  currentBranch?.id === branch.id 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {branch.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{branch.name}</span>
                  {branch.address && (
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {branch.address}
                    </span>
                  )}
                </div>
              </div>
              {currentBranch?.id === branch.id && (
                <CheckIcon className="w-5 h-5 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="my-2" />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              handleOpenAddDialog();
            }}
            className="cursor-pointer gap-3 p-3 rounded-lg hover:bg-accent/50"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <PlusIcon className="w-5 h-5 text-accent" />
            </div>
            <span className="font-medium">Add New Branch</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
};

export default BranchSelector;
