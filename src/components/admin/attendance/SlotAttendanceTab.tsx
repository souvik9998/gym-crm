import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserGroupIcon,
  CheckBadgeIcon,
  FunnelIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { AttendanceDatePicker } from "./AttendanceDatePicker";
import { useAttendanceFilters } from "@/hooks/queries/useAttendanceFilters";
import { useAssignedMemberIds } from "@/hooks/useAssignedMembers";
import { useMembersQuery } from "@/hooks/queries/useMembers";
import { formatTimeLabel, matchesTimeFilter, type TimeBucket } from "@/components/admin/staff/timeslots/timeSlotUtils";
import { TimeBucketChips } from "@/components/admin/TimeBucketChips";
import { useTimeBuckets } from "@/hooks/queries/useTimeBuckets";
import { TimePicker12h } from "@/components/ui/time-picker-12h";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type AttendanceStatus = "present" | "absent" | "skipped";

type AttendanceMemberRow = {
  memberId: string;
  memberName: string;
  memberPhone: string;
  slotId: string;
  slotLabel: string;
  trainerId: string;
  trainerName: string;
  status: AttendanceStatus;
  subscriptionStatus: string | null;
};

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "border-success/25 bg-success/10 text-foreground",
  skipped: "border-muted-foreground/25 bg-muted/40 text-foreground",
  absent: "border-destructive/20 bg-destructive/10 text-foreground",
};

const STATUS_BUTTON_STYLES: Record<AttendanceStatus, string> = {
  present: "border-success/30 bg-success text-success-foreground shadow-sm",
  skipped: "border-muted-foreground/30 bg-muted-foreground text-background shadow-sm",
  absent: "border-destructive/25 bg-destructive text-destructive-foreground shadow-sm",
};

