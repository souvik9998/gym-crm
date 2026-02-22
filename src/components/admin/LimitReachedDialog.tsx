import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LimitReachedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: string;
  currentCount: number;
  maxCount: number;
}

export function LimitReachedDialog({
  open,
  onOpenChange,
  resourceType,
  currentCount,
  maxCount,
}: LimitReachedDialogProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-lg">
              {resourceType} Limit Reached
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            You've reached the maximum of <strong>{maxCount} {resourceType.toLowerCase()}</strong> allowed
            on your current plan ({currentCount}/{maxCount} used). To add more, please upgrade your
            package or contact your platform administrator.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate("/admin/settings?tab=plan");
            }}
          >
            View Plan Details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
