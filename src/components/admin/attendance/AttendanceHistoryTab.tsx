import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  MagnifyingGlassIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

function getMonthDates(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7; // Monday=0
  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = Array(startDow).fill(null);

  for (let d = 1; d <= lastDay; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    week.push(iso);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const AttendanceHistoryTab = () => {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;
  const today = new Date().toISOString().split("T")[0];

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const [search, setSearch] = useState("");

  const weeks = useMemo(() => getMonthDates(currentMonth.year, currentMonth.month), [currentMonth]);
  const monthStart = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-${new Date(currentMonth.year, currentMonth.month + 1, 0).getDate()}`;

  const monthLabel = new Date(currentMonth.year, currentMonth.month).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const navigateMonth = (dir: "prev" | "next") => {
    setCurrentMonth((prev) => {
      const d = new Date(prev.year, prev.month + (dir === "prev" ? -1 : 1));
      return { year: d.getFullYear(), month: d.getMonth() };
    });
    setSelectedDate(null);
  };

  // Fetch entire month's attendance
  const { data: monthRecords = [], isLoading, refetch } = useQuery({
    queryKey: ["attendance-history", branchId, monthStart, monthEnd],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("id, member_id, date, status, time_slot_id, marked_by_type, created_at, members(name, phone)")
        .eq("branch_id", branchId)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  // Per-day summary for calendar heatmap
  const daySummary = useMemo(() => {
    const map: Record<string, { present: number; late: number; absent: number; total: number }> = {};
    monthRecords.forEach((r: any) => {
      if (!map[r.date]) map[r.date] = { present: 0, late: 0, absent: 0, total: 0 };
      map[r.date].total++;
      if (r.status === "present") map[r.date].present++;
      else if (r.status === "late") map[r.date].late++;
      else map[r.date].absent++;
    });
    return map;
  }, [monthRecords]);

  // Selected date records
  const selectedRecords = useMemo(() => {
    if (!selectedDate) return [];
    let list = monthRecords.filter((r: any) => r.date === selectedDate);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) => r.members?.name?.toLowerCase().includes(q) || r.members?.phone?.includes(q));
    }
    return list;
  }, [monthRecords, selectedDate, search]);

  const selectedStats = useMemo(() => {
    const present = selectedRecords.filter((r: any) => r.status === "present").length;
    const late = selectedRecords.filter((r: any) => r.status === "late").length;
    const absent = selectedRecords.filter((r: any) => r.status === "absent").length;
    return { present, late, absent, total: selectedRecords.length };
  }, [selectedRecords]);

  const formatDateDisplay = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  const getHeatColor = (date: string) => {
    const s = daySummary[date];
    if (!s || s.total === 0) return "";
    const rate = (s.present + s.late) / s.total;
    if (rate >= 0.8) return "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300";
    if (rate >= 0.5) return "bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300";
    return "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300";
  };

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth("prev")}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <h3 className="text-base font-semibold min-w-[160px] text-center">{monthLabel}</h3>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth("next")}
            disabled={currentMonth.year === new Date().getFullYear() && currentMonth.month >= new Date().getMonth()}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 h-8 text-xs">
          <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Calendar Heatmap */}
      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-3">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    {DAY_HEADERS.map((d) => (
                      <th key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1.5 uppercase">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week, wi) => (
                    <tr key={wi}>
                      {week.map((date, di) => {
                        if (!date) return <td key={di} className="p-0.5"><div className="h-16" /></td>;
                        const dayNum = new Date(date + "T00:00:00").getDate();
                        const isFuture = date > today;
                        const isSelected = date === selectedDate;
                        const isToday = date === today;
                        const summary = daySummary[date];
                        const heatColor = getHeatColor(date);

                        return (
                          <td key={di} className="p-0.5">
                            <button
                              onClick={() => !isFuture && setSelectedDate(isSelected ? null : date)}
                              disabled={isFuture}
                              className={cn(
                                "w-full h-16 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all border text-xs",
                                isFuture && "opacity-25 cursor-not-allowed",
                                isSelected
                                  ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm"
                                  : heatColor
                                    ? `${heatColor} border-transparent hover:ring-1 hover:ring-primary/30`
                                    : "border-border/30 hover:bg-muted/30",
                                isToday && !isSelected && "ring-1 ring-primary/40"
                              )}
                            >
                              <span className={cn("text-xs font-bold", isSelected ? "text-primary" : isToday ? "text-primary" : "")}>
                                {dayNum}
                              </span>
                              {summary && summary.total > 0 && (
                                <>
                                  <div className="flex items-center gap-0.5">
                                    <span className="text-[9px] text-green-600 font-medium">{summary.present}</span>
                                    {summary.late > 0 && <span className="text-[9px] text-amber-600 font-medium">{summary.late}</span>}
                                    <span className="text-[9px] text-red-500 font-medium">{summary.absent}</span>
                                  </div>
                                  <div className="w-8 h-1 rounded-full bg-muted/50 overflow-hidden flex">
                                    {summary.present > 0 && <div className="bg-green-500 h-full" style={{ width: `${(summary.present / summary.total) * 100}%` }} />}
                                    {summary.late > 0 && <div className="bg-amber-500 h-full" style={{ width: `${(summary.late / summary.total) * 100}%` }} />}
                                  </div>
                                </>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/20 border border-green-200" /> ≥80% attendance</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/20 border border-amber-200" /> 50-80%</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/20 border border-red-200" /> &lt;50%</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-border/30" /> No data</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Date Detail */}
      {selectedDate && (
        <Card className="border border-border/40 shadow-sm">
          <div className="px-4 py-3 border-b border-border/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDaysIcon className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">{formatDateDisplay(selectedDate)}</h4>
              {selectedDate === today && <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0 h-5">Today</Badge>}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-600 font-medium">{selectedStats.present} Present</span>
              <span className="text-amber-600 font-medium">{selectedStats.late} Late</span>
              <span className="text-red-500 font-medium">{selectedStats.absent} Absent</span>
              <span className="text-muted-foreground">Total: {selectedStats.total}</span>
            </div>
          </div>

          {selectedStats.total > 0 && (
            <div className="px-4 py-2 border-b border-border/20">
              <div className="relative w-full sm:max-w-xs">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search member..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-xs rounded-lg" />
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            {selectedRecords.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No attendance records for this date.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/20">
                    <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2">Member</th>
                    <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2 hidden sm:table-cell">Phone</th>
                    <th className="text-center text-[11px] font-medium text-muted-foreground px-4 py-2">Status</th>
                    <th className="text-right text-[11px] font-medium text-muted-foreground px-4 py-2 hidden lg:table-cell">Marked By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {selectedRecords.map((r: any) => (
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
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
