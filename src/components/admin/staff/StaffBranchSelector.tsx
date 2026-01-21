import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface StaffBranchSelectorProps {
  branches: Array<{ id: string; name: string; is_active?: boolean }>;
  selectedBranches: string[];
  onChange: (selected: string[]) => void;
}

export const StaffBranchSelector = ({
  branches,
  selectedBranches,
  onChange,
}: StaffBranchSelectorProps) => {
  const activeBranches = branches.filter((b) => b.is_active !== false);

  const handleToggle = (branchId: string) => {
    if (selectedBranches.includes(branchId)) {
      onChange(selectedBranches.filter((id) => id !== branchId));
    } else {
      onChange([...selectedBranches, branchId]);
    }
  };

  if (activeBranches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No branches available. Staff will be assigned to the current branch.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {activeBranches.map((branch) => (
        <div
          key={branch.id}
          className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg"
        >
          <Checkbox
            id={`branch-${branch.id}`}
            checked={selectedBranches.includes(branch.id)}
            onCheckedChange={() => handleToggle(branch.id)}
          />
          <Label
            htmlFor={`branch-${branch.id}`}
            className="text-sm cursor-pointer"
          >
            {branch.name}
          </Label>
        </div>
      ))}
    </div>
  );
};
