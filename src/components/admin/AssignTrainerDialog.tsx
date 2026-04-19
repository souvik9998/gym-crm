import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { createMembershipIncomeEntry, calculateTrainerPercentageExpense } from "@/hooks/useLedger";
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
import { Skeleton } from "@/components/ui/skeleton";
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
  memberName,
  memberPhone,
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
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(false);
  const [isFetchingTrainers, setIsFetchingTrainers] = useState(true);
  const [isFetchingSlots, setIsFetchingSlots] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      fetchTrainers();
      const today = new Date().toISOString().split("T")[0];
      setStartDate(today);
      setEndDate(membershipEndDate || "");
      setSelectedTrainerId("");
      setSelectedTimeSlotId("");
      setMonthlyFee("");
      setNotifyWhatsApp(false);
      setTimeSlots([]);
    }
  }, [open, branchId]);

  const fetchTrainers = async () => {
    setIsFetchingTrainers(true);
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
    setIsFetchingTrainers(false);
  };

  const fetchTimeSlots = async (trainerId: string) => {
    setIsFetchingSlots(true);
    setTimeSlots([]);
    const trainer = trainers.find((t) => t.id === trainerId);
    if (!trainer?.phone) {
      setTimeSlots([]);
      setIsFetchingSlots(false);
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
      setIsFetchingSlots(false);
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
    setIsFetchingSlots(false);
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

    if (membershipEndDate && new Date(endDate) > new Date(membershipEndDate)) {
      toast.error("Trainer end date cannot exceed membership end date", {
        description: `Membership ends on ${new Date(membershipEndDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
      });
      return;
    }

    setIsLoading(true);
    try {
      if (mode === "replace" && existingPtId) {
        // 1. Deactivate the old PT subscription AND clear its time_slot_id so
        //    the slot listing (driven by pt_subscriptions.time_slot_id) no
        //    longer attributes this member to the old trainer's slot.
        await supabase
          .from("pt_subscriptions")
          .update({
            status: "inactive",
            time_slot_id: null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", existingPtId);

        // 2. Always remove the member from the OLD trainer's time_slot_members
        //    rows — regardless of whether admin picked a new slot here.
        //    Otherwise the slot UI keeps showing the member under the old
        //    trainer (out of sync with the now-inactive PT subscription).
        if (existingTrainerId) {
          const { data: oldTrainer } = await supabase
            .from("personal_trainers")
            .select("phone")
            .eq("id", existingTrainerId)
            .maybeSingle();

          if (oldTrainer?.phone) {
            const { data: oldStaff } = await supabase
              .from("staff")
              .select("id")
              .eq("phone", oldTrainer.phone)
              .eq("role", "trainer")
              .maybeSingle();

            if (oldStaff?.id) {
              const { data: oldSlots } = await supabase
                .from("trainer_time_slots")
                .select("id")
                .eq("trainer_id", oldStaff.id)
                .eq("branch_id", branchId);

              const oldSlotIds = (oldSlots || []).map((s) => s.id);
              if (oldSlotIds.length > 0) {
                await supabase
                  .from("time_slot_members")
                  .delete()
                  .eq("member_id", memberId)
                  .in("time_slot_id", oldSlotIds);
              }
            }
          }
        }
      }

      const totalFee = calculateTotalFee();

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

      const { data: insertedPt, error } = await supabase
        .from("pt_subscriptions")
        .insert(insertData)
        .select("id")
        .single();
      if (error) throw error;

      if (selectedTimeSlotId) {
        // Upsert-style: ensure no duplicate row for this (member, slot) pair
        await supabase
          .from("time_slot_members")
          .delete()
          .eq("member_id", memberId)
          .eq("time_slot_id", selectedTimeSlotId);

        await supabase.from("time_slot_members").insert({
          time_slot_id: selectedTimeSlotId,
          member_id: memberId,
          branch_id: branchId,
          assigned_by: "admin",
        });
      }

      // Record the cash payment so it appears in the Payments tab
      try {
        await supabase.from("payments").insert({
          member_id: memberId,
          subscription_id: null,
          amount: totalFee,
          payment_mode: "cash",
          status: "success",
          payment_type: "pt_subscription",
          branch_id: branchId,
          notes: `PT subscription cash payment via admin${memberName ? ` for ${memberName}` : ""}`,
        });
      } catch (payErr) {
        console.error("Payment record (PT assign) failed:", payErr);
      }

      // Ledger: PT subscription income + (optional) trainer percentage expense
      try {
        const trainerForLedger = trainers.find(t => t.id === selectedTrainerId);
        const trainerLabel = trainerForLedger?.name || "Trainer";
        await createMembershipIncomeEntry(
          totalFee,
          "pt_subscription",
          `PT subscription — ${trainerLabel}${memberName ? ` for ${memberName}` : ""}`,
          memberId,
          undefined,
          undefined,
          branchId,
        );
        await calculateTrainerPercentageExpense(
          selectedTrainerId,
          totalFee,
          memberId,
          undefined,
          insertedPt?.id,
          memberName,
          branchId,
        );
      } catch (ledgerErr) {
        console.error("Ledger entry (PT assign) failed:", ledgerErr);
      }

      if (notifyWhatsApp && memberName) {
        try {
          const selectedTrainer = trainers.find(t => t.id === selectedTrainerId);
          const trainerName = selectedTrainer?.name || "your trainer";
          const selectedSlot = timeSlots.find(s => s.id === selectedTimeSlotId);
          const slotInfo = selectedSlot 
            ? `\nTime Slot: ${formatTime(selectedSlot.start_time)} – ${formatTime(selectedSlot.end_time)}`
            : "";
          const formatDateStr = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
          const message = `Hi ${memberName}, your personal trainer *${trainerName}* has been assigned.${slotInfo}\nPeriod: ${formatDateStr(startDate)} to ${formatDateStr(endDate)}`;

          await supabase.functions.invoke("send-whatsapp", {
            body: {
              memberIds: [memberId],
              type: "custom",
              customMessage: message,
              branchId,
            },
          });
          toast.success("WhatsApp notification sent!");
        } catch (whatsAppError) {
          console.error("WhatsApp notify error:", whatsAppError);
          toast.error("Trainer assigned but WhatsApp notification failed");
        }
      }

      const selectedTrainer = trainers.find(t => t.id === selectedTrainerId);
      const trainerName = selectedTrainer?.name || "Unknown";

      // Log activity
      await logAdminActivity({
        category: mode === "assign" ? "trainers" : "trainers",
        type: mode === "assign" ? "pt_assigned" : "pt_replaced",
        description: mode === "assign"
          ? `Assigned trainer ${trainerName} to ${memberName || "member"}`
          : `Replaced trainer for ${memberName || "member"} with ${trainerName}`,
        entityType: "member",
        entityId: memberId,
        entityName: memberName || undefined,
        newValue: {
          trainer_id: selectedTrainerId,
          trainer_name: trainerName,
          start_date: startDate,
          end_date: endDate,
          monthly_fee: Number(monthlyFee),
          time_slot_id: selectedTimeSlotId || null,
        },
        branchId,
      });

      toast.success(
        mode === "assign"
          ? "Trainer assigned successfully"
          : "Trainer replaced successfully"
      );
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      // Slot/PT sync: refresh anywhere we resolve assigned-members from pt_subscriptions
      queryClient.invalidateQueries({ queryKey: ["pt-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["assigned-member-ids"] });
      queryClient.invalidateQueries({ queryKey: ["time-slot-filter"] });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to save");
    } finally {
      setIsLoading(false);
    }
  };

  const showFormFields = !isFetchingTrainers;

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
          <div className="space-y-1.5 animate-fade-in" style={{ animationDelay: "0ms" }}>
            <Label className="text-sm font-medium">Trainer</Label>
            {isFetchingTrainers ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-md" />
                <div className="flex items-center gap-2 px-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading trainers...</span>
                </div>
              </div>
            ) : (
              <Select value={selectedTrainerId} onValueChange={handleTrainerChange}>
                <SelectTrigger className="transition-all duration-200">
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

          {/* Time Slot Selection — with loading state */}
          {selectedTrainerId && (
            <div
              className="space-y-1.5 animate-fade-in"
              style={{ animationDelay: "50ms", animationFillMode: "backwards" }}
            >
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Time Slot
              </Label>
              {isFetchingSlots ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-md" />
                  <div className="flex items-center gap-2 px-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Loading time slots...</span>
                  </div>
                </div>
              ) : timeSlots.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 p-3 text-center animate-fade-in">
                  <Clock className="w-4 h-4 mx-auto mb-1 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">No time slots available for this trainer</p>
                </div>
              ) : (
                <Select value={selectedTimeSlotId} onValueChange={setSelectedTimeSlotId}>
                  <SelectTrigger className="transition-all duration-200">
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

          {/* Date & Fee Fields */}
          {showFormFields && (
            <>
              {membershipEndDate && (
                <div
                  className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs animate-fade-in"
                  style={{ animationDelay: "75ms", animationFillMode: "backwards" }}
                >
                  <span className="text-muted-foreground">Member's gym membership ends on </span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {new Date(membershipEndDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Trainer end date cannot exceed this.
                  </p>
                </div>
              )}

              <div
                className="grid grid-cols-2 gap-3 animate-fade-in"
                style={{ animationDelay: "100ms", animationFillMode: "backwards" }}
              >
                <div className="space-y-1.5">
                  <Label className="text-sm">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    max={membershipEndDate || undefined}
                    className="transition-all duration-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (membershipEndDate && val && new Date(val) > new Date(membershipEndDate)) {
                        setEndDate(membershipEndDate);
                        toast.warning("End date capped to membership end date");
                      } else {
                        setEndDate(val);
                      }
                    }}
                    min={startDate || undefined}
                    max={membershipEndDate || undefined}
                    className="transition-all duration-200"
                  />
                </div>
              </div>

              <div
                className="space-y-1.5 animate-fade-in"
                style={{ animationDelay: "150ms", animationFillMode: "backwards" }}
              >
                <Label className="text-sm">Monthly Fee (₹)</Label>
                <Input
                  type="number"
                  value={monthlyFee}
                  onChange={(e) => setMonthlyFee(e.target.value)}
                  placeholder="e.g. 2000"
                  className="transition-all duration-200"
                />
              </div>

              {monthlyFee && startDate && endDate && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm animate-fade-in">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Fee</span>
                    <span className="font-semibold">₹{calculateTotalFee().toLocaleString("en-IN")}</span>
                  </div>
                </div>
              )}

              <div
                className="flex items-center gap-2 pt-1 animate-fade-in"
                style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
              >
                <Checkbox
                  id="notify-whatsapp"
                  checked={notifyWhatsApp}
                  onCheckedChange={(checked) => setNotifyWhatsApp(checked === true)}
                  className="transition-all duration-200"
                />
                <label htmlFor="notify-whatsapp" className="text-sm flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors duration-200">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                  Notify member via WhatsApp
                </label>
              </div>

              <div
                className="flex gap-2 pt-2 animate-fade-in"
                style={{ animationDelay: "250ms", animationFillMode: "backwards" }}
              >
                <Button variant="outline" className="flex-1 transition-all duration-200" onClick={() => onOpenChange(false)} disabled={isLoading}>
                  Cancel
                </Button>
                <Button className="flex-1 transition-all duration-200" onClick={handleSubmit} disabled={isLoading || !selectedTrainerId}>
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {mode === "assign" ? "Assign" : "Replace"}
                </Button>
              </div>
            </>
          )}

          {/* Full skeleton when trainers are loading */}
          {isFetchingTrainers && (
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-10 flex-1 rounded-md" />
                <Skeleton className="h-10 flex-1 rounded-md" />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
