import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserGroupIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrainerFilterDropdown } from "@/components/admin/TrainerFilterDropdown";
import { TimeSlotFilterDropdown } from "@/components/admin/TimeSlotFilterDropdown";
import { useAssignedMemberIds } from "@/hooks/useAssignedMembers";
import { useAttendanceFilters } from "@/hooks/queries/useAttendanceFilters";
import { useMembersQuery } from "@/hooks/queries/useMembers";

type AttendanceStatus = "present" | "absent" | "late";

interface MemberAttendance {
  memberId: string;
  memberName: string;
  memberPhone: string;
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "bg-green-500 text-white shadow-green-500/30",
  late: "bg-amber-500 text-white shadow-amber-500/30",
  absent: "bg-red-500/80 text-white shadow-red-500/20",
};

function getWeekDates(referenceDate: string): string[] {
  const d = new Date(referenceDate + "T00:00:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(dt.toISOString().split("T")[0]);
  }
  return dates;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_LABELS_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SimpleAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const { assignedMemberIds } = useAssignedMemberIds();
  const { allSlots } = useAttendanceFilters();
  const { data: scopedMembers = [], isLoading: loadingMembers } = useMembersQuery();

  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  const trainerSlotIds = useMemo(() => {
    if (!selectedTrainerId) return null;
    return allSlots
      .filter((slot) => slot.trainer_id === selectedTrainerId)
      .map((slot) => slot.id);
  }, [allSlots, selectedTrainerId]);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const isFutureDate = selectedDate > today;

  const navigateWeek = (dir: "prev" | "next") => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + (dir === "prev" ? -7 : 7));
    const iso = d.toISOString().split("T")[0];
    if (iso > today) return;
    setSelectedDate(iso);
  };

  const activeMembers = useMemo(() => {
    return scopedMembers.filter((member) => {
      const subscriptionStatus = member.subscription?.status;
      if (subscriptionStatus !== "active" && subscriptionStatus !== "expiring_soon") {
        return false;
      }

      // Specific slot filter: only members in that slot
      if (selectedSlotId) {
        return member.activePT?.time_slot_id === selectedSlotId;
      }

      // Trainer filter: include ALL members assigned to this trainer (with or without slot)
      if (selectedTrainerId) {
        // Check if member has activePT and if trainer matches via slot or direct assignment
        if (!member.activePT) return false;
        // If member has a slot assigned to this trainer, include
        if (trainerSlotIds && member.activePT.time_slot_id && trainerSlotIds.includes(member.activePT.time_slot_id)) {
          return true;
        }
        // Also include members whose PT trainer matches (even without slot)
        // The activePT is populated from pt_subscriptions which is our source of truth
        return !!member.activePT.trainer_name;
      }

      return true;
    });
  }, [scopedMembers, selectedSlotId, selectedTrainerId, trainerSlotIds]);

  const { data: weekRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["daily-attendance-week", branchId, weekDates[0], weekDates[6], isLimitedAccess ? (assignedMemberIds ?? []).join(",") : "all"],
    queryFn: async () => {
      if (!branchId) return [];
      if (assignedMemberIds !== null && assignedMemberIds.length === 0) return [];

      let query = supabase
        .from("daily_attendance").select("id, member_id, date, status, created_at, updated_at")
        .eq("branch_id", branchId)
        .gte("date", weekDates[0])
        .lte("date", weekDates[6])
        .is("time_slot_id", null);

      if (assignedMemberIds !== null) {
        query = query.in("member_id", assignedMemberIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && (!isLimitedAccess || assignedMemberIds !== undefined),
  });

  const weekLookup = useMemo(() => {
    const map: Record<string, Record<string, { status: AttendanceStatus; markedAt: string | null }>> = {};
    weekRecords.forEach((r: any) => {
      if (!map[r.date]) map[r.date] = {};
      map[r.date][r.member_id] = {
        status: r.status as AttendanceStatus,
        markedAt: r.updated_at || r.created_at || null,
      };
    });
    return map;
  }, [weekRecords]);

  const existingRecords = useMemo(() => weekRecords.filter((r: any) => r.date === selectedDate), [weekRecords, selectedDate]);

  useEffect(() => {
    const map = new Map<string, AttendanceStatus>();
    existingRecords.forEach((r: any) => { map.set(r.member_id, r.status as AttendanceStatus); });
    setLocalAttendance(map);
    setHasChanges(false);
  }, [existingRecords]);

  const memberList = useMemo((): MemberAttendance[] => {
    return activeMembers.map((m: any) => ({ memberId: m.id, memberName: m.name, memberPhone: m.phone }));
  }, [activeMembers]);

  // Base list (search applied) — used for stats so cards reflect totals regardless of active filter
  const searchedList = useMemo(() => {
    if (!search.trim()) return memberList;
    const q = search.toLowerCase();
    return memberList.filter((m) => m.memberName.toLowerCase().includes(q) || m.memberPhone.includes(q));
  }, [memberList, search]);

  const stats = useMemo(() => {
    const source = searchedList;
    const total = source.length;
    let present = 0, late = 0, absent = 0;
    source.forEach((m) => {
      const s = localAttendance.get(m.memberId) || "absent";
      if (s === "present") present++;
      else if (s === "late") late++;
      else absent++;
    });
    return { total, present, late, absent };
  }, [searchedList, localAttendance]);

  // Visible list — applies the status filter card on top of search
  const filteredList = useMemo(() => {
    if (statusFilter === "all") return searchedList;
    return searchedList.filter((m) => {
      const s = localAttendance.get(m.memberId) || "absent";
      return s === statusFilter;
    });
  }, [searchedList, statusFilter, localAttendance]);

  const toggleStatus = useCallback((memberId: string, newStatus: AttendanceStatus) => {
    if (isFutureDate) return;
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      const cur = next.get(memberId) || "absent";
      next.set(memberId, cur === newStatus ? "absent" : newStatus);
      return next;
    });
    setHasChanges(true);
  }, [isFutureDate]);

  const markAll = useCallback((status: AttendanceStatus) => {
    if (isFutureDate) return;
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      filteredList.forEach((member) => next.set(member.memberId, status));
      return next;
    });
    setHasChanges(true);
  }, [filteredList, isFutureDate]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      if (isFutureDate) throw new Error("Cannot mark attendance for future dates");
      const targetMemberIds = filteredList.map((member) => member.memberId);
      if (targetMemberIds.length === 0) return;

      const { error: deleteError } = await supabase
        .from("daily_attendance").delete()
        .eq("branch_id", branchId).eq("date", selectedDate).is("time_slot_id", null)
        .in("member_id", targetMemberIds);
      if (deleteError) throw deleteError;
      const records = filteredList.map((m) => ({
        member_id: m.memberId, branch_id: branchId, date: selectedDate,
        status: localAttendance.get(m.memberId) || "absent",
        time_slot_id: null as string | null,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
      }));
      const { error: insertError } = await supabase.from("daily_attendance").insert(records);
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast({ title: "Attendance saved", description: `Attendance for ${formatShortDate(selectedDate)} saved.` });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["daily-attendance-week", branchId] });
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    },
    onError: (err: any) => {
      toast({ title: "Error saving attendance", description: err.message, variant: "destructive" });
    },
  });

  const isLoading = loadingMembers || loadingRecords;
  const formatShortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const formatDayNum = (d: string) => new Date(d + "T00:00:00").getDate();

  // ── Mobile card-based member row ──
  const MobileMemberCard = ({ member }: { member: MemberAttendance }) => {
    const currentStatus = localAttendance.get(member.memberId) || "absent";
    return (
      <div className={cn(
        "bg-card rounded-xl border p-3 transition-all duration-200",
        currentStatus === "present" ? "border-green-200 dark:border-green-900/40" :
        currentStatus === "late" ? "border-amber-200 dark:border-amber-900/40" :
        "border-border/40",
        isFutureDate && "opacity-50 pointer-events-none"
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors duration-300",
              currentStatus === "present" ? "bg-green-500/20 text-green-700 dark:text-green-400" :
              currentStatus === "late" ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" :
              "bg-muted text-muted-foreground"
            )}>
              {member.memberName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{member.memberName}</p>
              <p className="text-[10px] text-muted-foreground">{member.memberPhone}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(["present", "late", "absent"] as const).map((s) => (
              <button
                key={s}
                onClick={() => toggleStatus(member.memberId, s)}
                disabled={isFutureDate}
                className={cn(
                  "w-9 h-9 rounded-lg text-xs font-bold transition-all duration-200 border active:scale-90",
                  currentStatus === s
                    ? STATUS_COLORS[s] + " border-transparent shadow-md"
                    : "bg-transparent text-muted-foreground border-border/50 hover:bg-muted/50"
                )}
              >
                {s === "present" ? "P" : s === "late" ? "L" : "A"}
              </button>
            ))}
          </div>
        </div>
        {/* Mini week dots */}
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/20">
          {weekDates.map((d, i) => {
            const st = d === selectedDate
              ? localAttendance.get(member.memberId) || null
              : weekLookup[d]?.[member.memberId] || null;
            return (
              <div key={d} className="flex flex-col items-center flex-1">
                <span className="text-[8px] text-muted-foreground">{DAY_LABELS[i]}</span>
                <div className={cn(
                  "w-4 h-4 rounded-full mt-0.5 transition-colors duration-300",
                  st === "present" ? "bg-green-500" :
                  st === "late" ? "bg-amber-500" :
                  st === "absent" ? "bg-red-400" :
                  "bg-muted/60"
                )} />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Desktop: Week Nav + Filters + Stats in one row */}
      <div className="hidden lg:flex items-center gap-4">
        {/* Week Navigation */}
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek("prev")}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1">
            {weekDates.map((d, i) => {
              const isSelected = d === selectedDate;
              const isToday = d === today;
              const isFuture = d > today;
              const isPast = d < today;
              const hasData = weekLookup[d] && Object.keys(weekLookup[d]).length > 0;
              return (
                <button
                  key={d}
                  onClick={() => { if (!isFuture) setSelectedDate(d); }}
                  disabled={isFuture}
                  className={cn(
                    "relative flex flex-col items-center rounded-xl shrink-0 px-2.5 py-1.5 min-w-[44px]",
                    "transition-all duration-300 ease-out",
                    "active:scale-90 hover:scale-105",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-105"
                      : isToday
                        ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                        : isFuture
                          ? "opacity-20 cursor-not-allowed"
                          : isPast
                            ? "hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
                            : "hover:bg-muted text-muted-foreground"
                  )}
                >
                  <span className="text-[10px] font-medium uppercase">{DAY_LABELS_FULL[i]}</span>
                  <span className={cn(
                    "text-sm font-bold transition-transform duration-300",
                    isSelected && "animate-[bounce_0.4s_ease-out]"
                  )}>{formatDayNum(d)}</span>
                  {/* Attendance indicator dot */}
                  {hasData && !isSelected && (
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500 animate-[fadeIn_0.3s_ease-out]" />
                  )}
                  {/* Today pulse ring */}
                  {isToday && !isSelected && (
                    <div className="absolute inset-0 rounded-xl ring-2 ring-primary/20 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek("next")} disabled={weekDates[6] >= today}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-border/60 shrink-0" />

        {/* Filters */}
        <div className="flex items-center gap-1.5 shrink-0">
          <TrainerFilterDropdown
            value={selectedTrainerId}
            onChange={(v) => { setSelectedTrainerId(v); setSelectedSlotId(null); }}
          />
          <TimeSlotFilterDropdown
            value={selectedSlotId}
            onChange={setSelectedSlotId}
            trainerFilter={selectedTrainerId}
          />
        </div>
      </div>

      {/* Filter Pills — segmented, compact, semantic */}
      <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted/40 border border-border/40 overflow-x-auto scrollbar-hide animate-fade-in">
        {([
          { key: "all", label: "All", count: stats.total, dot: "bg-foreground/60", activeBg: "bg-background text-foreground shadow-sm", activeText: "text-foreground" },
          { key: "present", label: "Present", count: stats.present, dot: "bg-green-500", activeBg: "bg-background shadow-sm", activeText: "text-green-600 dark:text-green-400" },
          { key: "late", label: "Late", count: stats.late, dot: "bg-amber-500", activeBg: "bg-background shadow-sm", activeText: "text-amber-600 dark:text-amber-400" },
          { key: "absent", label: "Absent", count: stats.absent, dot: "bg-red-500", activeBg: "bg-background shadow-sm", activeText: "text-red-600 dark:text-red-400" },
        ] as const).map((pill) => {
          const isActive = statusFilter === pill.key;
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => setStatusFilter(isActive ? "all" : pill.key as any)}
              className={cn(
                "flex-1 min-w-[80px] flex items-center justify-center gap-1.5 lg:gap-2 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-md text-xs lg:text-sm font-medium transition-all duration-200 whitespace-nowrap",
                isActive
                  ? cn(pill.activeBg, pill.activeText, "ring-1 ring-border/60")
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", pill.dot)} />
              <span>{pill.label}</span>
              <span className={cn(
                "text-[10px] lg:text-xs px-1.5 py-0.5 rounded-full font-semibold tabular-nums",
                isActive ? "bg-muted/60" : "bg-muted/40 text-muted-foreground"
              )}>
                {pill.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile: Stacked layout */}
      <div className="lg:hidden space-y-3">
        <div className="flex items-center gap-1.5 justify-start">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek("prev")}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 justify-between">
            {weekDates.map((d, i) => {
              const isSelected = d === selectedDate;
              const isToday = d === today;
              const isFuture = d > today;
              const isPast = d < today;
              const hasData = weekLookup[d] && Object.keys(weekLookup[d]).length > 0;
              return (
                <button
                  key={d}
                  onClick={() => { if (!isFuture) setSelectedDate(d); }}
                  disabled={isFuture}
                  className={cn(
                    "relative flex flex-col items-center rounded-xl shrink-0 px-2 py-1.5 min-w-[38px]",
                    "transition-all duration-300 ease-out",
                    "active:scale-90",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-110"
                      : isToday
                        ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                        : isFuture
                          ? "opacity-20 cursor-not-allowed"
                          : isPast
                            ? "text-muted-foreground active:bg-muted/80"
                            : "text-muted-foreground"
                  )}
                >
                  <span className="text-[9px] font-medium uppercase">{DAY_LABELS[i]}</span>
                  <span className={cn(
                    "text-sm font-bold transition-transform duration-300",
                    isSelected && "animate-[bounce_0.4s_ease-out]"
                  )}>{formatDayNum(d)}</span>
                  {/* Attendance indicator dot */}
                  {hasData && !isSelected && (
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500" />
                  )}
                  {/* Today pulse ring */}
                  {isToday && !isSelected && (
                    <div className="absolute inset-0 rounded-xl ring-2 ring-primary/20 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek("next")} disabled={weekDates[6] >= today}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 justify-start">
          <TrainerFilterDropdown value={selectedTrainerId} onChange={(v) => { setSelectedTrainerId(v); setSelectedSlotId(null); }} compact />
          <TimeSlotFilterDropdown value={selectedSlotId} onChange={setSelectedSlotId} trainerFilter={selectedTrainerId} compact />
        </div>
      </div>

      {/* Search + Quick Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded-lg" />
        </div>
        {!isFutureDate && stats.total > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" className="gap-1 text-[10px] lg:text-[11px] h-8 px-2 text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 active:scale-95 transition-transform" onClick={() => markAll("present")}>
              <CheckCircleIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">All</span> P
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-[10px] lg:text-[11px] h-8 px-2 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 active:scale-95 transition-transform" onClick={() => markAll("absent")}>
              <XCircleIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">All</span> A
            </Button>
          </div>
        )}
      </div>

      {isFutureDate && (
        <Badge variant="destructive" className="text-[10px] h-5 animate-fade-in">Future dates not allowed</Badge>
      )}

      {/* Members List */}
      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground text-sm animate-fade-in">Loading members...</div>
      ) : filteredList.length === 0 ? (
        <div className="py-10 text-center space-y-2 animate-fade-in">
          <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{search ? "No members match." : "No active members found."}</p>
        </div>
      ) : isMobile ? (
        /* Mobile: Card layout */
        <div className="space-y-2">
          {filteredList.map((member, idx) => (
            <div key={member.memberId} className="animate-fade-in" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
              <MobileMemberCard member={member} />
            </div>
          ))}
        </div>
      ) : (
        /* Desktop: Table layout */
        <Card className="border border-border/40 shadow-sm overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 sticky left-0 bg-muted/30 z-10 min-w-[140px]">Member</th>
                  {weekDates.map((d, i) => {
                    const isSelected = d === selectedDate;
                    const isToday = d === today;
                    return (
                      <th key={d} className={cn("text-center text-[11px] font-medium px-1 py-2 min-w-[60px]",
                        isSelected ? "text-primary bg-primary/5" : "text-muted-foreground"
                      )}>
                        <div className="flex flex-col items-center">
                          <span className="uppercase text-[10px]">{DAY_LABELS_FULL[i]}</span>
                          <span className={cn("text-xs font-bold mt-0.5 w-5 h-5 rounded-full flex items-center justify-center",
                            isToday && !isSelected ? "bg-primary/10 text-primary" : "",
                            isSelected ? "bg-primary text-primary-foreground" : ""
                          )}>{formatDayNum(d)}</span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center text-[11px] font-medium text-muted-foreground px-2 py-2 min-w-[90px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredList.map((member) => {
                  const currentStatus = localAttendance.get(member.memberId) || "absent";
                  return (
                    <tr key={member.memberId} className={cn("transition-colors duration-150 hover:bg-muted/10",
                      isFutureDate && "opacity-50 pointer-events-none"
                    )}>
                      <td className="px-3 py-2 sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 transition-colors duration-300",
                            currentStatus === "present" ? "bg-green-500/20 text-green-700 dark:text-green-400" :
                            currentStatus === "late" ? "bg-amber-500/20 text-amber-700" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {member.memberName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate max-w-[100px]">{member.memberName}</p>
                            <p className="text-[10px] text-muted-foreground">{member.memberPhone}</p>
                          </div>
                        </div>
                      </td>
                      {weekDates.map((d) => {
                        const status = d === selectedDate
                          ? localAttendance.get(member.memberId) || null
                          : weekLookup[d]?.[member.memberId] || null;
                        const isSel = d === selectedDate;
                        return (
                          <td key={d} className={cn("text-center px-1 py-2", isSel && "bg-primary/[0.02]")}>
                            {status ? (
                              <div className={cn(
                                "w-6 h-6 rounded-md mx-auto flex items-center justify-center text-[9px] font-bold transition-all duration-200",
                                status === "present" ? "bg-green-500/20 text-green-700 dark:text-green-400" :
                                status === "late" ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" :
                                "bg-red-500/20 text-red-600 dark:text-red-400"
                              )}>
                                {status === "present" ? "P" : status === "late" ? "L" : "A"}
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/30">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          {(["present", "late", "absent"] as const).map((s) => (
                            <button key={s} onClick={() => toggleStatus(member.memberId, s)} disabled={isFutureDate}
                              className={cn(
                                "w-7 h-7 rounded-md text-[10px] font-bold transition-all duration-200 border active:scale-90",
                                currentStatus === s
                                  ? STATUS_COLORS[s] + " border-transparent shadow-sm"
                                  : "bg-transparent text-muted-foreground border-border/40 hover:border-primary/30 hover:bg-muted/30"
                              )}
                            >
                              {s === "present" ? "P" : s === "late" ? "L" : "A"}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Sticky Save Button */}
      {filteredList.length > 0 && !isFutureDate && (
        <div className="sticky bottom-2 z-20 px-1">
          <Button
            className={cn(
              "w-full h-11 lg:h-12 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300 active:scale-[0.98]",
              hasChanges
                ? "bg-foreground text-background hover:bg-foreground/90 shadow-foreground/20"
                : "bg-muted text-muted-foreground"
            )}
            disabled={!hasChanges || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <span className="flex items-center gap-2"><ButtonSpinner /> Saving...</span>
            ) : hasChanges ? (
              <span className="flex items-center gap-1.5">
                Save <span className="hidden sm:inline">Attendance</span>
                <span className="text-xs opacity-75">({stats.present}P · {stats.late}L · {stats.absent}A)</span>
              </span>
            ) : "No changes to save"}
          </Button>
        </div>
      )}
    </div>
  );
};
