import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { ArrowsRightLeftIcon, ClockIcon } from "@heroicons/react/24/outline";
import { Loader2 } from "lucide-react";

interface TransferTarget {
  slot_id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  current_count: number;
}

interface TransferSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The slot the member is currently in (will be excluded from the picker). */
  currentSlotId: string;
  /** Slot row id (time_slot_members.id) — used for the row update. */
  slotMemberRowId?: string | null;
  /** Optional PT subscription id for direct source-of-truth updates. */
  ptSubscriptionId?: string | null;
  /** Member identity for messaging. */
  memberId: string;
  memberName: string;
  /** The member's CURRENT active PT trainer (personal_trainers.id). Required. */
  currentPtTrainerId: string;
  currentPtTrainerName: string;
  branchId: string;
  /** Refetch parent list after transfer. */
  onTransferred: () => void;
}

const formatTime = (t: string) => {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
};

/**
 * Same-trainer-only slot transfer.
 *
 * Lists all `trainer_time_slots` whose owner staff resolves (by phone) to the
 * given `currentPtTrainerId`. The selected target replaces the current slot
 * for both `time_slot_members` and the member's active PT subscription record.
 *
 * No PT subscription is created or deactivated; no billing impact.
 */
export const TransferSlotDialog = ({
  open,
  onOpenChange,
  currentSlotId,
  slotMemberRowId,
  ptSubscriptionId = null,
  memberId,
  memberName,
  currentPtTrainerId,
  currentPtTrainerName,
  branchId,
  onTransferred,
}: TransferSlotDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<TransferTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const { invalidatePtSubscriptions } = useInvalidateQueries();

  useEffect(() => {
    if (!open) {
      setSelectedTarget(null);
      return;
    }
    loadTargetSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentPtTrainerId, branchId]);

  const loadTargetSlots = async () => {
    setLoading(true);
    try {
      // 1. Resolve trainer phone → staff IDs (a trainer profile can map to a staff row by phone).
      const { data: ptRow } = await supabase
        .from("personal_trainers")
        .select("phone")
        .eq("id", currentPtTrainerId)
        .maybeSingle();

      if (!ptRow?.phone) {
        setTargets([]);
        return;
      }

      const { data: staffRows } = await supabase
        .from("staff" as any)
        .select("id")
        .eq("phone", ptRow.phone)
        .eq("is_active", true);

      const staffIds = ((staffRows as any[]) || []).map((s) => s.id);
      if (staffIds.length === 0) {
        setTargets([]);
        return;
      }

      // 2. All trainer_time_slots owned by those staff IDs in this branch.
      const { data: slotData } = await supabase
        .from("trainer_time_slots")
        .select("id, start_time, end_time, capacity")
        .in("trainer_id", staffIds)
        .eq("branch_id", branchId)
        .neq("id", currentSlotId)
        .order("start_time");

      const slots = (slotData || []) as Array<{
        id: string;
        start_time: string;
        end_time: string;
        capacity: number;
      }>;

      if (slots.length === 0) {
        setTargets([]);
        return;
      }

      // 3. Current member counts per slot.
      const slotIds = slots.map((s) => s.id);
      const today = new Date().toISOString().split("T")[0];
      const { data: counts } = await supabase
        .from("pt_subscriptions")
        .select("time_slot_id, member_id, status, end_date")
        .in("time_slot_id", slotIds);

      const countMap = new Map<string, Set<string>>();
      ((counts as any[]) || [])
        .filter((row) => row.time_slot_id)
        .filter((row) => row.status === "active" && row.end_date >= today)
        .forEach((row: any) => {
          if (!countMap.has(row.time_slot_id)) countMap.set(row.time_slot_id, new Set());
          countMap.get(row.time_slot_id)?.add(row.member_id);
        });

      setTargets(
        slots.map((s) => ({
          slot_id: s.id,
          start_time: s.start_time,
          end_time: s.end_time,
          capacity: s.capacity,
          current_count: countMap.get(s.id)?.size || 0,
        })),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedTarget) return;
    setIsTransferring(true);
    try {
      const ptUpdate = ptSubscriptionId
        ? supabase
            .from("pt_subscriptions")
            .update({ time_slot_id: selectedTarget } as any)
            .eq("id", ptSubscriptionId)
        : supabase
            .from("pt_subscriptions")
            .update({ time_slot_id: selectedTarget } as any)
            .eq("member_id", memberId)
            .eq("personal_trainer_id", currentPtTrainerId)
            .eq("status", "active");

      const { error: ptErr } = await ptUpdate;
      if (ptErr) {
        toast.error("Failed to transfer member", { description: ptErr.message });
        return;
      }

      const { data: existingSlotRow } = await supabase
        .from("time_slot_members")
        .select("id")
        .eq("member_id", memberId)
        .eq("time_slot_id", currentSlotId)
        .maybeSingle();

      const rowIdToUpdate = slotMemberRowId || existingSlotRow?.id;
      const rowMutation = rowIdToUpdate
        ? supabase
            .from("time_slot_members")
            .update({ time_slot_id: selectedTarget })
            .eq("id", rowIdToUpdate)
        : supabase.from("time_slot_members").insert({
            time_slot_id: selectedTarget,
            member_id: memberId,
            branch_id: branchId,
            assigned_by: "admin",
          } as any);

      const { error: tsmErr } = await rowMutation;
      if (tsmErr) {
        toast.error("Transferred PT, but slot sync failed", { description: tsmErr.message });
        return;
      }

      const target = targets.find((t) => t.slot_id === selectedTarget);
      const slotLabel = target
        ? `${formatTime(target.start_time)} – ${formatTime(target.end_time)}`
        : "new slot";

      await logAdminActivity({
        category: "time_slots",
        type: "time_slot_member_added",
        description: `Transferred ${memberName} to ${currentPtTrainerName}'s ${slotLabel} slot`,
        entityType: "member",
        entityId: memberId,
        entityName: memberName,
        oldValue: { time_slot_id: currentSlotId },
        newValue: { time_slot_id: selectedTarget, trainer: currentPtTrainerName },
        branchId,
      });

      toast.success(`${memberName} moved to ${slotLabel}`, {
        description: `Stays with ${currentPtTrainerName}`,
      });
      onTransferred();
      invalidatePtSubscriptions();
      onOpenChange(false);
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0">
        <div className="px-5 pt-5 pb-3 border-b border-border/40">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <ArrowsRightLeftIcon className="w-4 h-4 text-primary" />
              Transfer Slot
            </DialogTitle>
            <DialogDescription className="text-xs mt-1">
              Move <strong>{memberName}</strong> to another time slot under{" "}
              <strong>{currentPtTrainerName}</strong>. PT subscription stays the same.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 py-3 space-y-2 max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-2 py-1">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/60 p-3 animate-pulse"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-muted" />
                    <div className="space-y-2">
                      <div className="h-3 w-28 rounded bg-muted" />
                      <div className="h-2.5 w-20 rounded bg-muted/80" />
                    </div>
                  </div>
                  <div className="h-5 w-14 rounded-full bg-muted" />
                </div>
              ))}
            </div>
          ) : targets.length === 0 ? (
            <div className="text-center py-8">
              <ClockIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">
                No other slots available
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                {currentPtTrainerName} has no other time slots in this branch.
              </p>
            </div>
          ) : (
            targets.map((t) => {
              const isFull = t.current_count >= t.capacity;
              const isSelected = selectedTarget === t.slot_id;
              return (
                <button
                  key={t.slot_id}
                  type="button"
                  disabled={isFull}
                  onClick={() => !isFull && setSelectedTarget(t.slot_id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                    isFull
                      ? "opacity-50 cursor-not-allowed bg-muted/30"
                      : isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      <ClockIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {formatTime(t.start_time)} – {formatTime(t.end_time)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.current_count}/{t.capacity} members
                      </p>
                    </div>
                  </div>
                  {isFull ? (
                    <Badge className="bg-destructive/10 text-destructive text-[10px] border-0">
                      Full
                    </Badge>
                  ) : isSelected ? (
                    <Badge className="bg-primary text-primary-foreground text-[10px] border-0">
                      Selected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      {t.capacity - t.current_count} open
                    </Badge>
                  )}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border/40">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isTransferring}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleTransfer}
            disabled={!selectedTarget || isTransferring}
            className="gap-1.5"
          >
            {isTransferring && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirm Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
