import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dumbbell, ChevronDown, X, Check, Users } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface TrainerInfo {
  id: string;
  name: string;
  specialization: string | null;
  member_count: number;
  slot_count: number;
}

interface TrainerFilterDropdownProps {
  value: string | null;
  onChange: (trainerId: string | null) => void;
  compact?: boolean;
}

const getInitials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

const trainerColors = [
  { bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300", activeBg: "bg-violet-100 dark:bg-violet-900/50", border: "border-violet-200 dark:border-violet-800", ring: "ring-violet-300/50", dot: "bg-violet-500" },
  { bg: "bg-sky-50 dark:bg-sky-950/30", text: "text-sky-700 dark:text-sky-300", activeBg: "bg-sky-100 dark:bg-sky-900/50", border: "border-sky-200 dark:border-sky-800", ring: "ring-sky-300/50", dot: "bg-sky-500" },
  { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", activeBg: "bg-emerald-100 dark:bg-emerald-900/50", border: "border-emerald-200 dark:border-emerald-800", ring: "ring-emerald-300/50", dot: "bg-emerald-500" },
  { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", activeBg: "bg-amber-100 dark:bg-amber-900/50", border: "border-amber-200 dark:border-amber-800", ring: "ring-amber-300/50", dot: "bg-amber-500" },
  { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-700 dark:text-rose-300", activeBg: "bg-rose-100 dark:bg-rose-900/50", border: "border-rose-200 dark:border-rose-800", ring: "ring-rose-300/50", dot: "bg-rose-500" },
];

export const NO_TRAINER_FILTER = "__no_trainer__";

export const TrainerFilterDropdown = ({ value, onChange, compact = false }: TrainerFilterDropdownProps) => {
  const [open, setOpen] = useState(false);
  const { currentBranch } = useBranch();
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  const { data: trainers = [], isLoading } = useQuery({
    queryKey: ["trainer-filter-list", currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Get trainers (staff who have time slots)
      const { data: slots, error } = await supabase
        .from("trainer_time_slots" as any)
        .select("trainer_id")
        .eq("branch_id", currentBranch.id)
        .eq("status", "available");

      if (error) throw error;
      if (!slots || slots.length === 0) return [];

      const trainerIds = [...new Set((slots as any[]).map((s: any) => s.trainer_id).filter(Boolean))];
      if (trainerIds.length === 0) return [];

      // Get staff info
      const { data: staffData } = await supabase
        .from("staff")
        .select("id, full_name")
        .in("id", trainerIds);

      if (!staffData) return [];

      // Get slot counts per trainer
      const { data: allSlots } = await supabase
        .from("trainer_time_slots" as any)
        .select("id, trainer_id")
        .eq("branch_id", currentBranch.id)
        .eq("status", "available");

      // Build slot count map
      const slotCountMap: Record<string, number> = {};
      for (const s of allSlots as any[]) {
        slotCountMap[s.trainer_id] = (slotCountMap[s.trainer_id] || 0) + 1;
      }

      // Get member counts per trainer via pt_subscriptions (single source of truth)
      // Resolve staff_id → phone → personal_trainer_id
      const staffPhones = staffData.map(s => ({ id: s.id, phone: "" }));
      const { data: staffPhoneData } = await supabase
        .from("staff")
        .select("id, phone")
        .in("id", trainerIds);

      const phoneToStaffId: Record<string, string> = {};
      for (const sp of staffPhoneData || []) {
        if (sp.phone) phoneToStaffId[sp.phone] = sp.id;
      }

      const phones = Object.keys(phoneToStaffId);
      let memberCountMap: Record<string, number> = {};

      if (phones.length > 0) {
        const { data: ptProfiles } = await supabase
          .from("personal_trainers" as any)
          .select("id, phone")
          .in("phone", phones)
          .eq("branch_id", currentBranch.id);

        const ptIdToStaffId: Record<string, string> = {};
        for (const pt of (ptProfiles as any[] || [])) {
          const staffId = phoneToStaffId[pt.phone];
          if (staffId) ptIdToStaffId[pt.id] = staffId;
        }

        const ptIds = Object.keys(ptIdToStaffId);
        if (ptIds.length > 0) {
          const today = new Date().toISOString().split("T")[0];
          const { data: ptSubs } = await supabase
            .from("pt_subscriptions" as any)
            .select("member_id, personal_trainer_id")
            .eq("branch_id", currentBranch.id)
            .eq("status", "active")
            .gte("end_date", today)
            .in("personal_trainer_id", ptIds);

          // Count unique members per staff_id
          const staffMembers: Record<string, Set<string>> = {};
          for (const sub of (ptSubs as any[] || [])) {
            const staffId = ptIdToStaffId[sub.personal_trainer_id];
            if (staffId) {
              if (!staffMembers[staffId]) staffMembers[staffId] = new Set();
              staffMembers[staffId].add(sub.member_id);
            }
          }
          for (const [staffId, members] of Object.entries(staffMembers)) {
            memberCountMap[staffId] = members.size;
          }
        }
      }

      const result: TrainerInfo[] = staffData.map((s) => ({
        id: s.id,
        name: s.full_name,
        specialization: null,
        member_count: memberCountMap[s.id] || 0,
        slot_count: slotCountMap[s.id] || 0,
      }));

      return result.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!currentBranch?.id,
    staleTime: 30000,
  });
  // For limited-access staff, filter trainers to only show themselves and auto-select
  const visibleTrainers = useMemo(() => {
    if (isLimitedAccess && staffUser?.id) {
      return trainers.filter((t) => t.id === staffUser.id);
    }
    return trainers;
  }, [trainers, isLimitedAccess, staffUser?.id]);

  // Auto-select for limited access staff
  useEffect(() => {
    if (isLimitedAccess && staffUser?.id && visibleTrainers.length > 0 && !value) {
      const self = visibleTrainers.find((t) => t.id === staffUser.id);
      if (self) onChange(self.id);
    }
  }, [isLimitedAccess, staffUser?.id, visibleTrainers, value, onChange]);

  const selectedTrainer = visibleTrainers.find((t) => t.id === value);
  const hasTrainers = visibleTrainers.length > 0;
  const isActive = value !== null;
  const isNoTrainerFilter = value === NO_TRAINER_FILTER;

  const selectedLabel = isNoTrainerFilter ? "No Trainer" : selectedTrainer ? selectedTrainer.name : "Trainer";

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
              ? "bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 shadow-md"
              : "bg-violet-50 dark:bg-violet-950/30 border-violet-200/50 dark:border-violet-800/50 hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md hover:scale-[1.02]"
          )}
          onClick={(e) => e.currentTarget.blur()}
        >
          <div className="flex items-center gap-1 lg:gap-1.5">
            <Dumbbell className={cn(
              "w-3.5 h-3.5 lg:w-4 lg:h-4 transition-colors",
              isActive ? "text-violet-700 dark:text-violet-300" : "text-violet-600 dark:text-violet-400"
            )} />
            <span className={cn(
              "text-[10px] lg:text-xs font-medium transition-colors max-w-[120px] truncate",
              isActive ? "text-violet-800 dark:text-violet-200" : "text-violet-700 dark:text-violet-300"
            )}>
              {compact ? (isActive ? selectedLabel : "Trainer") : selectedLabel}
            </span>
            {isActive && !isLimitedAccess ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="ml-0.5 p-0.5 rounded-full hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors"
              >
                <X className="w-3 h-3 text-violet-600 dark:text-violet-400" />
              </button>
            ) : (
              <ChevronDown className={cn(
                "w-3 h-3 ml-0.5 transition-transform duration-200",
                open && "rotate-180",
                "text-violet-600 dark:text-violet-400"
              )} />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[280px] p-0 rounded-xl border-border/50 shadow-2xl overflow-hidden"
        sideOffset={6}
      >
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 p-2">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : !hasTrainers ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted/60 flex items-center justify-center mb-3">
              <Dumbbell className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No trainers available</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create time slots in Staff Management</p>
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border/40 px-4 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Select Trainer</p>
                {isActive && (
                  <button
                    onClick={() => { onChange(null); setOpen(false); }}
                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded-md hover:bg-muted"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Trainer list */}
            <div className="p-1.5 space-y-0.5">
              {visibleTrainers.map((trainer, idx) => {
                const isSelected = value === trainer.id;
                const colorSet = trainerColors[idx % trainerColors.length];

                return (
                  <button
                    key={trainer.id}
                    onClick={() => {
                      onChange(isSelected ? null : trainer.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200",
                      "hover:scale-[1.01] active:scale-[0.99]",
                      "animate-fade-in",
                      isSelected
                        ? `${colorSet.activeBg} ${colorSet.border} border shadow-sm ring-1 ${colorSet.ring}`
                        : "border border-transparent hover:bg-muted/50"
                    )}
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                      <AvatarFallback className={cn("text-[10px] font-bold", colorSet.bg, colorSet.text)}>
                        {getInitials(trainer.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <p className={cn(
                        "text-xs font-semibold truncate",
                        isSelected ? colorSet.text : "text-foreground"
                      )}>
                        {trainer.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {trainer.slot_count} slot{trainer.slot_count !== 1 ? "s" : ""} · {trainer.member_count} member{trainer.member_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {isSelected && (
                      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center animate-scale-in", colorSet.dot)}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
