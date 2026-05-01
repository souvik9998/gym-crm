import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserGroupIcon,
  UserIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrainerFilterDropdown } from "@/components/admin/TrainerFilterDropdown";
import { TimeSlotFilterDropdown } from "@/components/admin/TimeSlotFilterDropdown";
import { TimeBucketChips } from "@/components/admin/TimeBucketChips";
import { TimeBucketDropdown } from "@/components/admin/TimeBucketDropdown";
import { useAssignedMemberIds } from "@/hooks/useAssignedMembers";
import { useAttendanceFilters } from "@/hooks/queries/useAttendanceFilters";
import { useMembersQuery } from "@/hooks/queries/useMembers";
import { matchesTimeFilter, type TimeBucket } from "@/components/admin/staff/timeslots/timeSlotUtils";
import { useTimeBuckets } from "@/hooks/queries/useTimeBuckets";
import { TimePicker12h } from "@/components/ui/time-picker-12h";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type AttendanceStatus = "present" | "absent" | "skipped";

interface MemberAttendance {
  memberId: string;
  memberName: string;
  memberPhone: string;
  trainerName?: string | null;
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "bg-green-500 text-white shadow-green-500/30",
  skipped: "bg-slate-500 text-white shadow-slate-500/30",
  absent: "bg-red-500/80 text-white shadow-red-500/20",
};

/**
 * Format a Date as a local YYYY-MM-DD string. We deliberately avoid
 * `toISOString()` because that returns UTC, which can shift the date
 * by a day for users in non-UTC timezones (e.g. IST is UTC+5:30, so
 * after ~6:30pm UTC the UTC date is already "tomorrow").
 */
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayIso(): string {
  return toLocalIso(new Date());
}

function getWeekDates(referenceDate: string): string[] {
  const d = new Date(referenceDate + "T00:00:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(toLocalIso(dt));
  }
  return dates;
}

const FULL_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Returns the day-of-week label (Mon, Tue, ...) for a given ISO date string.
 * Used because the visible date range can extend beyond a single Mon-Sun week,
 * so a fixed-index array of labels would mis-label dates.
 */
function dayLabelFull(iso: string): string {
  return FULL_DAY_LABELS[new Date(iso + "T00:00:00").getDay()];
}

function dayLabelShort(iso: string): string {
  return SHORT_DAY_LABELS[new Date(iso + "T00:00:00").getDay()];
}

/**
 * Builds an extended date range so the user can scroll horizontally through
 * recent days, including today. Always includes selectedDate's week (Mon-Sun)
 * AND every day from there through today (clamped). Caps at ~21 days.
 */
