import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AttendanceDatePicker } from "./AttendanceDatePicker";
import {
  MagnifyingGlassIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

export const AttendanceHistoryTab = () => {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedDate, setExpandedDate] = useState<string | null>(today);

  const { data: records = [], isLoading, refetch } = useQuery({
    queryKey: ["attendance-history", branchId, dateFrom, dateTo],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("id, member_id, date, status, time_slot_id, marked_by_type, created_at, members(name, phone), trainer_time_slots(start_time, end_time, personal_trainers(name))")
        .eq("branch_id", branchId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  const filteredRecords = useMemo(() => {
    let list = records;
    if (statusFilter !== "all") list = list.filter((r: any) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) => r.members?.name?.toLowerCase().includes(q) || r.members?.phone?.includes(q));
    }
    return list;
  }, [records, statusFilter, search]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredRecords.forEach((r: any) => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredRecords]);

  const overallStats = useMemo(() => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter((r: any) => r.status === "present").length;
    const late = filteredRecords.filter((r: any) => r.status === "late").length;
    const absent = filteredRecords.filter((r: any) => r.status === "absent").length;
    return { total, present, late, absent, days: groupedByDate.length };
  }, [filteredRecords, groupedByDate]);

  const formatDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  const formatShortDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  const formatTime = (t: string) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  };

  const navigateDate = (direction: "prev" | "next") => {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const days = direction === "prev" ? -7 : 7;
    from.setDate(from.getDate() + days);
    to.setDate(to.getDate() + days);
    const todayDate = new Date(today);
    if (to > todayDate) return;
    setDateFrom(from.toISOString().split("T")[0]);
    setDateTo(to.toISOString().split("T")[0]);
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border border-border/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Total Records</p>
            <p className="text-xl font-bold">{overallStats.total}</p>
            <p className="text-[10px] text-muted-foreground">{overallStats.days} days</p>
          </CardContent>
        </Card>
        <Card className="border border-border/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Present</p>
            <p className="text-xl font-bold text-green-600">{overallStats.present}</p>
            <p className="text-[10px] text-muted-foreground">{overallStats.total > 0 ? Math.round((overallStats.present / overallStats.total) * 100) : 0}%</p>
          </CardContent>
        </Card>
        <Card className="border border-border/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Late</p>
            <p className="text-xl font-bold text-amber-600">{overallStats.late}</p>
            <p className="text-[10px] text-muted-foreground">{overallStats.total > 0 ? Math.round((overallStats.late / overallStats.total) * 100) : 0}%</p>
          </CardContent>
        </Card>
        <Card className="border border-border/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Absent</p>
            <p className="text-xl font-bold text-red-500">{overallStats.absent}</p>
            <p className="text-[10px] text-muted-foreground">{overallStats.total > 0 ? Math.round((overallStats.absent / overallStats.total) * 100) : 0}%</p>
          </CardContent>
        </Card>
        <Card className="border border-border/40 col-span-2 lg:col-span-1">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Attendance Rate</p>
            <p className="text-xl font-bold text-primary">{overallStats.total > 0 ? Math.round(((overallStats.present + overallStats.late) / overallStats.total) * 100) : 0}%</p>
            <p className="text-[10px] text-muted-foreground">Present + Late</p>
          </CardContent>
        </Card>
      </div>

      {/* Date Range + Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigateDate("prev")}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <AttendanceDatePicker label="From" value={dateFrom} onChange={setDateFrom} className="min-w-[140px]" />
          <span className="text-muted-foreground text-xs">to</span>
          <AttendanceDatePicker label="To" value={dateTo} onChange={setDateTo} className="min-w-[140px]" />
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigateDate("next")} disabled={dateTo >= today}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 h-9 text-xs ml-auto">
          <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search member..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm rounded-lg" />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: "all", label: "All" },
            { key: "present", label: "Present" },
            { key: "late", label: "Late" },
            { key: "absent", label: "Absent" },
          ].map((s) => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={cn(
                "px-2.5 py-1.5 rounded-full text-xs font-medium transition-all border",
                statusFilter === s.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Records by Date */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">Loading history...</div>
      ) : groupedByDate.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <CalendarDaysIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No attendance records found for this period.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByDate.map(([date, dayRecords]) => {
            const isExpanded = expandedDate === date;
            const dayPresent = dayRecords.filter((r: any) => r.status === "present").length;
            const dayLate = dayRecords.filter((r: any) => r.status === "late").length;
            const dayAbsent = dayRecords.filter((r: any) => r.status === "absent").length;
            const dayTotal = dayRecords.length;
            const presentPercent = dayTotal > 0 ? Math.round(((dayPresent + dayLate) / dayTotal) * 100) : 0;
            const isToday = date === today;

            return (
              <Card key={date} className="border border-border/40 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedDate(isExpanded ? null : date)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors"
                >
                  <CalendarDaysIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <span className="text-sm font-semibold">{formatDate(date)}</span>
                    {isToday && <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0 h-5">Today</Badge>}
                  </div>

                  {/* Attendance bar */}
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden flex">
                      {dayPresent > 0 && <div className="bg-green-500 h-full" style={{ width: `${(dayPresent / dayTotal) * 100}%` }} />}
                      {dayLate > 0 && <div className="bg-amber-500 h-full" style={{ width: `${(dayLate / dayTotal) * 100}%` }} />}
                      {dayAbsent > 0 && <div className="bg-red-500 h-full" style={{ width: `${(dayAbsent / dayTotal) * 100}%` }} />}
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{presentPercent}%</span>
                  </div>

                  <div className="flex gap-2 text-xs shrink-0">
                    <span className="text-green-600 font-medium">{dayPresent}P</span>
                    <span className="text-amber-600 font-medium">{dayLate}L</span>
                    <span className="text-red-500 font-medium">{dayAbsent}A</span>
                  </div>

                  <ChevronRightIcon className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-90")} />
                </button>

                {isExpanded && (
                  <div className="border-t border-border/30">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/20">
                            <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2">Member</th>
                            <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2 hidden sm:table-cell">Phone</th>
                            <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2 hidden md:table-cell">Time Slot</th>
                            <th className="text-center text-[11px] font-medium text-muted-foreground px-4 py-2">Status</th>
                            <th className="text-right text-[11px] font-medium text-muted-foreground px-4 py-2 hidden lg:table-cell">Marked By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {dayRecords.map((r: any) => (
                            <tr key={r.id} className="hover:bg-muted/10">
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <div className={cn("w-2 h-2 rounded-full shrink-0",
                                    r.status === "present" ? "bg-green-500" : r.status === "late" ? "bg-amber-500" : "bg-red-500"
                                  )} />
                                  <span className="text-sm font-medium truncate">{r.members?.name || "—"}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2 hidden sm:table-cell">
                                <span className="text-xs text-muted-foreground">{r.members?.phone || "—"}</span>
                              </td>
                              <td className="px-4 py-2 hidden md:table-cell">
                                {r.time_slot_id && r.trainer_time_slots ? (
                                  <Badge variant="outline" className="text-[10px] py-0.5">
                                    {formatTime((r.trainer_time_slots as any).start_time)} – {formatTime((r.trainer_time_slots as any).end_time)}
                                    {(r.trainer_time_slots as any).personal_trainers?.name && (
                                      <span className="ml-1 opacity-70">· {(r.trainer_time_slots as any).personal_trainers.name}</span>
                                    )}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <Badge className={cn("text-[10px] font-medium",
                                  r.status === "present" ? "bg-green-500/10 text-green-600 border-green-200"
                                    : r.status === "late" ? "bg-amber-500/10 text-amber-600 border-amber-200"
                                    : "bg-red-500/10 text-red-500 border-red-200"
                                )}>
                                  {r.status === "present" ? "Present" : r.status === "late" ? "Late" : "Absent"}
                                </Badge>
                              </td>
                              <td className="px-4 py-2 text-right hidden lg:table-cell">
                                <span className="text-xs text-muted-foreground capitalize">{r.marked_by_type || "—"}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
