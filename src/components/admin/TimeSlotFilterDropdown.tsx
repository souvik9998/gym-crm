import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, ChevronDown, X, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

interface TimeSlot {
  id: string;
  start_time: string;
  end_time: string;
  trainer_name?: string;
  capacity: number;
  member_count?: number;
}

interface TimeSlotFilterDropdownProps {
  value: string | null;
  onChange: (slotId: string | null) => void;
  compact?: boolean;
}

const formatTime = (time: string) => {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
};

const getTimePeriod = (time: string): "MORNING" | "AFTERNOON" | "EVENING" => {
  const hour = parseInt(time.split(":")[0]);
  if (hour < 12) return "MORNING";
  if (hour < 17) return "AFTERNOON";
  return "EVENING";
};

export const TimeSlotFilterDropdown = ({ value, onChange, compact = false }: TimeSlotFilterDropdownProps) => {
  const [open, setOpen] = useState(false);
  const { currentBranch } = useBranch();

  const { data: timeSlots = [], isLoading } = useQuery({
    queryKey: ["time-slots-filter", currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];
      
      const { data: slots, error } = await supabase
        .from("trainer_time_slots")
        .select("id, start_time, end_time, capacity, trainer:personal_trainers(name)")
        .eq("branch_id", currentBranch.id)
        .eq("status", "available")
        .order("start_time", { ascending: true });

      if (error) throw error;

      // Get member counts per slot
      const slotIds = (slots || []).map((s: any) => s.id);
      let memberCounts: Record<string, number> = {};
      
      if (slotIds.length > 0) {
        const { data: members } = await supabase
          .from("time_slot_members" as any)
          .select("time_slot_id")
          .in("time_slot_id", slotIds);

        if (members) {
          for (const m of members as any[]) {
            memberCounts[m.time_slot_id] = (memberCounts[m.time_slot_id] || 0) + 1;
          }
        }
      }

      return (slots || []).map((s: any) => ({
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        trainer_name: (s.trainer as any)?.name || "Unassigned",
        capacity: s.capacity,
        member_count: memberCounts[s.id] || 0,
      })) as TimeSlot[];
    },
    enabled: !!currentBranch?.id,
    staleTime: 30000,
  });

  const groupedSlots = useMemo(() => {
    const groups: Record<string, TimeSlot[]> = {
      MORNING: [],
      AFTERNOON: [],
      EVENING: [],
    };
    timeSlots.forEach((slot) => {
      const period = getTimePeriod(slot.start_time);
      groups[period].push(slot);
    });
    return groups;
  }, [timeSlots]);

  const selectedSlot = timeSlots.find((s) => s.id === value);
  const hasSlots = timeSlots.length > 0;
  const isActive = value !== null;

  const selectedLabel = selectedSlot
    ? `${formatTime(selectedSlot.start_time)} – ${formatTime(selectedSlot.end_time)}`
    : "Time Slot";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-7 lg:h-8 px-1.5 rounded-lg border transition-all duration-200 shadow-sm",
            "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
            "focus:ring-0 focus:ring-offset-0 focus:outline-none",
            isActive
              ? "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 shadow-md"
              : "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200/50 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md hover:scale-[1.02]"
          )}
          onClick={(e) => e.currentTarget.blur()}
        >
          <div className="flex items-center gap-1 lg:gap-1.5">
            <Clock className={cn(
              "w-3.5 h-3.5 lg:w-4 lg:h-4 transition-colors",
              isActive ? "text-indigo-700 dark:text-indigo-300" : "text-indigo-600 dark:text-indigo-400"
            )} />
            <span className={cn(
              "text-[10px] lg:text-xs font-medium transition-colors max-w-[120px] truncate",
              isActive ? "text-indigo-800 dark:text-indigo-200" : "text-indigo-700 dark:text-indigo-300"
            )}>
              {compact ? (isActive ? selectedLabel : "Slot") : selectedLabel}
            </span>
            {isActive ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="ml-0.5 p-0.5 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
              >
                <X className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              </button>
            ) : (
              <ChevronDown className={cn(
                "w-3 h-3 ml-0.5 transition-transform duration-200",
                open && "rotate-180",
                "text-indigo-600 dark:text-indigo-400"
              )} />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        align="start" 
        className="w-[340px] p-0 rounded-xl border-border/50 shadow-xl overflow-hidden"
        sideOffset={6}
      >
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-4 w-20" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
            </div>
            <Skeleton className="h-4 w-24" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
            </div>
          </div>
        ) : !hasSlots ? (
          <div className="p-6 text-center">
            <Clock className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No time slots available</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create slots in Staff Management</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {(["MORNING", "AFTERNOON", "EVENING"] as const).map((period, periodIdx) => {
              const slots = groupedSlots[period];
              if (slots.length === 0) return null;

              return (
                <div
                  key={period}
                  className="animate-fade-in"
                  style={{ animationDelay: `${periodIdx * 60}ms` }}
                >
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5 px-1">
                    {period}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {slots.map((slot, slotIdx) => {
                      const isSelected = value === slot.id;
                      const isFull = slot.member_count! >= slot.capacity;

                      return (
                        <button
                          key={slot.id}
                          onClick={() => {
                            onChange(isSelected ? null : slot.id);
                            setOpen(false);
                          }}
                          className={cn(
                            "relative flex flex-col items-center justify-center px-2 py-2 rounded-lg text-xs font-medium",
                            "border transition-all duration-200 cursor-pointer",
                            "hover:scale-[1.03] active:scale-[0.97]",
                            "animate-fade-in",
                            isSelected
                              ? "bg-indigo-100 dark:bg-indigo-900/50 border-indigo-400 dark:border-indigo-600 text-indigo-800 dark:text-indigo-200 shadow-md ring-1 ring-indigo-300/50"
                              : "bg-card border-border/60 text-foreground hover:bg-muted/80 hover:border-border hover:shadow-sm"
                          )}
                          style={{ animationDelay: `${periodIdx * 60 + slotIdx * 40}ms` }}
                        >
                          {isSelected && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center animate-scale-in">
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                          <span className="whitespace-nowrap text-[11px] leading-tight">
                            {formatTime(slot.start_time)}
                          </span>
                          <span className="text-[9px] text-muted-foreground leading-tight">
                            {formatTime(slot.end_time)}
                          </span>
                          {/* Capacity indicator */}
                          <div className="w-full mt-1.5 flex items-center gap-1">
                            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  isFull ? "bg-destructive" : isSelected ? "bg-indigo-500" : "bg-primary/60"
                                )}
                                style={{ width: `${Math.min((slot.member_count! / slot.capacity) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-[8px] text-muted-foreground tabular-nums">
                              {slot.member_count}/{slot.capacity}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear
              </Button>
              {value && (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => setOpen(false)}
                >
                  Apply filter
                </Button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
