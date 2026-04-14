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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Dumbbell, Loader2, Clock, MessageCircle } from "lucide-react";

interface Trainer {
  id: string;
  name: string;
  monthly_fee: number;
  specialization: string | null;
  phone: string | null;
}

interface TimeSlot {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  current_count: number;
}

interface AssignTrainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName?: string;
  memberPhone?: string;
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
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    if (open) {
      fetchTrainers();
      const today = new Date().toISOString().split("T")[0];
      setStartDate(today);
      setEndDate(membershipEndDate || "");
      setSelectedTrainerId("");
      setSelectedTimeSlotId("");
      setMonthlyFee("");
      setTimeSlots([]);
    }
  }, [open, branchId]);

  const fetchTrainers = async () => {
    setIsFetching(true);
    const { data } = await supabase
      .from("personal_trainers")
      .select("id, name, monthly_fee, specialization, phone")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("name");

    if (data) {
      const filtered = existingTrainerId
        ? data.filter((t) => t.id !== existingTrainerId)
        : data;
      setTrainers(filtered);
    }
    setIsFetching(false);
  };

  const fetchTimeSlots = async (trainerId: string) => {
    // trainer_time_slots.trainer_id references staff.id, not personal_trainers.id
    // Look up the staff ID via phone number match
    const trainer = trainers.find((t) => t.id === trainerId);
    if (!trainer?.phone) {
      setTimeSlots([]);
      return;
    }

    const { data: staffData } = await supabase
      .from("staff")
      .select("id")
      .eq("phone", trainer.phone)
      .eq("role", "trainer")
      .eq("is_active", true)
      .maybeSingle();

    if (!staffData) {
      setTimeSlots([]);
      return;
    }

    const { data: slots } = await supabase
      .from("trainer_time_slots")
      .select("id, start_time, end_time, capacity")
      .eq("trainer_id", staffData.id)
      .eq("branch_id", branchId);

    if (slots) {
      const slotsWithCounts: TimeSlot[] = await Promise.all(
        slots.map(async (slot) => {
          const { count } = await supabase
            .from("time_slot_members")
            .select("*", { count: "exact", head: true })
            .eq("time_slot_id", slot.id);
          return { ...slot, current_count: count || 0 };
        })
      );
      setTimeSlots(slotsWithCounts);
    } else {
      setTimeSlots([]);
    }
  };

  const handleTrainerChange = (trainerId: string) => {
    setSelectedTrainerId(trainerId);
    setSelectedTimeSlotId("");
    const trainer = trainers.find((t) => t.id === trainerId);
    if (trainer) {
      setMonthlyFee(trainer.monthly_fee.toString());
    }
    fetchTimeSlots(trainerId);
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
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

      // Create new PT subscription with time slot
      const insertData: any = {
        member_id: memberId,
        personal_trainer_id: selectedTrainerId,
        branch_id: branchId,
        start_date: startDate,
        end_date: endDate,
        monthly_fee: Number(monthlyFee),
        total_fee: totalFee,
        status: "active",
      };

      if (selectedTimeSlotId) {
        insertData.time_slot_id = selectedTimeSlotId;
      }

      const { error } = await supabase.from("pt_subscriptions").insert(insertData);
      if (error) throw error;

      // Also add member to time_slot_members if slot selected
      if (selectedTimeSlotId) {
        await supabase.from("time_slot_members").insert({
          time_slot_id: selectedTimeSlotId,
          member_id: memberId,
          branch_id: branchId,
          assigned_by: "admin",
        });
      }

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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Dumbbell className="w-4 h-4 text-accent" />
            {mode === "assign" ? "Assign Trainer" : "Replace Trainer"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === "assign"
              ? "Select a trainer, time slot, and set the training period"
              : "Choose a new trainer to replace the current one"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Trainer Selection */}
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

          {/* Time Slot Selection */}
          {selectedTrainerId && (
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Time Slot
              </Label>
              {timeSlots.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">No time slots available for this trainer</p>
              ) : (
                <Select value={selectedTimeSlotId} onValueChange={setSelectedTimeSlotId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time slot (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((slot) => {
                      const isFull = slot.current_count >= slot.capacity;
                      return (
                        <SelectItem key={slot.id} value={slot.id} disabled={isFull}>
                          <span>{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</span>
                          <span className={`ml-2 ${isFull ? "text-destructive" : "text-muted-foreground"}`}>
                            ({slot.current_count}/{slot.capacity}{isFull ? " Full" : ""})
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

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