const SUB_STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "border-success/30 bg-success/10 text-success" },
  expiring_soon: { label: "Expiring", className: "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  expired: { label: "Expired", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

export const SlotAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("all");
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<TimeBucket>("all");
  const [customStart, setCustomStart] = useState("06:00");
  const [customEnd, setCustomEnd] = useState("10:00");
  const { buckets, options: bucketOptions } = useTimeBuckets();
  const [search, setSearch] = useState("");
  const [slotSearch, setSlotSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [confirmMarkAll, setConfirmMarkAll] = useState<AttendanceStatus | null>(null);

  const { assignedMemberIds } = useAssignedMemberIds();
  const { data: scopedMembers = [], isLoading: loadingMembers } = useMembersQuery();
  const { trainers, allSlots, isLimitedAccess, staffTrainerId } = useAttendanceFilters();

  const isFutureDate = selectedDate > today;

  useEffect(() => {
    if (staffTrainerId) {
      setSelectedTrainerId(staffTrainerId);
    }
  }, [staffTrainerId]);

  const filteredSlots = useMemo(() => {
    return allSlots.filter((slot) => {
      if (selectedTrainerId !== "all" && slot.trainer_id !== selectedTrainerId) return false;
      if (!matchesTimeFilter(slot.start_time, timeFilter, customStart, customEnd, slot.end_time, buckets)) return false;
      if (!slotSearch.trim()) return true;

      const query = slotSearch.toLowerCase();
      const slotText = `${slot.trainer_name} ${formatTimeLabel(slot.start_time)} ${formatTimeLabel(slot.end_time)}`.toLowerCase();
      return slotText.includes(query);
    });
  }, [allSlots, selectedTrainerId, timeFilter, customStart, customEnd, slotSearch, buckets]);

  useEffect(() => {
    if (selectedSlotId === "all") return;
    if (!filteredSlots.some((slot) => slot.id === selectedSlotId)) {
      setSelectedSlotId("all");
    }
  }, [filteredSlots, selectedSlotId]);

  const visibleSlots = useMemo(() => {
    if (selectedSlotId === "all") return filteredSlots;
    return filteredSlots.filter((slot) => slot.id === selectedSlotId);
  }, [filteredSlots, selectedSlotId]);

  const visibleSlotIds = useMemo(() => visibleSlots.map((slot) => slot.id), [visibleSlots]);

  const slotLookup = useMemo(() => {
    const map = new Map<string, { slotLabel: string; trainerName: string; trainerId: string }>();
    allSlots.forEach((slot) => {
      map.set(slot.id, {
        slotLabel: `${formatTimeLabel(slot.start_time)} – ${formatTimeLabel(slot.end_time)}`,
        trainerName: slot.trainer_name,
        trainerId: slot.trainer_id,
      });
    });
    return map;
  }, [allSlots]);

  const slotMembers = useMemo(() => {
    if (visibleSlotIds.length === 0) return [];

    return scopedMembers.filter((member) => {
      // Exclude only fully inactive/paused members. Active, expiring_soon and
      // expired members assigned to a slot should still appear in attendance
      // (admins often need to mark expired members until they renew or are
      // explicitly deactivated).
      const subscriptionStatus = member.subscription?.status;
      if (subscriptionStatus === "inactive" || subscriptionStatus === "paused") return false;

      const slotId = member.activePT?.time_slot_id;
      return !!slotId && visibleSlotIds.includes(slotId);
    });
  }, [scopedMembers, visibleSlotIds]);

  const { data: existingRecords = [], isLoading: loadingRecords, isFetching: fetchingRecords } = useQuery({
    queryKey: [
      "daily-attendance-slot",
      branchId,
      selectedDate,
      visibleSlotIds.join(","),
      isLimitedAccess ? (assignedMemberIds ?? []).join(",") : "all",
    ],
    queryFn: async () => {
      if (!branchId || visibleSlotIds.length === 0) return [];
      if (assignedMemberIds !== null && assignedMemberIds.length === 0) return [];

      let query = supabase
        .from("daily_attendance")
        .select("id, member_id, status, time_slot_id")
        .eq("branch_id", branchId)
        .eq("date", selectedDate)
        .in("time_slot_id", visibleSlotIds);

      if (assignedMemberIds !== null) {
        query = query.in("member_id", assignedMemberIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && visibleSlotIds.length > 0 && (!isLimitedAccess || assignedMemberIds !== undefined),
  });

  useEffect(() => {
    const next = new Map<string, AttendanceStatus>();
    existingRecords.forEach((record: any) => {
      next.set(`${record.time_slot_id}:${record.member_id}`, record.status as AttendanceStatus);
    });
    setLocalAttendance(next);
  }, [existingRecords]);

  const memberList = useMemo<AttendanceMemberRow[]>(() => {
    return slotMembers
      .map((member: any) => {
        const slotId = member.activePT?.time_slot_id;
        if (!slotId) return null;

        const slotMeta = slotLookup.get(slotId);
        if (!slotMeta) return null;

        return {
          memberId: member.id,
          memberName: member.name,
          memberPhone: member.phone,
          slotId,
          slotLabel: slotMeta.slotLabel,
          trainerId: slotMeta.trainerId,
          trainerName: slotMeta.trainerName,
          status: (localAttendance.get(`${slotId}:${member.id}`) || "absent") as AttendanceStatus,
          subscriptionStatus: member.subscription?.status || null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a!.slotLabel !== b!.slotLabel) return a!.slotLabel.localeCompare(b!.slotLabel);
        return a!.memberName.localeCompare(b!.memberName);
      }) as AttendanceMemberRow[];
  }, [slotMembers, slotLookup, localAttendance]);

  const filteredList = useMemo(() => {
    return memberList.filter((member) => {
      if (statusFilter !== "all" && member.status !== statusFilter) return false;
      if (!search.trim()) return true;

      const query = search.toLowerCase();
      return [member.memberName, member.memberPhone, member.trainerName, member.slotLabel]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [memberList, search, statusFilter]);

  const stats = useMemo(() => ({
    total: memberList.length,
    present: memberList.filter((member) => member.status === "present").length,
    skipped: memberList.filter((member) => member.status === "skipped").length,
    absent: memberList.filter((member) => member.status === "absent").length,
  }), [memberList]);

  const setSavingState = (keys: string[], isSaving: boolean) => {
    setSavingKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => {
        if (isSaving) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  };

  const persistStatus = useCallback(async (memberId: string, slotId: string, status: AttendanceStatus) => {
    if (!branchId || isFutureDate) return;
    const recordKey = `${slotId}:${memberId}`;
    setSavingState([recordKey], true);

    try {
      await supabase
        .from("daily_attendance")
        .delete()
        .eq("branch_id", branchId)
        .eq("date", selectedDate)
        .eq("time_slot_id", slotId)
        .eq("member_id", memberId);

      const { error } = await supabase.from("daily_attendance").insert({
        member_id: memberId,
        branch_id: branchId,
        date: selectedDate,
        status,
        time_slot_id: slotId,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["daily-attendance-slot", branchId, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    } catch (err: any) {
      toast({ title: "Couldn't save attendance", description: err.message || "Try again", variant: "destructive" });
    } finally {
      setSavingState([recordKey], false);
    }
  }, [branchId, isFutureDate, selectedDate, staffUser?.id, isStaffLoggedIn, queryClient]);

  const toggleStatus = useCallback((member: AttendanceMemberRow, nextStatus: AttendanceStatus) => {
    if (isFutureDate) return;

    const recordKey = `${member.slotId}:${member.memberId}`;
    const currentStatus = localAttendance.get(recordKey) || "absent";
    const finalStatus: AttendanceStatus = currentStatus === nextStatus ? "absent" : nextStatus;

    setLocalAttendance((prev) => {
      const next = new Map(prev);
      next.set(recordKey, finalStatus);
      return next;
    });

    persistStatus(member.memberId, member.slotId, finalStatus);
  }, [isFutureDate, localAttendance, persistStatus]);

  const markAll = useCallback(async (status: AttendanceStatus) => {
    if (isFutureDate || !branchId || filteredList.length === 0) return;

    const recordKeys = filteredList.map((member) => `${member.slotId}:${member.memberId}`);
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      filteredList.forEach((member) => next.set(`${member.slotId}:${member.memberId}`, status));
      return next;
    });
    setSavingState(recordKeys, true);

    try {
      const slotIds = Array.from(new Set(filteredList.map((member) => member.slotId)));
      const memberIds = filteredList.map((member) => member.memberId);

      await supabase
        .from("daily_attendance")
        .delete()
        .eq("branch_id", branchId)
        .eq("date", selectedDate)
        .in("time_slot_id", slotIds)
        .in("member_id", memberIds);

      const records = filteredList.map((member) => ({
        member_id: member.memberId,
        branch_id: branchId,
        date: selectedDate,
        status,
        time_slot_id: member.slotId,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
      }));

      const { error } = await supabase.from("daily_attendance").insert(records);
      if (error) throw error;

      toast({
        title: "Attendance updated",
        description: `${filteredList.length} filtered member${filteredList.length === 1 ? "" : "s"} marked ${status}.`,
      });

      queryClient.invalidateQueries({ queryKey: ["daily-attendance-slot", branchId, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    } catch (err: any) {
      toast({ title: "Couldn't update filtered members", description: err.message || "Try again", variant: "destructive" });
    } finally {
      setSavingState(recordKeys, false);
    }
  }, [isFutureDate, branchId, filteredList, selectedDate, staffUser?.id, isStaffLoggedIn, queryClient]);

  const isLoading = loadingMembers || loadingRecords;

  const MobileMemberCard = ({ member, idx }: { member: AttendanceMemberRow; idx: number }) => (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 transition-all duration-200 animate-fade-in",
        member.status === "present" ? "border-success/25 bg-success/5" : member.status === "skipped" ? "border-muted-foreground/25 bg-muted/30" : "border-border/50",
        isFutureDate && "pointer-events-none opacity-60",
      )}
      style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {member.memberName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{member.memberName}</p>
              <p className="text-[11px] text-muted-foreground">{member.memberPhone}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-[10px] text-foreground">{member.slotLabel}</Badge>
            <Badge variant="outline" className="border-accent/20 bg-accent/5 text-[10px] text-foreground">{member.trainerName}</Badge>
          </div>
        </div>
        <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[member.status])}>
          {member.status}
        </Badge>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {(["present", "skipped", "absent"] as const).map((status) => (
          <button
            key={status}
            onClick={() => toggleStatus(member, status)}
            disabled={isFutureDate}
            className={cn(
              "flex h-9 min-w-[44px] flex-1 items-center justify-center rounded-lg border text-[11px] font-semibold transition-all duration-200 active:scale-95",
              member.status === status
                ? STATUS_BUTTON_STYLES[status]
                : "border-border/50 bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {status === "present" ? "Present" : status === "skipped" ? "Skip" : "Absent"}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Present", count: stats.present, icon: CheckCircleIcon, tone: "bg-success/10 text-success" },
          { label: "Skipped", count: stats.skipped, icon: ClockIcon, tone: "bg-muted-foreground/10 text-muted-foreground" },
          { label: "Absent", count: stats.absent, icon: XCircleIcon, tone: "bg-destructive/10 text-destructive" },
          { label: "Filtered", count: filteredList.length, icon: UserGroupIcon, tone: "bg-primary/10 text-primary" },
        ].map((stat, idx) => (
          <Card key={stat.label} className="border-border/50 shadow-sm animate-fade-in" style={{ animationDelay: `${idx * 40}ms` }}>
            <CardContent className="p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", stat.tone)}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-xl font-semibold text-foreground">{stat.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 bg-card/75 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-card/65">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <FunnelIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Time-based attendance filters</p>
                {fetchingRecords && <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="text-xs text-muted-foreground">Filter members by time window, trainer, and slot, then mark attendance only for the visible set.</p>
            </div>
          </div>

          <TimeBucketChips value={timeFilter} onChange={setTimeFilter} options={bucketOptions} />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <AttendanceDatePicker value={selectedDate} onChange={setSelectedDate} className="w-full" disableFuture />
            </div>

            {!isLimitedAccess && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Trainer</label>
                <Select value={selectedTrainerId} onValueChange={setSelectedTrainerId}>
                  <SelectTrigger className="h-10 border-border/70 bg-background/70 text-sm backdrop-blur-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All trainers</SelectItem>
                    {trainers.map((trainer) => (
                      <SelectItem key={trainer.id} value={trainer.id}>{trainer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1 xl:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Search slot or member</label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search trainer, time, member, or phone..."
                  value={selectedSlotId === "all" ? `${slotSearch}${search ? ` ${search}` : ""}`.trim() : search}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearch(value);
                    if (selectedSlotId === "all") setSlotSearch(value);
                  }}
                  className="h-10 border-border/70 bg-background/70 pl-8 text-sm backdrop-blur-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Exact slot</label>
              <Select value={selectedSlotId} onValueChange={setSelectedSlotId}>
                <SelectTrigger className="h-10 border-border/70 bg-background/70 text-sm backdrop-blur-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All filtered slots</SelectItem>
                  {filteredSlots.map((slot) => (
                    <SelectItem key={slot.id} value={slot.id}>
                      {slot.trainer_name} • {formatTimeLabel(slot.start_time)} – {formatTimeLabel(slot.end_time)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {timeFilter === "custom" && (
            <div className="grid gap-3 rounded-xl border border-success/20 bg-success/5 p-3 sm:grid-cols-2 lg:max-w-md">
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

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-foreground">{filteredSlots.length} slot{filteredSlots.length === 1 ? "" : "s"}</Badge>
            <Badge variant="outline" className="border-accent/20 bg-accent/5 text-foreground">{filteredList.length} visible member{filteredList.length === 1 ? "" : "s"}</Badge>
            {selectedSlotId !== "all" && visibleSlots[0] && (
              <Badge variant="secondary" className="border border-primary/20 bg-primary/12 text-foreground">
                {visibleSlots[0].trainer_name} • {formatTimeLabel(visibleSlots[0].start_time)} – {formatTimeLabel(visibleSlots[0].end_time)}
              </Badge>
            )}
            {isFutureDate && <Badge variant="destructive">Future dates blocked</Badge>}
          </div>
        </CardContent>
      </Card>

      {visibleSlots.length === 0 ? (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="py-12 text-center">
            <ClockIcon className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{isLimitedAccess ? "No time slots assigned to you in this filter." : "No time slots match the current filters."}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {!isFutureDate && filteredList.length > 0 && (
            <div className={cn("gap-2", isMobile ? "grid grid-cols-1" : "flex flex-wrap items-center")}>
              <span className="text-xs text-muted-foreground">Quick mark visible:</span>
              <div className={cn("gap-2", isMobile ? "grid grid-cols-3" : "flex flex-wrap items-center") }>
              <Button variant="outline" size="sm" className="gap-1 border-success/25 text-success hover:bg-success/10 h-10 rounded-xl" onClick={() => setConfirmMarkAll("present")}>
                <CheckBadgeIcon className="h-3.5 w-3.5" /> All Present
              </Button>
              <Button variant="outline" size="sm" className="gap-1 border-muted-foreground/25 text-foreground hover:bg-muted/40 h-10 rounded-xl" onClick={() => setConfirmMarkAll("skipped")}>
                <ClockIcon className="h-3.5 w-3.5" /> All Skip
              </Button>
              <Button variant="outline" size="sm" className="gap-1 border-destructive/25 text-destructive hover:bg-destructive/10 h-10 rounded-xl" onClick={() => setConfirmMarkAll("absent")}>
                <XCircleIcon className="h-3.5 w-3.5" /> All Absent
              </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {[
              { key: "all", label: "All" },
              { key: "present", label: "Present" },
              { key: "skipped", label: "Skipped" },
              { key: "absent", label: "Absent" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setStatusFilter(item.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-200 active:scale-95",
                  statusFilter === item.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading attendance list...</CardContent>
            </Card>
          ) : filteredList.length === 0 ? (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="py-12 text-center">
                <UserGroupIcon className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{search ? "No filtered members match this search." : "No members available for the current slot filter."}</p>
              </CardContent>
            </Card>
          ) : isMobile ? (
            <div className="space-y-2">
              {filteredList.map((member, idx) => <MobileMemberCard key={`${member.slotId}:${member.memberId}`} member={member} idx={idx} />)}
            </div>
          ) : (
            <Card className="overflow-hidden border-border/50 shadow-sm animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px]">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Member</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Phone</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Trainer</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Time Slot</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground w-[180px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredList.map((member) => {
                      const recordKey = `${member.slotId}:${member.memberId}`;
                      const isSavingRow = savingKeys.has(recordKey);

                      return (
                        <tr
                          key={recordKey}
                          className={cn(
                            "transition-colors duration-150 hover:bg-muted/10",
                            member.status === "present" && "bg-success/5",
                            member.status === "skipped" && "bg-muted/30",
                            isFutureDate && "pointer-events-none opacity-60",
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {member.memberName.charAt(0).toUpperCase()}
                              </div>
                              <p className="text-sm font-medium text-foreground">{member.memberName}</p>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-sm text-muted-foreground">{member.memberPhone}</td>
                          <td className="px-3 py-2.5 text-sm text-foreground">{member.trainerName}</td>
                          <td className="px-3 py-2.5 text-sm text-muted-foreground">{member.slotLabel}</td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge variant="outline" className={cn("text-[11px] capitalize", STATUS_STYLES[member.status])}>{member.status}</Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-1">
                              {(["present", "skipped", "absent"] as const).map((status) => (
                                <button
                                  key={status}
                                  onClick={() => toggleStatus(member, status)}
                                  disabled={isFutureDate}
                                  title={status === "present" ? "Present" : status === "skipped" ? "Skipped" : "Absent"}
                                  className={cn(
                                    "h-8 rounded-md border px-2.5 text-[11px] font-semibold transition-all duration-200 active:scale-95",
                                    member.status === status
                                      ? STATUS_BUTTON_STYLES[status]
                                      : "border-border/50 bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted/40 hover:text-foreground",
                                  )}
                                >
                                  {status === "present" ? "P" : status === "skipped" ? "S" : "A"}
                                </button>
                              ))}
                              {isSavingRow && <ButtonSpinner />}
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

          {savingKeys.size > 0 && (
            <div className="sticky bottom-2 z-20 px-1 pointer-events-none">
              <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs text-background shadow-lg backdrop-blur animate-fade-in">
                <ButtonSpinner /> Saving attendance…
              </div>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmMarkAll !== null}
        onOpenChange={(open) => { if (!open) setConfirmMarkAll(null); }}
        title={
          confirmMarkAll === "present" ? "Mark all visible as Present?" :
          confirmMarkAll === "absent" ? "Mark all visible as Absent?" :
          "Mark all visible as Skipped?"
        }
        description={`This will mark all ${filteredList.length} visible row(s) as ${confirmMarkAll || ""} for ${selectedDate}. Existing entries will be replaced.`}
        confirmText={
          confirmMarkAll === "present" ? "Mark All Present" :
          confirmMarkAll === "absent" ? "Mark All Absent" :
          "Mark All Skipped"
        }
        variant={confirmMarkAll === "absent" ? "destructive" : "default"}
        onConfirm={() => { if (confirmMarkAll) markAll(confirmMarkAll); }}
      />
    </div>
  );
};