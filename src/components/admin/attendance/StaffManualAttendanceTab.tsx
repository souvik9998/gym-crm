import { useState, useMemo, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  LockClosedIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AttendanceDatePicker } from "./AttendanceDatePicker";
import { useStaffPageData } from "@/hooks/queries/useStaffPageData";

type AttendanceStatus = "present" | "absent" | "skipped";

interface StaffRow {
  id: string;
  full_name: string;
  phone: string | null;
  role: string | null;
  email: string | null;
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "bg-green-500 text-white shadow-green-500/30",
  skipped: "bg-slate-500 text-white shadow-slate-500/30",
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

export const StaffManualAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const { isAdmin, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const branchId = currentBranch?.id;
  const canMark = isAdmin || isSuperAdmin;

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [confirmMarkAll, setConfirmMarkAll] = useState<AttendanceStatus | null>(null);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const isFutureDate = selectedDate > today;

  // Use the canonical staff source-of-truth (same as Staff Management page).
  // Returns ALL active staff + trainers assigned to current branch.
  const { staff: rawStaff, isLoading: loadingStaff } = useStaffPageData();

  const staffList: StaffRow[] = useMemo(() => {
    const list = (rawStaff || [])
      .filter((s: any) => s && s.is_active !== false)
      .map((s: any) => ({
        id: s.id,
        full_name: s.full_name || s.name || "Unknown",
        phone: s.phone ?? null,
        role: s.role ?? null,
        email: s.email ?? null,
      }));
    const seen = new Set<string>();
    return list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  }, [rawStaff]);

  // Load week attendance for staff
  const { data: weekRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["daily-attendance-staff-week", branchId, weekDates[0], weekDates[6]],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await (supabase as any)
        .from("daily_attendance")
        .select("id, staff_id, date, status, created_at, updated_at")
        .eq("branch_id", branchId)
        .gte("date", weekDates[0])
        .lte("date", weekDates[6])
        .not("staff_id", "is", null)
        .is("time_slot_id", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  const weekLookup = useMemo(() => {
    const map: Record<string, Record<string, { status: AttendanceStatus; markedAt: string | null }>> = {};
    weekRecords.forEach((r: any) => {
      if (!map[r.date]) map[r.date] = {};
      map[r.date][r.staff_id] = { status: r.status as AttendanceStatus, markedAt: r.updated_at || r.created_at || null };
    });
    return map;
  }, [weekRecords]);

  const existingRecords = useMemo(() => weekRecords.filter((r: any) => r.date === selectedDate), [weekRecords, selectedDate]);

  useEffect(() => {
    const map = new Map<string, AttendanceStatus>();
    existingRecords.forEach((r: any) => map.set(r.staff_id, r.status as AttendanceStatus));
    setLocalAttendance(map);
  }, [existingRecords]);

  const searchedList = useMemo(() => {
    if (!search.trim()) return staffList;
    const q = search.toLowerCase();
    return staffList.filter((s) =>
      s.full_name.toLowerCase().includes(q) ||
      (s.phone || "").includes(q) ||
      (s.role || "").toLowerCase().includes(q)
    );
  }, [staffList, search]);

  const stats = useMemo(() => {
    const total = searchedList.length;
    let present = 0, skipped = 0, absent = 0;
    searchedList.forEach((s) => {
      const v = localAttendance.get(s.id) || "absent";
      if (v === "present") present++;
      else if (v === "skipped") skipped++;
      else absent++;
    });
    return { total, present, skipped, absent };
  }, [searchedList, localAttendance]);

  const filteredList = useMemo(() => {
    if (statusFilter === "all") return searchedList;
    return searchedList.filter((s) => (localAttendance.get(s.id) || "absent") === statusFilter);
  }, [searchedList, statusFilter, localAttendance]);

  const navigateWeek = (dir: "prev" | "next") => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + (dir === "prev" ? -7 : 7));
    let iso = d.toISOString().split("T")[0];
    if (iso > today) iso = today;
    if (iso === selectedDate) return;
    setSelectedDate(iso);
  };

  const canGoNext = (() => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + 7);
    const nextMonday = getWeekDates(d.toISOString().split("T")[0])[0];
    return nextMonday <= today;
  })();

  const persistStatus = useCallback(async (staffId: string, status: AttendanceStatus) => {
    if (!branchId || isFutureDate || !canMark) return;
    setSavingIds((prev) => { const n = new Set(prev); n.add(staffId); return n; });
    try {
      await (supabase as any)
        .from("daily_attendance").delete()
        .eq("branch_id", branchId).eq("date", selectedDate).is("time_slot_id", null)
        .eq("staff_id", staffId);
      const { error } = await (supabase as any).from("daily_attendance").insert({
        staff_id: staffId, member_id: null, branch_id: branchId, date: selectedDate,
        status, time_slot_id: null, marked_by_type: "admin",
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["daily-attendance-staff-week", branchId] });
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err.message || "Try again", variant: "destructive" });
    } finally {
      setSavingIds((prev) => { const n = new Set(prev); n.delete(staffId); return n; });
    }
  }, [branchId, isFutureDate, selectedDate, canMark, queryClient]);

  const toggleStatus = useCallback((staffId: string, newStatus: AttendanceStatus) => {
    if (isFutureDate || !canMark) return;
    const cur = localAttendance.get(staffId) || "absent";
    const finalStatus: AttendanceStatus = cur === newStatus ? "absent" : newStatus;
    setLocalAttendance((prev) => { const next = new Map(prev); next.set(staffId, finalStatus); return next; });
    persistStatus(staffId, finalStatus);
  }, [isFutureDate, canMark, localAttendance, persistStatus]);

  const markAll = useCallback(async (status: AttendanceStatus) => {
    if (isFutureDate || !branchId || !canMark) return;
    const ids = filteredList.map((s) => s.id);
    if (ids.length === 0) return;
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.set(id, status));
      return next;
    });
    setSavingIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n; });
    try {
      await (supabase as any)
        .from("daily_attendance").delete()
        .eq("branch_id", branchId).eq("date", selectedDate).is("time_slot_id", null)
        .in("staff_id", ids);
      const records = ids.map((id) => ({
        staff_id: id, member_id: null, branch_id: branchId, date: selectedDate, status,
        time_slot_id: null as string | null, marked_by_type: "admin",
      }));
      const { error } = await (supabase as any).from("daily_attendance").insert(records);
      if (error) throw error;
      toast({ title: "Marked all", description: `${ids.length} staff marked ${status}.` });
      queryClient.invalidateQueries({ queryKey: ["daily-attendance-staff-week", branchId] });
    } catch (err: any) {
      toast({ title: "Couldn't mark all", description: err.message, variant: "destructive" });
    } finally {
      setSavingIds(new Set());
    }
  }, [isFutureDate, branchId, canMark, filteredList, selectedDate, queryClient]);

  // Admin-only gate
  if (!canMark) {
    return (
      <Card className="border border-border/40 shadow-sm p-8 lg:p-12 text-center animate-fade-in">
        <LockClosedIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <h3 className="text-sm lg:text-base font-semibold mb-1">Admins only</h3>
        <p className="text-xs lg:text-sm text-muted-foreground">
          Only gym owners and super admins can mark staff attendance.
        </p>
      </Card>
    );
  }

  const initialsOf = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col gap-2.5 lg:gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
            <div>
              <div className="text-sm lg:text-base font-semibold leading-none">Staff Manual Attendance</div>
              <div className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">Admin-only · marks attendance for staff at this branch</div>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] lg:text-xs gap-1">
            <UserGroupIcon className="w-3 h-3" /> {staffList.length} staff
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs lg:text-sm"
            />
          </div>
          <AttendanceDatePicker
            label="Date"
            value={selectedDate}
            onChange={(v) => setSelectedDate(v > today ? today : v)}
            className="min-w-[160px]"
          />
        </div>
      </div>

      {/* Stat filter cards */}
      <div className="grid grid-cols-4 gap-1.5 lg:gap-2">
        {([
          { key: "all" as const, label: "Total", value: stats.total, color: "border-border" },
          { key: "present" as const, label: "Present", value: stats.present, color: "border-green-500/40" },
          { key: "skipped" as const, label: "Skipped", value: stats.skipped, color: "border-slate-500/40" },
          { key: "absent" as const, label: "Absent", value: stats.absent, color: "border-red-500/40" },
        ]).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatusFilter(s.key)}
            className={cn(
              "rounded-lg border bg-card px-2 py-2 lg:px-3 lg:py-2.5 text-left transition-all hover:scale-[1.02] active:scale-[0.98]",
              s.color,
              statusFilter === s.key && "ring-2 ring-primary/40 shadow-sm"
            )}
          >
            <div className="text-[9px] lg:text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="text-base lg:text-xl font-bold tabular-nums">{s.value}</div>
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {!isFutureDate && filteredList.length > 0 && (
        <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
          <span className="text-[10px] lg:text-xs text-muted-foreground mr-1">Mark all visible:</span>
          <Button size="sm" variant="outline" onClick={() => setConfirmMarkAll("present")} className="h-7 text-[10px] lg:text-xs gap-1 border-green-500/30 hover:bg-green-500/10">
            <CheckCircleIcon className="w-3.5 h-3.5 text-green-600" /> Present
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmMarkAll("skipped")} className="h-7 text-[10px] lg:text-xs gap-1 border-slate-500/30 hover:bg-slate-500/10">
            <UserIcon className="w-3.5 h-3.5 text-slate-600" /> Skipped
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmMarkAll("absent")} className="h-7 text-[10px] lg:text-xs gap-1 border-red-500/30 hover:bg-red-500/10">
            <XCircleIcon className="w-3.5 h-3.5 text-red-600" /> Absent
          </Button>
        </div>
      )}

      {isFutureDate && (
        <div className="text-[11px] lg:text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md px-2.5 py-1.5">
          You can't mark attendance for a future date.
        </div>
      )}

      {/* List */}
      {(loadingStaff || loadingRecords) ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <Card className="p-8 text-center border border-dashed">
          <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs lg:text-sm text-muted-foreground">
            {staffList.length === 0 ? "No active staff in this branch." : "No staff match your filters."}
          </p>
        </Card>
      ) : isMobile ? (
        <div className="space-y-2">
          {filteredList.map((s, i) => {
            const status = localAttendance.get(s.id) || "absent";
            const saving = savingIds.has(s.id);
            return (
              <div
                key={s.id}
                className="bg-card rounded-xl border border-border/40 p-3 animate-fade-in"
                style={{ animationDelay: `${Math.min(i * 25, 200)}ms`, animationFillMode: "backwards" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
                      {initialsOf(s.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{s.full_name}</div>
                      <div className="text-[10px] text-muted-foreground capitalize truncate">
                        {s.role || "staff"}{s.phone ? ` · ${s.phone}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(["present", "skipped", "absent"] as AttendanceStatus[]).map((opt) => (
                      <button
                        key={opt}
                        disabled={isFutureDate || saving}
                        onClick={() => toggleStatus(s.id, opt)}
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-90 disabled:opacity-40",
                          status === opt
                            ? cn("shadow-md scale-105", STATUS_COLORS[opt])
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                        aria-label={opt}
                      >
                        {opt === "present" && <CheckCircleIcon className="w-4 h-4" />}
                        {opt === "skipped" && <UserIcon className="w-4 h-4" />}
                        {opt === "absent" && <XCircleIcon className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Week strip */}
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/20">
                  {weekDates.map((d, idx) => {
                    const rec = weekLookup[d]?.[s.id];
                    const isToday = d === today;
                    const isSelected = d === selectedDate;
                    return (
                      <button
                        key={d}
                        onClick={() => setSelectedDate(d > today ? today : d)}
                        className={cn(
                          "flex flex-col items-center flex-1 py-1 gap-0.5 rounded-md transition-colors",
                          isSelected && "bg-primary/10",
                          isToday && !isSelected && "bg-muted/40"
                        )}
                      >
                        <span className="text-[8px] text-muted-foreground">{DAY_LABELS[idx]}</span>
                        <span className={cn(
                          "w-3.5 h-3.5 rounded-full",
                          rec?.status === "present" ? "bg-green-500" :
                          rec?.status === "skipped" ? "bg-slate-400" :
                          rec?.status === "absent" ? "bg-red-500/70" : "bg-muted-foreground/20"
                        )} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Desktop table
        <Card className="border border-border/40 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30">
                  <th className="text-left px-3 py-2 sticky left-0 bg-muted/30 z-10 min-w-[200px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Staff</span>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => navigateWeek("prev")}>
                          <ChevronLeftIcon className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!canGoNext} onClick={() => navigateWeek("next")}>
                          <ChevronRightIcon className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </th>
                  {weekDates.map((d, idx) => {
                    const dt = new Date(d + "T00:00:00");
                    const isToday = d === today;
                    const isSelected = d === selectedDate;
                    return (
                      <th
                        key={d}
                        onClick={() => setSelectedDate(d > today ? today : d)}
                        className={cn(
                          "px-1 py-2 min-w-[64px] cursor-pointer hover:bg-muted/50 transition-colors",
                          isSelected && "bg-primary/10",
                          isToday && !isSelected && "bg-muted/40"
                        )}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] text-muted-foreground">{DAY_LABELS_FULL[idx]}</span>
                          <span className={cn("text-xs font-semibold", isSelected && "text-primary")}>{dt.getDate()}</span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 min-w-[140px] text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Mark for {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredList.map((s, i) => {
                  const status = localAttendance.get(s.id) || "absent";
                  const saving = savingIds.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-muted/20 transition-colors animate-fade-in"
                      style={{ animationDelay: `${Math.min(i * 25, 250)}ms`, animationFillMode: "backwards" }}
                    >
                      <td className="px-3 py-2 sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                            {initialsOf(s.full_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{s.full_name}</div>
                            <div className="text-[10px] text-muted-foreground capitalize truncate">
                              {s.role || "staff"}{s.phone ? ` · ${s.phone}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      {weekDates.map((d) => {
                        const rec = weekLookup[d]?.[s.id];
                        return (
                          <td key={d} className="text-center px-1 py-2">
                            <div
                              className={cn(
                                "w-6 h-6 rounded-md mx-auto",
                                rec?.status === "present" ? "bg-green-500" :
                                rec?.status === "skipped" ? "bg-slate-400" :
                                rec?.status === "absent" ? "bg-red-500/70" : "bg-muted/40"
                              )}
                              title={rec ? rec.status : "not marked"}
                            />
                          </td>
                        );
                      })}
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {(["present", "skipped", "absent"] as AttendanceStatus[]).map((opt) => (
                            <button
                              key={opt}
                              disabled={isFutureDate || saving}
                              onClick={() => toggleStatus(s.id, opt)}
                              className={cn(
                                "w-7 h-7 rounded-md flex items-center justify-center transition-all active:scale-90 disabled:opacity-40",
                                status === opt
                                  ? cn("shadow-sm scale-105", STATUS_COLORS[opt])
                                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
                              )}
                              aria-label={opt}
                            >
                              {saving && status === opt ? (
                                <ButtonSpinner className="w-3 h-3" />
                              ) : opt === "present" ? (
                                <CheckCircleIcon className="w-3.5 h-3.5" />
                              ) : opt === "skipped" ? (
                                <UserIcon className="w-3.5 h-3.5" />
                              ) : (
                                <XCircleIcon className="w-3.5 h-3.5" />
                              )}
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

      <ConfirmDialog
        open={confirmMarkAll !== null}
        onOpenChange={(o) => !o && setConfirmMarkAll(null)}
        title={`Mark all as ${confirmMarkAll}?`}
        description={`This will set ${filteredList.length} visible staff member${filteredList.length === 1 ? "" : "s"} to "${confirmMarkAll}" for ${new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.`}
        confirmText="Mark all"
        onConfirm={() => {
          if (confirmMarkAll) markAll(confirmMarkAll);
          setConfirmMarkAll(null);
        }}
      />
    </div>
  );
};