function getVisibleDates(referenceDate: string, todayIso: string): string[] {
  const week = getWeekDates(referenceDate);
  const start = week[0];
  // End at the later of: this week's Sunday OR today (so today is always reachable)
  const endIso = week[6] > todayIso ? week[6] : todayIso;
  const startD = new Date(start + "T00:00:00");
  const endD = new Date(endIso + "T00:00:00");
  const dates: string[] = [];
  const cur = new Date(startD);
  let guard = 0;
  while (cur <= endD && guard < 28) {
    dates.push(toLocalIso(cur));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return dates;
}

// Backwards-compatible aliases (existing code references these names)
const DAY_LABELS = SHORT_DAY_LABELS;
const DAY_LABELS_FULL = FULL_DAY_LABELS;

/**
 * Skeleton mirroring the SimpleAttendanceTab member list:
 * - Mobile: stacked cards with avatar + name + 3 status pills + week dots
 * - Desktop: table with sticky member col + 7 day cols + action col
 */
const SimpleAttendanceSkeleton = ({ isMobile, weekDates }: { isMobile: boolean; weekDates: string[] }) => {
  if (isMobile) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-xl border border-border/40 p-3 animate-fade-in"
            style={{ animationDelay: `${Math.min(i * 30, 240)}ms`, animationFillMode: "backwards" }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="w-9 h-9 rounded-lg" />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/20">
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="flex flex-col items-center flex-1 py-1 gap-1">
                  <Skeleton className="h-2 w-2" />
                  <Skeleton className="w-4 h-4 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card className="border border-border/40 shadow-sm overflow-hidden animate-fade-in">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="text-left px-3 py-2 sticky left-0 bg-muted/30 z-10 min-w-[140px]">
                <Skeleton className="h-3 w-14" />
              </th>
              {weekDates.map((d) => (
                <th key={d} className="px-1 py-2 min-w-[60px]">
                  <div className="flex flex-col items-center gap-1">
                    <Skeleton className="h-2.5 w-7" />
                    <Skeleton className="h-3 w-5" />
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 min-w-[90px]">
                <Skeleton className="h-3 w-12 mx-auto" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {Array.from({ length: 10 }).map((_, i) => (
              <tr
                key={i}
                className="animate-fade-in"
                style={{ animationDelay: `${Math.min(i * 30, 270)}ms`, animationFillMode: "backwards" }}
              >
                <td className="px-3 py-2 sticky left-0 bg-background z-10">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                    <div className="min-w-0 space-y-1.5">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  </div>
                </td>
                {weekDates.map((d) => (
                  <td key={d} className="text-center px-1 py-2">
                    <Skeleton className="w-7 h-7 rounded-md mx-auto" />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <Skeleton className="w-6 h-6 rounded" />
                    <Skeleton className="w-6 h-6 rounded" />
                    <Skeleton className="w-7 h-7 rounded" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export const SimpleAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const branchId = currentBranch?.id;

  const today = getTodayIso();
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeBucket>("all");
  const [customStart, setCustomStart] = useState("06:00");
  const [customEnd, setCustomEnd] = useState("10:00");
  const { buckets, options: bucketOptions } = useTimeBuckets();
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [confirmMarkAll, setConfirmMarkAll] = useState<AttendanceStatus | null>(null);
  const { assignedMemberIds } = useAssignedMemberIds();
  const { allSlots } = useAttendanceFilters();
  const { data: scopedMembers = [], isLoading: loadingMembers } = useMembersQuery();

  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  const timeFilteredSlots = useMemo(() => {
    return allSlots.filter((slot) => matchesTimeFilter(slot.start_time, timeFilter, customStart, customEnd, slot.end_time, buckets));
  }, [allSlots, timeFilter, customStart, customEnd, buckets]);

  const filteredSlotIds = useMemo(() => timeFilteredSlots.map((slot) => slot.id), [timeFilteredSlots]);
  const filteredSlotIdSet = useMemo(() => new Set(filteredSlotIds), [filteredSlotIds]);

  const trainerSlotIds = useMemo(() => {
    const scopedSlots = selectedTrainerId
      ? timeFilteredSlots.filter((slot) => slot.trainer_id === selectedTrainerId)
      : timeFilteredSlots;

    return scopedSlots.map((slot) => slot.id);
  }, [timeFilteredSlots, selectedTrainerId]);
  const trainerSlotIdSet = useMemo(() => new Set(trainerSlotIds), [trainerSlotIds]);

  const weekDates = useMemo(() => getVisibleDates(selectedDate, today), [selectedDate, today]);

  // Auto-scroll the date strip so the selected date stays in view when the
  // visible range extends beyond a single week (e.g., includes today).
  const weekStripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = weekStripRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-date="${selectedDate}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedDate, weekDates]);
  const isFutureDate = selectedDate > today;

  const navigateWeek = (dir: "prev" | "next") => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + (dir === "prev" ? -7 : 7));
    let iso = toLocalIso(d);
    // Clamp to today so the user always lands on a valid (selectable) date
    if (iso > today) iso = today;
    if (iso === selectedDate) return;
    setSelectedDate(iso);
  };

  // Disable "next" only when the next week's Monday is already in the future
  const canGoNext = (() => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + 7);
    const nextMonday = getWeekDates(toLocalIso(d))[0];
    return nextMonday <= today;
  })();

  useEffect(() => {
    if (!selectedSlotId) return;

    const isValidSlot = timeFilteredSlots.some((slot) => {
      if (slot.id !== selectedSlotId) return false;
      if (!selectedTrainerId) return true;
      return slot.trainer_id === selectedTrainerId;
    });

    if (!isValidSlot) setSelectedSlotId(null);
  }, [selectedSlotId, selectedTrainerId, timeFilteredSlots]);

  const activeMembers = useMemo(() => {
    return scopedMembers.filter((member) => {
      // Exclude only fully inactive/paused members. Active, expiring_soon and
      // expired members remain markable; admins explicitly deactivate members
      // to remove them from attendance.
      const subscriptionStatus = member.subscription?.status;
      if (subscriptionStatus === "inactive" || subscriptionStatus === "paused") {
        return false;
      }

      const slotId = member.activePT?.time_slot_id;

      // Specific slot filter: only members in that slot, but the slot must still
      // belong to the current time/trainer filtered set.
      if (selectedSlotId) {
        if (!slotId || slotId !== selectedSlotId) return false;
        if (!filteredSlotIdSet.has(slotId)) return false;
        if (selectedTrainerId && !trainerSlotIdSet.has(slotId)) return false;
        return true;
      }

      if (selectedTrainerId || timeFilter !== "all") {
        if (!slotId) return false;
        if (!filteredSlotIdSet.has(slotId)) return false;
        if (selectedTrainerId && !trainerSlotIdSet.has(slotId)) return false;
      }

      return true;
    });
  }, [scopedMembers, selectedSlotId, selectedTrainerId, trainerSlotIds, filteredSlotIds, timeFilter]);

  const rangeStart = weekDates[0];
  const rangeEnd = weekDates[weekDates.length - 1];

  const { data: weekRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["daily-attendance-week", branchId, rangeStart, rangeEnd, isLimitedAccess ? (assignedMemberIds ?? []).join(",") : "all"],
    queryFn: async () => {
      if (!branchId) return [];
      if (assignedMemberIds !== null && assignedMemberIds.length === 0) return [];

      let query = supabase
        .from("daily_attendance").select("id, member_id, date, status, created_at, updated_at")
        .eq("branch_id", branchId)
        .gte("date", rangeStart)
        .lte("date", rangeEnd)
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
  }, [existingRecords]);

  const memberList = useMemo((): MemberAttendance[] => {
    return activeMembers.map((m: any) => ({ memberId: m.id, memberName: m.name, memberPhone: m.phone, trainerName: m.activePT?.trainer_name || null }));
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
    let present = 0, skipped = 0, absent = 0;
    source.forEach((m) => {
      const s = localAttendance.get(m.memberId) || "absent";
      if (s === "present") present++;
      else if (s === "skipped") skipped++;
      else absent++;
    });
    return { total, present, skipped, absent };
  }, [searchedList, localAttendance]);

  // Visible list — applies the status filter card on top of search
  const filteredList = useMemo(() => {
    if (statusFilter === "all") return searchedList;
    return searchedList.filter((m) => {
      const s = localAttendance.get(m.memberId) || "absent";
      return s === statusFilter;
    });
  }, [searchedList, statusFilter, localAttendance]);

  // ── Persist a single member's status immediately (auto-save) ──
  const persistStatus = useCallback(async (memberId: string, status: AttendanceStatus) => {
    if (!branchId || isFutureDate) return;
    setSavingIds((prev) => { const n = new Set(prev); n.add(memberId); return n; });
    try {
      // Remove existing record (if any) for this member/date/branch with no slot, then insert
      await supabase
        .from("daily_attendance").delete()
        .eq("branch_id", branchId).eq("date", selectedDate).is("time_slot_id", null)
        .eq("member_id", memberId);
      const { error } = await supabase.from("daily_attendance").insert({
        member_id: memberId, branch_id: branchId, date: selectedDate,
        status, time_slot_id: null,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["daily-attendance-week", branchId] });
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err.message || "Try again", variant: "destructive" });
    } finally {
      setSavingIds((prev) => { const n = new Set(prev); n.delete(memberId); return n; });
    }
  }, [branchId, isFutureDate, selectedDate, staffUser?.id, isStaffLoggedIn, queryClient]);

  const toggleStatus = useCallback((memberId: string, newStatus: AttendanceStatus) => {
    if (isFutureDate) return;
    const cur = localAttendance.get(memberId) || "absent";
    const finalStatus: AttendanceStatus = cur === newStatus ? "absent" : newStatus;
    setLocalAttendance((prev) => { const next = new Map(prev); next.set(memberId, finalStatus); return next; });
    persistStatus(memberId, finalStatus);
  }, [isFutureDate, localAttendance, persistStatus]);

  const markAll = useCallback(async (status: AttendanceStatus) => {
    if (isFutureDate || !branchId) return;
    const ids = filteredList.map((m) => m.memberId);
    if (ids.length === 0) return;
    // Optimistic local state
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.set(id, status));
      return next;
    });
    setSavingIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n; });
    try {
      await supabase
        .from("daily_attendance").delete()
        .eq("branch_id", branchId).eq("date", selectedDate).is("time_slot_id", null)
        .in("member_id", ids);
      const records = ids.map((id) => ({
        member_id: id, branch_id: branchId, date: selectedDate, status,
        time_slot_id: null as string | null,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
      }));
      const { error } = await supabase.from("daily_attendance").insert(records);
      if (error) throw error;
      toast({ title: "Marked all", description: `${ids.length} members marked ${status}.` });
      queryClient.invalidateQueries({ queryKey: ["daily-attendance-week", branchId] });
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    } catch (err: any) {
      toast({ title: "Couldn't mark all", description: err.message, variant: "destructive" });
    } finally {
      setSavingIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
    }
  }, [filteredList, isFutureDate, branchId, selectedDate, staffUser?.id, isStaffLoggedIn, queryClient]);

  const isLoading = loadingMembers || loadingRecords;
  const formatShortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const formatDayNum = (d: string) => new Date(d + "T00:00:00").getDate();
  const formatFullDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const formatTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : null;
  const statusLabel = (s: AttendanceStatus | null) => s === "present" ? "Present" : s === "skipped" ? "Skipped" : s === "absent" ? "Absent" : "Not marked";

  // ── Mobile card-based member row ──
  const MobileMemberCard = ({ member }: { member: MemberAttendance }) => {
    const currentStatus = localAttendance.get(member.memberId) || "absent";
    return (
      <div className={cn(
        "bg-card rounded-xl border p-3 transition-all duration-200",
        currentStatus === "present" ? "border-green-200 dark:border-green-900/40" :
        currentStatus === "skipped" ? "border-slate-300 dark:border-slate-700/60" :
        "border-border/40",
        isFutureDate && "opacity-50 pointer-events-none"
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors duration-300",
              currentStatus === "present" ? "bg-green-500/20 text-green-700 dark:text-green-400" :
              currentStatus === "skipped" ? "bg-slate-500/20 text-slate-700 dark:text-slate-300" :
              "bg-muted text-muted-foreground"
            )}>
              {member.memberName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-sm font-medium truncate">{member.memberName}</p>
                {member.trainerName && (
                  <Badge variant="outline" className="text-[8px] h-4 px-1 border-blue-300/50 text-blue-600 dark:text-blue-400 bg-blue-500/5 shrink-0">
                    <UserIcon className="w-2 h-2 mr-0.5" />{member.trainerName}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{member.memberPhone}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(["present", "skipped", "absent"] as const).map((s) => (
              <button
                key={s}
                onClick={() => toggleStatus(member.memberId, s)}
                disabled={isFutureDate}
                title={s === "present" ? "Present" : s === "skipped" ? "Skipped" : "Absent"}
                className={cn(
                  "w-9 h-9 rounded-lg text-xs font-bold transition-all duration-200 border active:scale-90",
                  currentStatus === s
                    ? STATUS_COLORS[s] + " border-transparent shadow-md"
                    : "bg-transparent text-muted-foreground border-border/50 hover:bg-muted/50"
                )}
              >
                {s === "present" ? "P" : s === "skipped" ? "S" : "A"}
              </button>
            ))}
          </div>
        </div>
        {/* Mini week dots — clickable, with tooltip showing details */}
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/20">
          {weekDates.map((d, i) => {
            const isFuture = d > today;
            const isSel = d === selectedDate;
            const rec = weekLookup[d]?.[member.memberId] || null;
            const st = isSel
              ? localAttendance.get(member.memberId) || null
              : rec?.status || null;
            const markedAt = isSel ? null : rec?.markedAt || null;
            return (
              <Tooltip key={d} delayDuration={150}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={isFuture}
                    onClick={(e) => { e.stopPropagation(); if (!isFuture) setSelectedDate(d); }}
                    className={cn(
                      "flex flex-col items-center flex-1 rounded-md py-1 transition-all duration-200",
                      !isFuture && "active:scale-90 hover:bg-muted/50",
                      isSel && "bg-primary/10 ring-1 ring-primary/30",
                      isFuture && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <span className="text-[8px] text-muted-foreground">{dayLabelShort(d)}</span>
                    <div className={cn(
                      "w-4 h-4 rounded-full mt-0.5 transition-colors duration-300",
                      st === "present" ? "bg-green-500" :
                      st === "skipped" ? "bg-slate-500" :
                      st === "absent" ? "bg-red-400" :
                      "bg-muted/60"
                    )} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="font-semibold">{formatFullDate(d)}</div>
                  <div className="text-muted-foreground">{statusLabel(st)}{markedAt ? ` · ${formatTime(markedAt)}` : ""}</div>
                  {!isFuture && !isSel && <div className="text-[10px] text-primary mt-0.5">Click to view this day</div>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4 animate-fade-in">
      {/* Desktop: Week Nav row + Filters row (separate to prevent overflow/clipping) */}
      <div className="hidden lg:block space-y-3">
        {/* Week Navigation */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek("prev")}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <div ref={weekStripRef} className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
            {weekDates.map((d) => {
              const isSelected = d === selectedDate;
              const isToday = d === today;
              const isFuture = d > today;
              const isPast = d < today;
              const hasData = weekLookup[d] && Object.keys(weekLookup[d]).length > 0;
              return (
                <button
                  key={d}
                  data-date={d}
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
                  <span className="text-[10px] font-medium uppercase">{dayLabelFull(d)}</span>
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
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek("next")} disabled={!canGoNext}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Filters: time chips take full row width; trainer + slot dropdowns sit alongside */}
        <div className="flex items-stretch gap-3">
          <TimeBucketChips
            value={timeFilter}
            onChange={setTimeFilter}
            options={bucketOptions}
            compact
            className="flex-1 min-w-0"
          />
          <div className="flex items-center gap-2 shrink-0">
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
      </div>

      {timeFilter === "custom" && (
        <div className="hidden lg:grid gap-3 rounded-xl border border-border/50 bg-card/60 p-3 sm:grid-cols-2 lg:max-w-md animate-fade-in">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Start time</label>
            <TimePicker12h value={customStart} onChange={setCustomStart} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">End time</label>
            <TimePicker12h value={customEnd} onChange={setCustomEnd} />
          </div>
        </div>
      )}

      {/* Filter Pills — colorful segmented filters */}
      <div className="flex items-center gap-1.5 lg:gap-2 p-1 rounded-xl bg-gradient-to-r from-muted/40 via-muted/20 to-muted/40 border border-border/40 overflow-x-auto scrollbar-hide animate-fade-in">
        {([
          {
            key: "all",
            label: "All",
            count: stats.total,
            inactive: "text-muted-foreground hover:text-foreground hover:bg-background/60",
            active: "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/30",
            badgeActive: "bg-primary-foreground/20 text-primary-foreground",
            badgeInactive: "bg-foreground/10 text-foreground",
            dot: "bg-foreground/60",
            dotActive: "bg-primary-foreground",
          },
          {
            key: "present",
            label: "Present",
            count: stats.present,
            inactive: "text-green-700 dark:text-green-400 hover:bg-green-500/10",
            active: "bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-md shadow-green-500/30",
            badgeActive: "bg-white/20 text-white",
            badgeInactive: "bg-green-500/15 text-green-700 dark:text-green-400",
            dot: "bg-green-500",
            dotActive: "bg-white",
          },
          {
            key: "skipped",
            label: "Skipped",
            count: stats.skipped,
            inactive: "text-slate-700 dark:text-slate-300 hover:bg-slate-500/10",
            active: "bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-md shadow-slate-500/30",
            badgeActive: "bg-white/20 text-white",
            badgeInactive: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
            dot: "bg-slate-500",
            dotActive: "bg-white",
          },
          {
            key: "absent",
            label: "Absent",
            count: stats.absent,
            inactive: "text-red-700 dark:text-red-400 hover:bg-red-500/10",
            active: "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-md shadow-red-500/30",
            badgeActive: "bg-white/20 text-white",
            badgeInactive: "bg-red-500/15 text-red-700 dark:text-red-400",
            dot: "bg-red-500",
            dotActive: "bg-white",
          },
        ] as const).map((pill) => {
          const isActive = statusFilter === pill.key;
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => setStatusFilter(isActive ? "all" : pill.key as any)}
              className={cn(
                "flex-1 min-w-[80px] flex items-center justify-center gap-1.5 lg:gap-2 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-lg text-xs lg:text-sm font-semibold transition-all duration-300 whitespace-nowrap",
                "active:scale-95",
                isActive ? cn(pill.active, "scale-[1.03]") : pill.inactive
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 transition-colors", isActive ? pill.dotActive : pill.dot)} />
              <span>{pill.label}</span>
              <span className={cn(
                "text-[10px] lg:text-xs px-1.5 py-0.5 rounded-full font-bold tabular-nums transition-colors",
                isActive ? pill.badgeActive : pill.badgeInactive
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
                  <span className="text-[9px] font-medium uppercase">{dayLabelShort(d)}</span>
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
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek("next")} disabled={!canGoNext}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {/* Desktop & tablet: full chip strip */}
          <div className="hidden sm:block">
            <TimeBucketChips
              value={timeFilter}
              onChange={setTimeFilter}
              options={bucketOptions}
              className="w-full"
            />
          </div>
          {/* Mobile: 3-up dropdown row aligned with Trainer + Slot */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
            <div className="sm:hidden">
              <TimeBucketDropdown value={timeFilter} onChange={setTimeFilter} options={bucketOptions} />
            </div>
            <TrainerFilterDropdown value={selectedTrainerId} onChange={(v) => { setSelectedTrainerId(v); setSelectedSlotId(null); }} compact />
            <TimeSlotFilterDropdown value={selectedSlotId} onChange={setSelectedSlotId} trainerFilter={selectedTrainerId} compact />
          </div>
          {timeFilter === "custom" && (
            <div className="grid gap-2 rounded-xl border border-border/50 bg-card/60 p-3 sm:grid-cols-2 animate-fade-in">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Start time</label>
                <TimePicker12h value={customStart} onChange={setCustomStart} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">End time</label>
                <TimePicker12h value={customEnd} onChange={setCustomEnd} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search + Quick Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search members" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-10 text-sm rounded-xl" />
        </div>
        {!isFutureDate && stats.total > 0 && (
          <div className="grid grid-cols-2 gap-2 shrink-0 sm:flex sm:items-center">
            <Button variant="outline" size="sm" className="gap-1 h-10 rounded-xl px-3 text-xs text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 active:scale-95 transition-transform" onClick={() => setConfirmMarkAll("present")}>
              <CheckCircleIcon className="w-3.5 h-3.5" /> <span>All P</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1 h-10 rounded-xl px-3 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 active:scale-95 transition-transform" onClick={() => setConfirmMarkAll("absent")}>
              <XCircleIcon className="w-3.5 h-3.5" /> <span>All A</span>
            </Button>
          </div>
        )}
      </div>

      {isFutureDate && (
        <Badge variant="destructive" className="text-[10px] h-5 animate-fade-in">Future dates not allowed</Badge>
      )}

      {/* Members List */}
      {isLoading ? (
        <SimpleAttendanceSkeleton isMobile={isMobile} weekDates={weekDates} />
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
            <table className="w-full" style={{ minWidth: `${230 + weekDates.length * 60 + 100}px` }}>
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 sticky left-0 bg-muted/30 z-20 min-w-[140px]">Member</th>
                  {weekDates.map((d) => {
                    const isSelected = d === selectedDate;
                    const isToday = d === today;
                    const isFuture = d > today;
                    return (
                      <th key={d} className={cn("text-center text-[11px] font-medium px-1 py-2 min-w-[60px] transition-colors",
                        isSelected ? "text-primary bg-primary/5" : "text-muted-foreground"
                      )}>
                        <button
                          type="button"
                          disabled={isFuture}
                          onClick={() => { if (!isFuture) setSelectedDate(d); }}
                          title={isFuture ? "Future date" : `Select ${formatFullDate(d)}`}
                          className={cn(
                            "flex flex-col items-center w-full rounded-md py-1 transition-all duration-200",
                            !isFuture && "hover:bg-primary/10 hover:text-primary cursor-pointer active:scale-95",
                            isFuture && "opacity-40 cursor-not-allowed",
                            isSelected && "bg-primary/10"
                          )}
                        >
                          <span className="uppercase text-[10px]">{dayLabelFull(d)}</span>
                          <span className={cn("text-xs font-bold mt-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors",
                            isToday && !isSelected ? "bg-primary/10 text-primary" : "",
                            isSelected ? "bg-primary text-primary-foreground shadow-sm" : ""
                          )}>{formatDayNum(d)}</span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="text-center text-[11px] font-medium text-muted-foreground px-2 py-2 min-w-[100px] sticky right-0 bg-muted/30 z-20 shadow-[-4px_0_8px_-4px_hsl(var(--border)/0.4)]">Action</th>
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
                            currentStatus === "skipped" ? "bg-slate-500/20 text-slate-700" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {member.memberName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <p className="text-xs font-medium truncate max-w-[100px]">{member.memberName}</p>
                              {member.trainerName && (
                                <Badge variant="outline" className="text-[8px] h-4 px-1 border-blue-300/50 text-blue-600 dark:text-blue-400 bg-blue-500/5 shrink-0">
                                  <UserIcon className="w-2 h-2 mr-0.5" />{member.trainerName}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground">{member.memberPhone}</p>
                          </div>
                        </div>
                      </td>
                      {weekDates.map((d) => {
                        const isSel = d === selectedDate;
                        const isFuture = d > today;
                        const rec = weekLookup[d]?.[member.memberId] || null;
                        const status: AttendanceStatus | null = isSel
                          ? localAttendance.get(member.memberId) || null
                          : rec?.status || null;
                        const markedAt = isSel ? null : rec?.markedAt || null;
                        return (
                          <td key={d} className={cn("text-center px-1 py-2", isSel && "bg-primary/[0.02]")}>
                            <Tooltip delayDuration={150}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={isFuture}
                                  onClick={() => { if (!isFuture) setSelectedDate(d); }}
                                  className={cn(
                                    "w-7 h-7 rounded-md mx-auto flex items-center justify-center text-[10px] font-bold transition-all duration-200",
                                    !isFuture && "hover:scale-110 active:scale-95 cursor-pointer",
                                    isSel && "ring-1 ring-primary/40",
                                    isFuture && "opacity-40 cursor-not-allowed",
                                    status === "present" ? "bg-green-500/20 text-green-700 dark:text-green-400" :
                                    status === "skipped" ? "bg-slate-500/20 text-slate-700 dark:text-slate-300" :
                                    status === "absent" ? "bg-red-500/20 text-red-600 dark:text-red-400" :
                                    "bg-transparent text-muted-foreground/40 hover:bg-muted/50"
                                  )}
                                >
                                  {status === "present" ? "P" : status === "skipped" ? "S" : status === "absent" ? "A" : "—"}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <div className="font-semibold">{member.memberName}</div>
                                <div className="text-muted-foreground">{formatFullDate(d)}</div>
                                <div className="mt-0.5">{statusLabel(status)}{markedAt ? ` · ${formatTime(markedAt)}` : ""}</div>
                                {!isFuture && !isSel && <div className="text-[10px] text-primary mt-0.5">Click to view this day</div>}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center sticky right-0 bg-background z-10 shadow-[-4px_0_8px_-4px_hsl(var(--border)/0.4)]">
                        <div className="flex items-center justify-center gap-0.5">
                          {(["present", "skipped", "absent"] as const).map((s) => (
                            <button key={s} onClick={() => toggleStatus(member.memberId, s)} disabled={isFutureDate}
                              title={s === "present" ? "Present" : s === "skipped" ? "Skipped" : "Absent"}
                              className={cn(
                                "w-7 h-7 rounded-md text-[10px] font-bold transition-all duration-200 border active:scale-90",
                                currentStatus === s
                                  ? STATUS_COLORS[s] + " border-transparent shadow-sm"
                                  : "bg-transparent text-muted-foreground border-border/40 hover:border-primary/30 hover:bg-muted/30"
                              )}
                            >
                              {s === "present" ? "P" : s === "skipped" ? "S" : "A"}
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

      {/* Auto-save status indicator */}
      {savingIds.size > 0 && (
        <div className="sticky bottom-2 z-20 px-1 pointer-events-none">
          <div className="mx-auto w-fit flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/90 text-background text-xs shadow-lg backdrop-blur animate-fade-in">
            <ButtonSpinner /> Saving…
          </div>
        </div>
      )}
    </div>
    <ConfirmDialog
      open={confirmMarkAll !== null}
      onOpenChange={(open) => { if (!open) setConfirmMarkAll(null); }}
      title={confirmMarkAll === "present" ? "Mark all as Present?" : "Mark all as Absent?"}
      description={`This will mark all ${filteredList.length} visible member(s) as ${confirmMarkAll === "present" ? "Present" : "Absent"} for ${selectedDate}. Existing entries for these members on this date will be replaced.`}
      confirmText={confirmMarkAll === "present" ? "Mark All Present" : "Mark All Absent"}
      variant={confirmMarkAll === "absent" ? "destructive" : "default"}
      onConfirm={() => { if (confirmMarkAll) markAll(confirmMarkAll); }}
    />
    </TooltipProvider>
  );
};
