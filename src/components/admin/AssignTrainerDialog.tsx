import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Dumbbell, Loader2 } from "lucide-react";

interface Trainer {
  id: string;
  name: string;
  monthly_fee: number;
  specialization: string | null;
}

interface AssignTrainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  branchId: string;
  mode: "assign" | "replace";
  existingPtId?: string;
  existingTrainerId?: string;
  membershipEndDate?: string;
  onSuccess: () => void;
}

export const AssignTrainerDialog = ({
  open,
  onOpenChange,
  memberId,
  branchId,
  mode,
  existingPtId,
  existingTrainerId,
  membershipEndDate,
  onSuccess,
}: AssignTrainerDialogProps) => {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    if (open) {
      fetchTrainers();
      // Default dates
      const today = new Date().toISOString().split("T")[0];
      setStartDate(today);
      setEndDate(membershipEndDate || "");
      setSelectedTrainerId("");
      setMonthlyFee("");
    }
  }, [open, branchId]);

  const fetchTrainers = async () => {
    setIsFetching(true);
    const { data } = await supabase
      .from("personal_trainers")
      .select("id, name, monthly_fee, specialization")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("name");

    if (data) {
      // Filter out existing trainer in replace mode
      const filtered = existingTrainerId
        ? data.filter((t) => t.id !== existingTrainerId)
        : data;
      setTrainers(filtered);
    }
    setIsFetching(false);
  };

  const handleTrainerChange = (trainerId: string) => {
    setSelectedTrainerId(trainerId);
    const trainer = trainers.find((t) => t.id === trainerId);
    if (trainer) {
      setMonthlyFee(trainer.monthly_fee.toString());
    }
  };

  const calculateTotalFee = () => {
    if (!startDate || !endDate || !monthlyFee) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    return months * Number(monthlyFee);
  };

  const handleSubmit = async () => {
    if (!selectedTrainerId || !startDate || !endDate || !monthlyFee) {
      toast.error("Please fill all fields");
      return;
    }

    if (new Date(endDate) <= new Date(startDate)) {
      toast.error("End date must be after start date");
      return;
    }

    setIsLoading(true);
    try {
      // If replacing, mark old PT as inactive
      if (mode === "replace" && existingPtId) {
        await supabase
          .from("pt_subscriptions")
          .update({ status: "inactive", updated_at: new Date().toISOString() })
          .eq("id", existingPtId);
      }

      const totalFee = calculateTotalFee();

      // Create new PT subscription
      const { error } = await supabase.from("pt_subscriptions").insert({
        member_id: memberId,
        personal_trainer_id: selectedTrainerId,
        branch_id: branchId,
        start_date: startDate,
        end_date: endDate,
        monthly_fee: Number(monthlyFee),
        total_fee: totalFee,
        status: "active",
      });

      if (error) throw error;

      toast.success(
        mode === "assign"
          ? "Trainer assigned successfully"
          : "Trainer replaced successfully"
      );
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to save");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Dumbbell className="w-4 h-4 text-accent" />
            {mode === "assign" ? "Assign Trainer" : "Replace Trainer"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === "assign"
              ? "Select a trainer and set the training period"
              : "Choose a new trainer to replace the current one"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Trainer</Label>
            {isFetching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading trainers...
              </div>
            ) : (
              <Select value={selectedTrainerId} onValueChange={handleTrainerChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trainer" />
                </SelectTrigger>
                <SelectContent>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span>{t.name}</span>
                      {t.specialization && (
                        <span className="text-muted-foreground ml-1">• {t.specialization}</span>
                      )}
                      <span className="text-muted-foreground ml-1">— ₹{t.monthly_fee}/mo</span>
                    </SelectItem>
                  ))}
                  {trainers.length === 0 && (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                      No trainers available
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Monthly Fee (₹)</Label>
            <Input
              type="number"
              value={monthlyFee}
              onChange={(e) => setMonthlyFee(e.target.value)}
              placeholder="e.g. 2000"
            />
          </div>

          {monthlyFee && startDate && endDate && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Fee</span>
                <span className="font-semibold">₹{calculateTotalFee().toLocaleString("en-IN")}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isLoading || !selectedTrainerId}>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {mode === "assign" ? "Assign" : "Replace"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
