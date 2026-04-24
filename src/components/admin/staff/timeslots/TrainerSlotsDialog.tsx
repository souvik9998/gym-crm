import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClockIcon,
  UserGroupIcon,
  PencilIcon,
  TrashIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { TimeSlotDetailDialog } from "./TimeSlotDetailDialog";

export interface TrainerSlotForDialog {
  id: string;
  trainer_id: string;
  trainer_name?: string;
  start_time: string;
  end_time: string;
  capacity: number;
  is_recurring: boolean;
  recurring_days: number[] | null;
  member_count?: number;
  status?: string;
  branch_id?: string;
  created_at?: string;
}

interface TrainerSlotsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainerName: string;
  trainerId: string;
  slots: TrainerSlotForDialog[];
  branchId: string;
  onUpdated: () => void;
  onAddSlot?: (trainerId: string) => void;
  onEditSlot?: (slot: TrainerSlotForDialog) => void;
  onDeleteSlot?: (slot: TrainerSlotForDialog) => void;
  canCreate?: boolean;
  canEditDelete?: boolean;
  canViewMembers?: boolean;
  canAssignMembers?: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatTime = (t: string) => {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

/**
 * Trainer-centric slots dialog.
 *
 * Lists every slot for a single trainer in one place. Clicking a row opens
 * the existing TimeSlotDetailDialog so the full member-management UX is
 * preserved without duplication.
 */
export const TrainerSlotsDialog = ({
  open,
  onOpenChange,
  trainerName,
  trainerId,
  slots,
  branchId,
  onUpdated,
  onAddSlot,
  onEditSlot,
  onDeleteSlot,
  canCreate = true,
  canEditDelete = true,
  canViewMembers = true,
  canAssignMembers = true,
}: TrainerSlotsDialogProps) => {
  const [activeSlot, setActiveSlot] = useState<TrainerSlotForDialog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Sort by start_time so trainers see chronological order.
  const sorted = useMemo(
    () => [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [slots],
  );

  const totals = useMemo(() => {
    const cap = sorted.reduce((s, x) => s + x.capacity, 0);
    const filled = sorted.reduce((s, x) => s + (x.member_count || 0), 0);
    const full = sorted.filter((x) => (x.member_count || 0) >= x.capacity).length;
    return { cap, filled, full, count: sorted.length };
  }, [sorted]);

  const utilization =
    totals.cap > 0 ? Math.round((totals.filled / totals.cap) * 100) : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="p-5 pb-4 border-b bg-gradient-to-br from-primary/5 via-background to-background">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <UserGroupIcon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="truncate">{trainerName}</span>
                </DialogTitle>
                <DialogDescription className="text-xs mt-1.5 ml-10">
                  {totals.count} {totals.count === 1 ? "slot" : "slots"} •{" "}
                  <span className="font-medium text-foreground">{totals.filled}</span>
                  /{totals.cap} seats filled •{" "}
                  <span className="font-medium text-foreground">{utilization}%</span>{" "}
                  utilization
                </DialogDescription>
              </div>
              {canCreate && onAddSlot && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 shrink-0"
                  onClick={() => onAddSlot(trainerId)}
                >
                  <PlusIcon className="w-3.5 h-3.5" /> Add Slot
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="overflow-y-auto p-4 space-y-2.5">
            {sorted.length === 0 ? (
              <div className="py-12 text-center">
                <ClockIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">
                  No time slots for this trainer yet
                </p>
              </div>
            ) : (
              sorted.map((slot) => {
                const filled = slot.member_count || 0;
                const isFull = filled >= slot.capacity;
                const isEmpty = filled === 0;
                const fillPct = Math.min((filled / slot.capacity) * 100, 100);

                const accent = isFull
                  ? {
                      bar: "bg-red-500",
                      bg: "bg-red-50/70 dark:bg-red-950/20",
                      text: "text-red-700 dark:text-red-300",
                      border: "border-red-200 dark:border-red-900/50",
                      badge: "bg-red-500 text-white",
                      badgeLabel: "Full",
                    }
                  : fillPct >= 70
                  ? {
                      bar: "bg-amber-500",
                      bg: "bg-amber-50/60 dark:bg-amber-950/20",
                      text: "text-amber-800 dark:text-amber-300",
                      border: "border-amber-200 dark:border-amber-900/50",
                      badge: "bg-amber-500 text-white",
                      badgeLabel: "Filling",
                    }
                  : isEmpty
                  ? {
                      bar: "bg-muted-foreground/30",
                      bg: "bg-card",
                      text: "text-muted-foreground",
                      border: "border-border",
                      badge:
                        "bg-muted text-muted-foreground border border-border",
                      badgeLabel: "Empty",
                    }
                  : {
                      bar: "bg-emerald-500",
                      bg: "bg-card",
                      text: "text-foreground",
                      border: "border-emerald-200 dark:border-emerald-900/50",
                      badge:
                        "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300",
                      badgeLabel: "Available",
                    };

                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => {
                      if (!canViewMembers) return;
                      setActiveSlot(slot);
                      setDetailOpen(true);
                    }}
                    className={cn(
                      "w-full text-left rounded-xl border-2 p-3.5 transition-all",
                      "hover:shadow-md hover:-translate-y-0.5 group",
                      accent.bg,
                      accent.border,
                      canViewMembers ? "cursor-pointer" : "cursor-default",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold flex items-center gap-1.5">
                            <ClockIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            {formatTime(slot.start_time)} –{" "}
                            {formatTime(slot.end_time)}
                          </span>
                          <Badge
                            className={cn(
                              "text-[10px] border-0 font-medium",
                              accent.badge,
                            )}
                          >
                            {accent.badgeLabel}
                          </Badge>
                          {slot.is_recurring ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal"
                            >
                              Recurring
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal"
                            >
                              One-time
                            </Badge>
                          )}
                        </div>

                        {slot.is_recurring &&
                          slot.recurring_days &&
                          slot.recurring_days.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {DAY_LABELS.map((label, d) => (
                                <span
                                  key={d}
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                    slot.recurring_days?.includes(d)
                                      ? "bg-primary/15 text-primary"
                                      : "bg-muted text-muted-foreground/50",
                                  )}
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}

                        <div className="mt-2.5 flex items-center gap-3">
                          <div className="flex-1 max-w-[180px]">
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  accent.bar,
                                )}
                                style={{ width: `${fillPct}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-baseline gap-1 shrink-0">
                            <span
                              className={cn(
                                "text-base font-bold tabular-nums leading-none",
                                accent.text,
                              )}
                            >
                              {filled}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              /{slot.capacity}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-1">
                              members
                            </span>
                          </div>
                        </div>
                      </div>

                      {canEditDelete && (onEditSlot || onDeleteSlot) && (
                        <div
                          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {onEditSlot && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditSlot(slot);
                              }}
                              aria-label="Edit slot"
                            >
                              <PencilIcon className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {onDeleteSlot && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSlot(slot);
                              }}
                              aria-label="Delete slot"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      )}

                      {canViewMembers && (
                        <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reuse the existing single-slot detail dialog for member management. */}
      <TimeSlotDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        slot={
          activeSlot
            ? {
                id: activeSlot.id,
                trainer_id: activeSlot.trainer_id,
                trainer_name: activeSlot.trainer_name || trainerName,
                start_time: activeSlot.start_time,
                end_time: activeSlot.end_time,
                capacity: activeSlot.capacity,
                is_recurring: activeSlot.is_recurring,
                recurring_days: activeSlot.recurring_days,
                member_count: activeSlot.member_count || 0,
              }
            : null
        }
        branchId={branchId}
        onUpdated={onUpdated}
        canEditSlot={canEditDelete}
        canAssignMembers={canAssignMembers}
        canRemoveMembers={canEditDelete}
      />
    </>
  );
};
