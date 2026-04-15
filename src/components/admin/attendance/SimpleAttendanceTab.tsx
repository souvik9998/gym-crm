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
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserGroupIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

type AttendanceStatus = "present" | "absent" | "late";

interface MemberAttendance {
  memberId: string;
  memberName: string;
  memberPhone: string;
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "bg-green-500 text-white",
  late: "bg-amber-500 text-white",
  absent: "bg-red-500/80 text-white",
};

const STATUS_BADGE_COLORS: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  late: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  absent: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
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

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SimpleAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const { staffUser, permissions, isStaffLoggedIn } = useStaffAuth();
  const queryClient = useQueryClient();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const isFutureDate = selectedDate > today;
  const isLimitedAccess = isStaffLoggedIn && permissions?.member_access_type === "assigned";

  const navigateWeek = (dir: "prev" | "next") => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + (dir === "prev" ? -7 : 7));
    const iso = d.toISOString().split("T")[0];
    if (iso > today) return;
    setSelectedDate(iso);
  };

  // Fetch active members
  const { data: activeMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["active-members-attendance", branchId, isLimitedAccess, staffUser?.id],
    queryFn: async () => {
      if (!branchId) return [];
      if (isLimitedAccess && staffUser?.id) {
        const { data: staffData } = await supabase.from("staff").select("phone").eq("id", staffUser.id).single();
        if (!staffData?.phone) return [];
        const { data: trainer } = await supabase.from("personal_trainers").select("id").eq("phone", staffData.phone).eq("branch_id", branchId).eq("is_active", true).maybeSingle();
        if (!trainer?.id) return [];
        const { data: memberDetails } = await supabase.from("member_details").select("member_id").eq("personal_trainer_id", trainer.id);
        const memberIds = (memberDetails || []).map((md: any) => md.member_id);
        if (memberIds.length === 0) return [];
        const { data, error } = await supabase.from("members").select("id, name, phone, subscriptions!inner(status)").eq("branch_id", branchId).in("id", memberIds).in("subscriptions.status", ["active", "expiring_soon"]).order("name");
        if (error) throw error;
        const seen = new Set<string>();
        return (data || []).filter((m: any) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
      }
      const { data, error } = await supabase.from("members").select("id, name, phone, subscriptions!inner(status)").eq("branch_id", branchId).in("subscriptions.status", ["active", "expiring_soon"]).order("name");
      if (error) throw error;
      const seen = new Set<string>();
      return (data || []).filter((m: any) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    },
    enabled: !!branchId,
  });

  // Fetch the whole week's attendance
  const { data: weekRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["daily-attendance-week", branchId, weekDates[0], weekDates[6]],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("daily_attendance").select("id, member_id, date, status")
        .eq("branch_id", branchId)
        .gte("date", weekDates[0])
        .lte("date", weekDates[6])
        .is("time_slot_id", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  // Build lookup: date -> member_id -> status
  const weekLookup = useMemo(() => {
    const map: Record<string, Record<string, AttendanceStatus>> = {};
    weekRecords.forEach((r: any) => {
      if (!map[r.date]) map[r.date] = {};
      map[r.date][r.member_id] = r.status as AttendanceStatus;
    });
    return map;
  }, [weekRecords]);

  // Existing records for selected date
  const existingRecords = useMemo(() => {
    return weekRecords.filter((r: any) => r.date === selectedDate);
  }, [weekRecords, selectedDate]);

  useEffect(() => {
    const map = new Map<string, AttendanceStatus>();
    existingRecords.forEach((r: any) => { map.set(r.member_id, r.status as AttendanceStatus); });
    setLocalAttendance(map);
    setHasChanges(false);
  }, [existingRecords]);

  const memberList = useMemo((): MemberAttendance[] => {
    return activeMembers.map((m: any) => ({
      memberId: m.id,
      memberName: m.name,
      memberPhone: m.phone,
    }));
  }, [activeMembers]);

  const filteredList = useMemo(() => {
    if (!search.trim()) return memberList;
    const q = search.toLowerCase();
    return memberList.filter((m) => m.memberName.toLowerCase().includes(q) || m.memberPhone.includes(q));
  }, [memberList, search]);

  const stats = useMemo(() => {
    const total = memberList.length;
    let present = 0, late = 0, absent = 0;
    memberList.forEach((m) => {
      const s = localAttendance.get(m.memberId) || "absent";
      if (s === "present") present++;
      else if (s === "late") late++;
      else absent++;
    });
    return { total, present, late, absent };
  }, [memberList, localAttendance]);

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
      activeMembers.forEach((m: any) => next.set(m.id, status));
      return next;
    });
    setHasChanges(true);
  }, [activeMembers, isFutureDate]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      if (isFutureDate) throw new Error("Cannot mark attendance for future dates");

      const { error: deleteError } = await supabase
        .from("daily_attendance").delete()
        .eq("branch_id", branchId).eq("date", selectedDate).is("time_slot_id", null);
      if (deleteError) throw deleteError;

      const records = memberList.map((m) => ({
        member_id: m.memberId,
        branch_id: branchId,
        date: selectedDate,
        status: localAttendance.get(m.memberId) || "absent",
        time_slot_id: null as string | null,
        marked_by: staffUser?.id || null,
        marked_by_type: isStaffLoggedIn ? "staff" : "admin",
      }));

      const { error: insertError } = await supabase.from("daily_attendance").insert(records);
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast({ title: "Attendance saved", description: `Attendance for ${formatShortDate(selectedDate)} saved successfully.` });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["daily-attendance-week", branchId] });
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    },
    onError: (err: any) => {
      toast({ title: "Error saving attendance", description: err.message, variant: "destructive" });
    },
  });

  const isLoading = loadingMembers || loadingRecords;

  const formatShortDate = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const formatDayNum = (d: string) => new Date(d + "T00:00:00").getDate();

  const getStatusForCell = (memberId: string, date: string): AttendanceStatus | null => {
    if (date === selectedDate) return localAttendance.get(memberId) || null;
    return weekLookup[date]?.[memberId] || null;
  };

  return (
    <div className="space-y-3">
      {/* Week Navigation + Stats */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateWeek("prev")}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1">
            {weekDates.map((d, i) => (
              <button
                key={d}
                onClick={() => { if (d <= today) setSelectedDate(d); }}
                disabled={d > today}
                className={cn(
                  "flex flex-col items-center px-2 py-1.5 rounded-lg transition-all min-w-[42px]",
                  d === selectedDate
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : d === today
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : d > today
                        ? "opacity-30 cursor-not-allowed"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-[10px] font-medium uppercase">{DAY_LABELS[i]}</span>
                <span className="text-sm font-bold">{formatDayNum(d)}</span>
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateWeek("next")} disabled={weekDates[6] >= today}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Compact stats */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Present</span>
            <span className="font-bold text-green-600">{stats.present}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Late</span>
            <span className="font-bold text-amber-600">{stats.late}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Absent</span>
            <span className="font-bold text-red-500">{stats.absent}</span>
          </div>
          <span className="text-muted-foreground/50">|</span>
          <span className="text-muted-foreground">Total <span className="font-bold text-foreground">{stats.total}</span></span>
        </div>
      </div>

      {/* Search + Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search member..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm rounded-lg" />
        </div>
        {!isFutureDate && stats.total > 0 && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="gap-1 text-[11px] h-7 text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/20" onClick={() => markAll("present")}>
              <CheckCircleIcon className="w-3.5 h-3.5" /> All Present
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-[11px] h-7 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => markAll("absent")}>
              <XCircleIcon className="w-3.5 h-3.5" /> All Absent
            </Button>
          </div>
        )}
        {isFutureDate && (
          <Badge variant="destructive" className="text-[10px] h-6">Future dates not allowed</Badge>
        )}
      </div>

      {/* Weekly Calendar Grid */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading members...</div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{search ? "No members match your search." : "No active members found."}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5 sticky left-0 bg-muted/30 z-10 min-w-[140px]">
                    Member
                  </th>
                  {weekDates.map((d, i) => {
                    const isSelected = d === selectedDate;
                    const isToday = d === today;
                    return (
                      <th key={d} className={cn("text-center text-[11px] font-medium px-1 py-2.5 min-w-[72px]",
                        isSelected ? "text-primary bg-primary/5" : "text-muted-foreground"
                      )}>
                        <div className="flex flex-col items-center">
                          <span className="uppercase">{DAY_LABELS[i]}</span>
                          <span className={cn("text-xs font-bold mt-0.5 w-6 h-6 rounded-full flex items-center justify-center",
                            isToday && !isSelected ? "bg-primary/10 text-primary" : "",
                            isSelected ? "bg-primary text-primary-foreground" : ""
                          )}>{formatDayNum(d)}</span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center text-[11px] font-medium text-muted-foreground px-3 py-2.5 min-w-[100px]">
                    Today's Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredList.map((member) => {
                  const currentStatus = localAttendance.get(member.memberId) || "absent";
                  return (
                    <tr key={member.memberId} className={cn("transition-colors hover:bg-muted/10",
                      isFutureDate && "opacity-50 pointer-events-none"
                    )}>
                      <td className="px-3 py-2 sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0">
                            {member.memberName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate max-w-[110px]">{member.memberName}</p>
                            <p className="text-[10px] text-muted-foreground">{member.memberPhone}</p>
                          </div>
                        </div>
                      </td>
                      {weekDates.map((d) => {
                        const status = getStatusForCell(member.memberId, d);
                        const isSel = d === selectedDate;
                        return (
                          <td key={d} className={cn("text-center px-1 py-2", isSel && "bg-primary/[0.02]")}>
                            {status ? (
                              <span className={cn("inline-flex items-center justify-center text-[10px] font-semibold rounded-md px-1.5 py-1 min-w-[52px]",
                                STATUS_BADGE_COLORS[status]
                              )}>
                                {status === "present" ? "✓ Present" : status === "late" ? "⏱ Late" : "✕ Absent"}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/40">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          {(["present", "late", "absent"] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => toggleStatus(member.memberId, s)}
                              disabled={isFutureDate}
                              className={cn(
                                "w-7 h-7 rounded-md text-[10px] font-bold transition-all border",
                                currentStatus === s
                                  ? STATUS_COLORS[s] + " border-transparent shadow-sm"
                                  : "bg-transparent text-muted-foreground border-border/40 hover:border-primary/30 hover:bg-muted/30"
                              )}
                              title={s.charAt(0).toUpperCase() + s.slice(1)}
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
          )}
        </div>
      </Card>

      {/* Sticky Save Button */}
      {filteredList.length > 0 && !isFutureDate && (
        <div className="sticky bottom-3 z-20">
          <Button
            className={cn(
              "w-full h-12 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300",
              hasChanges
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-muted text-muted-foreground"
            )}
            disabled={!hasChanges || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <span className="flex items-center gap-2"><ButtonSpinner /> Saving...</span>
            ) : hasChanges ? (
              `Save Attendance (${stats.present} Present · ${stats.late} Late · ${stats.absent} Absent)`
            ) : (
              "No changes to save"
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
