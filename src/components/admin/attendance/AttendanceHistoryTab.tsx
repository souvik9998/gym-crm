import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
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
} from "@heroicons/react/24/outline";

export const AttendanceHistoryTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

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
    if (statusFilter !== "all") {
      list = list.filter((r: any) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) =>
        r.members?.name?.toLowerCase().includes(q) || r.members?.phone?.includes(q)
      );
    }
    return list;
  }, [records, statusFilter, search]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredRecords.forEach((r: any) => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredRecords]);

  // Overall stats
  const overallStats = useMemo(() => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter((r: any) => r.status === "present").length;
    const late = filteredRecords.filter((r: any) => r.status === "late").length;
    const absent = filteredRecords.filter((r: any) => r.status === "absent").length;
    return { total, present, late, absent, days: groupedByDate.length };
  }, [filteredRecords, groupedByDate]);

  const formatDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const formatShortDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  const formatTime = (t: string) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  };

  // Navigate dates by day
  const navigateDate = (direction: "prev" | "next") => {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const days = direction === "prev" ? -7 : 7;
    from.setDate(from.getDate() + days);
    to.setDate(to.getDate() + days);
    // Don't go beyond today
    const todayDate = new Date(today);
    if (to > todayDate) return;
    setDateFrom(from.toISOString().split("T")[0]);
    setDateTo(to.toISOString().split("T")[0]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "present": return "bg-green-500";
      case "late": return "bg-amber-500";
      case "absent": return "bg-red-500";
      default: return "bg-muted";
    }
  };

  return (
    <div className="space-y-3">
      {/* Date Range + Navigation */}
      <div className="flex items-end gap-2 flex-wrap">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateDate("prev")}>
          <ChevronLeftIcon className="w-4 h-4" />
        </Button>
        <AttendanceDatePicker label="From" value={dateFrom} onChange={setDateFrom} className="min-w-[130px] max-w-[160px]" />
        <AttendanceDatePicker label="To" value={dateTo} onChange={setDateTo} className="min-w-[130px] max-w-[160px]" />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateDate("next")} disabled={dateTo >= today}>
          <ChevronRightIcon className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1 h-8 text-[10px] ml-auto">
          <ArrowPathIcon className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search member..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded-lg" />
        </div>
        <div className="flex gap-0.5">
          {[
            { key: "all", label: "All" },
            { key: "present", label: "P", color: "text-green-600" },
            { key: "late", label: "L", color: "text-amber-600" },
            { key: "absent", label: "A", color: "text-red-500" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-medium transition-all border",
                statusFilter === s.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border/40 text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/30 rounded-lg text-[10px]">
        <span className="text-muted-foreground">{overallStats.days} days</span>
        <span className="font-medium">{overallStats.total} records</span>
        <div className="w-px h-3 bg-border" />
        <span className="text-green-600 font-medium">{overallStats.present}P</span>
        <span className="text-amber-600 font-medium">{overallStats.late}L</span>
        <span className="text-red-500 font-medium">{overallStats.absent}A</span>
      </div>

      {/* Records */}
      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground text-xs">Loading history...</div>
      ) : groupedByDate.length === 0 ? (
        <div className="py-10 text-center space-y-1.5">
          <CalendarDaysIcon className="w-8 h-8 mx-auto text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No attendance records found for this period.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {groupedByDate.map(([date, dayRecords]) => {
            const isExpanded = expandedDate === date;
            const dayPresent = dayRecords.filter((r: any) => r.status === "present").length;
            const dayLate = dayRecords.filter((r: any) => r.status === "late").length;
            const dayAbsent = dayRecords.filter((r: any) => r.status === "absent").length;
            const dayTotal = dayRecords.length;
            const presentPercent = dayTotal > 0 ? Math.round(((dayPresent + dayLate) / dayTotal) * 100) : 0;
            const isToday = date === today;

            return (
              <Card key={date} className="border border-border/30 shadow-sm overflow-hidden">
                {/* Date Header - Clickable */}
                <button
                  onClick={() => setExpandedDate(isExpanded ? null : date)}
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <CalendarDaysIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-xs font-semibold truncate">{formatShortDate(date)}</span>
                    {isToday && <Badge className="bg-primary/10 text-primary border-primary/20 text-[8px] py-0 h-4">Today</Badge>}
                  </div>

                  {/* Mini attendance bar */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden flex">
                      {dayPresent > 0 && <div className="bg-green-500 h-full" style={{ width: `${(dayPresent / dayTotal) * 100}%` }} />}
                      {dayLate > 0 && <div className="bg-amber-500 h-full" style={{ width: `${(dayLate / dayTotal) * 100}%` }} />}
                      {dayAbsent > 0 && <div className="bg-red-500 h-full" style={{ width: `${(dayAbsent / dayTotal) * 100}%` }} />}
                    </div>
                    <span className="text-[10px] text-muted-foreground w-7 text-right">{presentPercent}%</span>
                  </div>

                  <div className="flex gap-1 text-[9px] shrink-0">
                    <span className="text-green-600 font-medium">{dayPresent}P</span>
                    <span className="text-amber-600 font-medium">{dayLate}L</span>
                    <span className="text-red-500 font-medium">{dayAbsent}A</span>
                  </div>

                  <ChevronRightIcon className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-90")} />
                </button>

                {/* Expanded Records */}
                {isExpanded && (
                  <CardContent className="p-0 border-t border-border/30">
                    <div className="divide-y divide-border/20">
                      {dayRecords.map((r: any) => (
                        <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                          <div className={cn("w-2 h-2 rounded-full shrink-0", getStatusColor(r.status))} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium truncate">{r.members?.name || "—"}</p>
                            <p className="text-[9px] text-muted-foreground">{r.members?.phone || "—"}</p>
                          </div>
                          {r.time_slot_id && r.trainer_time_slots && (
                            <Badge variant="outline" className="text-[8px] py-0 h-4 shrink-0">
                              {formatTime((r.trainer_time_slots as any).start_time)} – {formatTime((r.trainer_time_slots as any).end_time)}
                              {(r.trainer_time_slots as any).personal_trainers?.name && (
                                <span className="ml-0.5 opacity-70">· {(r.trainer_time_slots as any).personal_trainers.name}</span>
                              )}
                            </Badge>
                          )}
                          <Badge
                            className={cn(
                              "text-[8px] py-0 h-4 shrink-0",
                              r.status === "present" ? "bg-green-500/10 text-green-600 border-green-200"
                                : r.status === "late" ? "bg-amber-500/10 text-amber-600 border-amber-200"
                                : "bg-red-500/10 text-red-500 border-red-200"
                            )}
                          >
                            {r.status === "present" ? "Present" : r.status === "late" ? "Late" : "Absent"}
                          </Badge>
                          <span className="text-[8px] text-muted-foreground capitalize shrink-0">{r.marked_by_type || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
