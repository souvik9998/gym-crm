import { useState } from "react";
import { useBranch, type Branch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  const [isLoading, setIsLoading] = useState(false);
  const [newBranch, setNewBranch] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });

  const handleSelectBranch = (branch: Branch) => {
    setCurrentBranch(branch);
    toast.success(`Switched to ${branch.name}`);
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
          is_default: branches.length === 0, // First branch becomes default
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
      });

      toast.success("Branch added successfully");
      setNewBranch({ name: "", address: "", phone: "", email: "" });
      setIsAddDialogOpen(false);
      await refreshBranches();
      
      // Auto-select the new branch
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
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9 min-w-0 max-w-[200px]"
          >
            <BuildingOffice2Icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate hidden sm:inline">
              {currentBranch?.name || "Select Branch"}
            </span>
            <ChevronDownIcon className="w-3 h-3 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Switch Branch</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {branches.map((branch) => (
            <DropdownMenuItem
              key={branch.id}
              onClick={() => handleSelectBranch(branch)}
              className={cn(
                "cursor-pointer flex items-center justify-between",
                currentBranch?.id === branch.id && "bg-primary/10"
              )}
            >
              <div className="flex flex-col">
                <span className="font-medium">{branch.name}</span>
                {branch.address && (
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {branch.address}
                  </span>
                )}
              </div>
              {currentBranch?.id === branch.id && (
                <CheckIcon className="w-4 h-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsAddDialogOpen(true)}
            className="cursor-pointer gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            Add New Branch
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add Branch Dialog */}
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
