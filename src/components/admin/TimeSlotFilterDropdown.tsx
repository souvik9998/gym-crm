import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, ChevronDown, X, Check, Users, User } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";


interface SlotMember {
  id: string;
  name: string;
}

interface TimeSlot {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  members: SlotMember[];
}

interface TrainerGroup {
  trainer_id: string;
  trainer_name: string;
  slots: TimeSlot[];
  total_members: number;
}

interface TimeSlotFilterDropdownProps {
  value: string | null;
  onChange: (slotId: string | null) => void;
  trainerFilter?: string | null;
  compact?: boolean;
}

const formatTime = (time: string) => {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
};


const slotColors = [
  { bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-200 dark:border-violet-800", text: "text-violet-700 dark:text-violet-300", bar: "bg-violet-500", activeBg: "bg-violet-100 dark:bg-violet-900/50", ring: "ring-violet-300/50" },
  { bg: "bg-sky-50 dark:bg-sky-950/30", border: "border-sky-200 dark:border-sky-800", text: "text-sky-700 dark:text-sky-300", bar: "bg-sky-500", activeBg: "bg-sky-100 dark:bg-sky-900/50", ring: "ring-sky-300/50" },
  { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", activeBg: "bg-emerald-100 dark:bg-emerald-900/50", ring: "ring-emerald-300/50" },
  { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500", activeBg: "bg-amber-100 dark:bg-amber-900/50", ring: "ring-amber-300/50" },
  { bg: "bg-rose-50 dark:bg-rose-950/30", border: "border-rose-200 dark:border-rose-800", text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-500", activeBg: "bg-rose-100 dark:bg-rose-900/50", ring: "ring-rose-300/50" },
];

export const NO_SLOT_FILTER = "__no_slot__";

export const TimeSlotFilterDropdown = ({ value, onChange, trainerFilter = null, compact = false }: TimeSlotFilterDropdownProps) => {
  const [open, setOpen] = useState(false);
  const { currentBranch } = useBranch();

  const { data: trainerGroups = [], isLoading } = useQuery({
    queryKey: ["time-slots-mega-menu", currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Fetch slots - trainer_id references staff.id
      const { data: slots, error } = await supabase
        .from("trainer_time_slots" as any)
        .select("id, start_time, end_time, capacity, trainer_id")
        .eq("branch_id", currentBranch.id)
        .eq("status", "available")
        .order("start_time", { ascending: true });

      if (error) throw error;
      if (!slots || slots.length === 0) return [];

      // Get trainer names from staff table
      const trainerIds = [...new Set((slots as any[]).map((s: any) => s.trainer_id).filter(Boolean))];
      let staffMap: Record<string, string> = {};
      if (trainerIds.length > 0) {
        const { data: staffBasic } = await supabase
          .from("staff")
          .select("id, full_name")
          .in("id", trainerIds);
        for (const s of (staffBasic as any[] || [])) {
          staffMap[s.id] = s.full_name;
        }
      }

      // Get members per slot from pt_subscriptions (single source of truth)
      const slotIds = (slots as any[]).map((s: any) => s.id);
      let slotMembers: Record<string, SlotMember[]> = {};
      if (slotIds.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        const { data: ptData } = await supabase
          .from("pt_subscriptions" as any)
          .select("time_slot_id, member_id")
          .in("time_slot_id", slotIds)
          .eq("status", "active")
          .gte("end_date", today);

        if (ptData && (ptData as any[]).length > 0) {
          const memberIds = [...new Set((ptData as any[]).map((t: any) => t.member_id))];
          const { data: membersData } = await supabase
            .from("members")
            .select("id, name")
            .in("id", memberIds);

          const memberMap: Record<string, string> = {};
          if (membersData) {
            for (const m of membersData) {
              memberMap[m.id] = m.name;
            }
          }

          for (const pt of ptData as any[]) {
            if (!slotMembers[pt.time_slot_id]) slotMembers[pt.time_slot_id] = [];
            slotMembers[pt.time_slot_id].push({
              id: pt.member_id,
              name: memberMap[pt.member_id] || "Unknown",
            });
          }
        }
      }

      // Group by trainer
      const groupMap: Record<string, TrainerGroup> = {};
      for (const slot of slots as any[]) {
        const tid = slot.trainer_id || "unassigned";
        const tName = staffMap[slot.trainer_id] || "Unassigned";
        if (!groupMap[tid]) {
          groupMap[tid] = {
            trainer_id: tid,
            trainer_name: tName,
            slots: [],
            total_members: 0,
          };
        }
        const members = slotMembers[slot.id] || [];
        groupMap[tid].slots.push({
          id: slot.id,
          start_time: slot.start_time,
          end_time: slot.end_time,
          capacity: slot.capacity,
          members,
        });
        groupMap[tid].total_members += members.length;
      }

      return Object.values(groupMap).sort((a, b) => a.trainer_name.localeCompare(b.trainer_name));
    },
    enabled: !!currentBranch?.id,
    staleTime: 30000,
  });

  // Filter by selected trainer if any
  const displayGroups = useMemo(() => {
    if (!trainerFilter) return trainerGroups;
    return trainerGroups.filter(g => g.trainer_id === trainerFilter);
  }, [trainerGroups, trainerFilter]);

  const allSlots = useMemo(() => displayGroups.flatMap(g => g.slots), [displayGroups]);
  const selectedSlot = allSlots.find((s) => s.id === value);
  const selectedTrainer = displayGroups.find(g => g.slots.some(s => s.id === value));
  const hasSlots = allSlots.length > 0;
  const isActive = value !== null;
  const isNoSlotFilter = value === NO_SLOT_FILTER;

  const selectedLabel = isNoSlotFilter
    ? "No Slot"
    : selectedSlot
      ? `${selectedTrainer?.trainer_name} · ${formatTime(selectedSlot.start_time)}`
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
              "text-[10px] lg:text-xs font-medium transition-colors max-w-[140px] truncate",
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
        align="end"
        className="w-[300px] p-0 rounded-xl border-border/50 shadow-2xl overflow-hidden"
        sideOffset={6}
      >
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-7 rounded-md" />
            ))}
          </div>
        ) : !hasSlots ? (
          <div className="p-6 text-center">
            <Clock className="w-5 h-5 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs font-medium text-muted-foreground">No time slots</p>
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border/40 px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-foreground">Filter by Time Slot</p>
                {isActive && (
                  <button
                    onClick={() => { onChange(null); setOpen(false); }}
                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* "No Slot" option */}
            <div className="px-1.5 pt-1.5">
              <button
                onClick={() => { onChange(isNoSlotFilter ? null : NO_SLOT_FILTER); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-all text-left",
                  isNoSlotFilter
                    ? "bg-orange-100 dark:bg-orange-900/40 border border-orange-300 dark:border-orange-700"
                    : "hover:bg-muted/50"
                )}
              >
                <User className={cn("w-3 h-3 shrink-0", isNoSlotFilter ? "text-orange-600" : "text-orange-400")} />
                <span className={cn("text-[11px] font-medium", isNoSlotFilter ? "text-orange-700 dark:text-orange-300" : "text-foreground")}>
                  No Time Slot
                </span>
                {isNoSlotFilter && <Check className="w-3 h-3 ml-auto text-orange-600" />}
              </button>
            </div>

            <div className="mx-2.5 my-1 border-t border-border/30" />

            {/* Grouped by trainer */}
            <div className="px-1.5 pb-1.5 space-y-0.5">
              {displayGroups.map((group, gIdx) => (
                <div key={group.trainer_id}>
                  {/* Trainer label */}
                  <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-0.5">
                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", slotColors[gIdx % slotColors.length].bar)} />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                      {group.trainer_name}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 ml-auto">{group.total_members} mbr</span>
                  </div>

                  {/* Slots as horizontal chips */}
                  <div className="flex flex-wrap gap-1.5 px-2.5 pb-1.5">
                    {group.slots.map((slot, sIdx) => {
                      const isSelected = value === slot.id;
                      const colorSet = slotColors[gIdx % slotColors.length];
                      const isFull = slot.members.length >= slot.capacity;
                      const fillPercent = slot.capacity > 0 ? Math.round((slot.members.length / slot.capacity) * 100) : 0;

                      return (
                        <button
                          key={slot.id}
                          onClick={() => { onChange(isSelected ? null : slot.id); setOpen(false); }}
                          className={cn(
                            "group/chip relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold overflow-hidden",
                            "transition-all duration-300 ease-out",
                            isSelected
                              ? `${colorSet.activeBg} ${colorSet.border} border shadow-sm ${colorSet.text} ring-1 ${colorSet.ring} scale-[1.02]`
                              : `${colorSet.bg} border ${colorSet.border} ${colorSet.text} hover:shadow-md hover:scale-[1.04] hover:ring-1 hover:${colorSet.ring} active:scale-[0.97]`
                          )}
                          style={{
                            animationDelay: `${sIdx * 50}ms`,
                          }}
                        >
                          {/* Fill bar background */}
                          <div
                            className={cn(
                              "absolute inset-y-0 left-0 opacity-[0.08] transition-all duration-500 ease-out rounded-lg",
                              colorSet.bar
                            )}
                            style={{ width: `${fillPercent}%` }}
                          />
                          <span className="relative z-10 tracking-wide">
                            {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
                          </span>
                          <span className={cn(
                            "relative z-10 text-[8px] tabular-nums font-bold px-1 py-0.5 rounded-full min-w-[28px] text-center transition-colors duration-200",
                            isFull
                              ? "bg-destructive/15 text-destructive"
                              : isSelected
                                ? `${colorSet.activeBg} ${colorSet.text}`
                                : "bg-background/60 text-muted-foreground"
                          )}>
                            {slot.members.length}/{slot.capacity}
                          </span>
                          {isSelected && (
                            <Check className="relative z-10 w-3 h-3 animate-scale-in" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
