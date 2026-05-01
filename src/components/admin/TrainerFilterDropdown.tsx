import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dumbbell, ChevronDown, X, Check, Users, User } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useCloseOnRouteChange } from "@/hooks/use-close-on-route-change";

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
  const isMobile = useIsMobile();
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  const { data: trainers = [], isLoading } = useQuery({
    queryKey: ["trainer-filter-list", currentBranch?.id],
    queryFn: async () => {
      if (!currentBranch?.id) return [];

      // Get all active personal trainers for this branch
      const { data: ptData, error: ptError } = await supabase
        .from("personal_trainers")
        .select("id, name, phone, specialization")
        .eq("branch_id", currentBranch.id)
        .eq("is_active", true);

      if (ptError) throw ptError;
      if (!ptData || ptData.length === 0) return [];

      // Resolve personal_trainer → staff via PHONE ONLY.
      // Phone is the single source of truth — name is never used as an identifier.
      // ChangePhoneDialog keeps personal_trainers.phone in sync when staff phone changes.
      // Resolve trainer→staff mapping. Staff RLS limits direct visibility to self,
      // so for staff users we fall back to matching personal_trainers.name → staff name
      // returned by the SECURITY DEFINER RPC. Phone match remains the primary path for admins.
      const ptPhones = ptData.map(pt => pt.phone).filter(Boolean);
      let phoneToStaffId: Record<string, string> = {};
      if (ptPhones.length > 0) {
        const { data: staffRows } = await supabase
          .from("staff")
          .select("id, phone")
          .in("phone", ptPhones as string[]);

        for (const s of (staffRows as any[] || [])) {
          if (s.phone) phoneToStaffId[s.phone] = s.id;
        }
      }

      // Build a name→staff_id fallback map from the RPC (covers colleagues invisible via RLS)
      const { data: branchStaffNames } = await supabase
        .rpc("get_staff_names_for_branch" as any, { _branch_id: currentBranch.id });
      const nameToStaffId: Record<string, string> = {};
      for (const s of ((branchStaffNames as any[]) || [])) {
        if (s.full_name) nameToStaffId[s.full_name.trim().toLowerCase()] = s.id;
      }

      const resolveStaffId = (pt: { phone: string | null; name: string }): string | null => {
        if (pt.phone && phoneToStaffId[pt.phone]) return phoneToStaffId[pt.phone];
        // Fallback: match by name when staff RLS hides phone of colleagues
        if (pt.name) return nameToStaffId[pt.name.trim().toLowerCase()] || null;
        return null;
      };

      // Get member counts via pt_subscriptions
      const today = new Date().toISOString().split("T")[0];
      const ptIds = ptData.map(pt => pt.id);
      let memberCountMap: Record<string, number> = {};
      if (ptIds.length > 0) {
        const { data: ptSubs } = await supabase
          .from("pt_subscriptions")
          .select("member_id, personal_trainer_id")
          .eq("branch_id", currentBranch.id)
          .eq("status", "active")
          .gte("end_date", today)
          .in("personal_trainer_id", ptIds);

        const ptMembers: Record<string, Set<string>> = {};
        for (const sub of (ptSubs as any[] || [])) {
          if (!ptMembers[sub.personal_trainer_id]) ptMembers[sub.personal_trainer_id] = new Set();
          ptMembers[sub.personal_trainer_id].add(sub.member_id);
        }
        for (const [ptId, members] of Object.entries(ptMembers)) {
          memberCountMap[ptId] = members.size;
        }
      }

      // Get slot counts per staff_id from trainer_time_slots
      let slotCountMap: Record<string, number> = {};
      const staffIds = Array.from(new Set(Object.values(phoneToStaffId)));
      if (staffIds.length > 0) {
        const { data: allSlots } = await supabase
          .from("trainer_time_slots" as any)
          .select("id, trainer_id")
          .eq("branch_id", currentBranch.id)
          .eq("status", "available")
          .in("trainer_id", staffIds);

        for (const s of (allSlots as any[] || [])) {
          slotCountMap[s.trainer_id] = (slotCountMap[s.trainer_id] || 0) + 1;
        }
      }

      const result: TrainerInfo[] = ptData.map((pt) => {
        const staffId = resolveStaffId(pt);
        return {
          id: staffId || pt.id, // Use staff_id if available, else pt.id
          name: pt.name,
          specialization: pt.specialization,
          member_count: memberCountMap[pt.id] || 0,
          slot_count: staffId ? (slotCountMap[staffId] || 0) : 0,
        };
      });

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = result.filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      return unique.sort((a, b) => a.name.localeCompare(b.name));
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
            compact
              ? "h-9 w-full justify-between px-3 rounded-xl border transition-all duration-200 shadow-sm"
              : "h-7 lg:h-8 px-1.5 rounded-lg border transition-all duration-200 shadow-sm",
            "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
            "focus:ring-0 focus:ring-offset-0 focus:outline-none",
            isActive
              ? "bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 shadow-md"
              : "bg-violet-50 dark:bg-violet-950/30 border-violet-200/50 dark:border-violet-800/50 hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md hover:scale-[1.02]"
          )}
          onClick={(e) => e.currentTarget.blur()}
        >
          <div className={cn("flex items-center gap-1 lg:gap-1.5", compact && "w-full justify-between") }>
            <div className="flex min-w-0 items-center gap-1.5">
            <Dumbbell className={cn(
              "w-3.5 h-3.5 lg:w-4 lg:h-4 transition-colors",
              isActive ? "text-violet-700 dark:text-violet-300" : "text-violet-600 dark:text-violet-400"
            )} />
            <span className={cn(
              compact ? "text-xs font-medium transition-colors max-w-[140px] truncate text-left" : "text-[10px] lg:text-xs font-medium transition-colors max-w-[120px] truncate",
              isActive ? "text-violet-800 dark:text-violet-200" : "text-violet-700 dark:text-violet-300"
            )}>
              {compact ? (isActive ? selectedLabel : "Trainer") : selectedLabel}
            </span>
            </div>
            {isActive && !isLimitedAccess && !compact ? (
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
        align={compact || isMobile ? "start" : "end"}
        className={cn(
          "p-0 rounded-xl border-border/50 shadow-2xl overflow-hidden",
          compact || isMobile ? "w-[min(22rem,calc(100vw-2rem))]" : "w-[280px]"
        )}
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
          <div className="max-h-[min(65vh,360px)] overflow-y-auto overscroll-contain">
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

            {/* "No Trainer" filter option */}
            <div className="p-1.5 pb-0">
              <button
                onClick={() => {
                  onChange(isNoTrainerFilter ? null : NO_TRAINER_FILTER);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200",
                  "hover:scale-[1.01] active:scale-[0.99]",
                  isNoTrainerFilter
                    ? "bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 border shadow-sm ring-1 ring-orange-300/50"
                    : "border border-transparent hover:bg-muted/50"
                )}
              >
                <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                  <AvatarFallback className="text-[10px] font-bold bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400">
                    <User className="w-3.5 h-3.5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className={cn(
                    "text-xs font-semibold",
                    isNoTrainerFilter ? "text-orange-700 dark:text-orange-300" : "text-foreground"
                  )}>
                    No Trainer
                  </p>
                  <p className="text-[10px] text-muted-foreground">Members without any active PT</p>
                </div>
                {isNoTrainerFilter && (
                  <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center animate-scale-in">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            </div>

            {/* Separator */}
            <div className="mx-3 my-1 border-t border-border/30" />

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
