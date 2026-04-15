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
  ExclamationTriangleIcon,
  UserIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function getMonthDates(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7;
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
  const [memberSearch, setMemberSearch] = useState("");
  const [activeView, setActiveView] = useState("calendar");

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

  // Per-day summary
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

  // Per-member monthly stats
  const memberStats = useMemo(() => {
    const map: Record<string, { name: string; phone: string; present: number; late: number; absent: number; total: number; dates: Record<string, string> }> = {};
    monthRecords.forEach((r: any) => {
      const id = r.member_id;
      if (!id) return;
      if (!map[id]) {
        map[id] = { name: r.members?.name || "Unknown", phone: r.members?.phone || "", present: 0, late: 0, absent: 0, total: 0, dates: {} };
      }
      map[id].total++;
      if (r.status === "present") map[id].present++;
      else if (r.status === "late") map[id].late++;
      else map[id].absent++;
      // Keep one status per date (latest wins)
      map[id].dates[r.date] = r.status;
    });
    return map;
  }, [monthRecords]);

  // Sorted by most absent
  const memberRanking = useMemo(() => {
    const arr = Object.entries(memberStats).map(([id, s]) => ({ id, ...s, absentRate: s.total > 0 ? s.absent / s.total : 0 }));
    const q = memberSearch.toLowerCase();
    const filtered = q ? arr.filter(m => m.name.toLowerCase().includes(q) || m.phone.includes(q)) : arr;
    return filtered.sort((a, b) => b.absent - a.absent || b.absentRate - a.absentRate);
  }, [memberStats, memberSearch]);

  // Month-level totals
  const monthTotals = useMemo(() => {
    let present = 0, late = 0, absent = 0;
    monthRecords.forEach((r: any) => {
      if (r.status === "present") present++;
      else if (r.status === "late") late++;
      else absent++;
    });
    return { present, late, absent, total: monthRecords.length };
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

  // All unique dates in month that have data, sorted
  const datesWithData = useMemo(() => Object.keys(daySummary).sort(), [daySummary]);

  return (
    <div className="space-y-3">
      {/* Month Navigation + Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth("prev")}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <h3 className="text-sm font-semibold min-w-[140px] text-center">{monthLabel}</h3>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth("next")}
            disabled={currentMonth.year === new Date().getFullYear() && currentMonth.month >= new Date().getMonth()}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* Month summary chips */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 font-medium">{monthTotals.present} P</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 font-medium">{monthTotals.late} L</span>
            <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 font-medium">{monthTotals.absent} A</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1 h-7 text-xs">
            <ArrowPathIcon className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* View Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="h-8 p-0.5 bg-muted/50">
          <TabsTrigger value="calendar" className="gap-1 text-xs h-7 px-3">
            <CalendarDaysIcon className="w-3.5 h-3.5" /> Calendar
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-1 text-xs h-7 px-3">
            <UserIcon className="w-3.5 h-3.5" /> Member Tracker
          </TabsTrigger>
          <TabsTrigger value="absentees" className="gap-1 text-xs h-7 px-3">
            <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Most Absent
          </TabsTrigger>
        </TabsList>

        {/* === CALENDAR VIEW === */}
        <TabsContent value="calendar" className="mt-3 space-y-3">
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
                          <th key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1 uppercase">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((week, wi) => (
                        <tr key={wi}>
                          {week.map((date, di) => {
                            if (!date) return <td key={di} className="p-0.5"><div className="h-14" /></td>;
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
                                    "w-full h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all border text-xs",
                                    isFuture && "opacity-25 cursor-not-allowed",
                                    isSelected
                                      ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm"
                                      : heatColor
                                        ? `${heatColor} border-transparent hover:ring-1 hover:ring-primary/30`
                                        : "border-border/30 hover:bg-muted/30",
                                    isToday && !isSelected && "ring-1 ring-primary/40"
                                  )}
                                >
                                  <span className={cn("text-xs font-bold", isSelected || isToday ? "text-primary" : "")}>{dayNum}</span>
                                  {summary && summary.total > 0 && (
                                    <>
                                      <div className="flex items-center gap-0.5">
                                        <span className="text-[8px] text-green-600 font-medium">{summary.present}</span>
                                        {summary.late > 0 && <span className="text-[8px] text-amber-600">{summary.late}</span>}
                                        <span className="text-[8px] text-red-500">{summary.absent}</span>
                                      </div>
                                      <div className="w-7 h-0.5 rounded-full bg-muted/50 overflow-hidden flex">
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
                  <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-green-100 dark:bg-green-900/20 border border-green-200" /> ≥80%</div>
                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-amber-100 dark:bg-amber-900/20 border border-amber-200" /> 50-80%</div>
                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-red-100 dark:bg-red-900/20 border border-red-200" /> &lt;50%</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Day Detail */}
          {selectedDate && (
            <Card className="border border-border/40 shadow-sm">
              <div className="px-3 py-2.5 border-b border-border/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDaysIcon className="w-4 h-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">{formatDateDisplay(selectedDate)}</h4>
                  {selectedDate === today && <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0 h-5">Today</Badge>}
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-green-600 font-medium">{selectedStats.present}P</span>
                  <span className="text-amber-600 font-medium">{selectedStats.late}L</span>
                  <span className="text-red-500 font-medium">{selectedStats.absent}A</span>
                </div>
              </div>

              {selectedStats.total > 0 && (
                <div className="px-3 py-2 border-b border-border/20">
                  <div className="relative w-full sm:max-w-xs">
                    <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input placeholder="Search member..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-7 text-xs rounded-md" />
                  </div>
                </div>
              )}

              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                {selectedRecords.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-sm">No records for this date.</div>
                ) : (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="bg-muted/20">
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-1.5">Member</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-1.5 hidden sm:table-cell">Phone</th>
                        <th className="text-center text-[11px] font-medium text-muted-foreground px-3 py-1.5">Status</th>
                        <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-1.5 hidden lg:table-cell">Marked By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {selectedRecords.map((r: any) => (
                        <tr key={r.id} className="hover:bg-muted/10">
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                                r.status === "present" ? "bg-green-500" : r.status === "late" ? "bg-amber-500" : "bg-red-500"
                              )} />
                              <span className="text-xs font-medium truncate">{r.members?.name || "—"}</span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 hidden sm:table-cell">
                            <span className="text-[11px] text-muted-foreground">{r.members?.phone || "—"}</span>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <Badge className={cn("text-[10px]",
                              r.status === "present" ? "bg-green-500/10 text-green-600 border-green-200"
                                : r.status === "late" ? "bg-amber-500/10 text-amber-600 border-amber-200"
                                : "bg-red-500/10 text-red-500 border-red-200"
                            )}>
                              {r.status === "present" ? "P" : r.status === "late" ? "L" : "A"}
                            </Badge>
                          </td>
                          <td className="px-3 py-1.5 text-right hidden lg:table-cell">
                            <span className="text-[11px] text-muted-foreground capitalize">{r.marked_by_type || "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* === MEMBER TRACKER VIEW === */}
        <TabsContent value="members" className="mt-3 space-y-3">
          <div className="relative w-full sm:max-w-xs">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search member..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : memberRanking.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No attendance data for this month.</div>
          ) : (
            <Card className="border border-border/40 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] sticky left-0 bg-muted/30 min-w-[140px]">Member</th>
                      {datesWithData.map(d => (
                        <th key={d} className="text-center px-1 py-2 font-medium text-muted-foreground text-[10px] min-w-[32px]">
                          {new Date(d + "T00:00:00").getDate()}
                        </th>
                      ))}
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground text-[10px] min-w-[40px]">P</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground text-[10px] min-w-[40px]">A</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground text-[10px] min-w-[50px]">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {memberRanking.map((m) => {
                      const attendRate = m.total > 0 ? Math.round(((m.present + m.late) / m.total) * 100) : 0;
                      return (
                        <tr key={m.id} className="hover:bg-muted/10">
                          <td className="px-3 py-1.5 sticky left-0 bg-background">
                            <div className="truncate font-medium text-xs">{m.name}</div>
                            <div className="text-[10px] text-muted-foreground">{m.phone}</div>
                          </td>
                          {datesWithData.map(d => {
                            const st = m.dates[d];
                            return (
                              <td key={d} className="text-center px-0.5 py-1.5">
                                {st ? (
                                  <div className={cn("w-5 h-5 rounded-sm mx-auto flex items-center justify-center text-[9px] font-bold",
                                    st === "present" ? "bg-green-500/20 text-green-700 dark:text-green-400"
                                      : st === "late" ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                      : "bg-red-500/20 text-red-600 dark:text-red-400"
                                  )}>
                                    {st === "present" ? "P" : st === "late" ? "L" : "A"}
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-sm mx-auto bg-muted/20" />
                                )}
                              </td>
                            );
                          })}
                          <td className="text-center px-2 py-1.5">
                            <span className="text-green-600 font-semibold text-[11px]">{m.present + m.late}</span>
                          </td>
                          <td className="text-center px-2 py-1.5">
                            <span className="text-red-500 font-semibold text-[11px]">{m.absent}</span>
                          </td>
                          <td className="text-center px-2 py-1.5">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={cn("text-[11px] font-bold",
                                attendRate >= 80 ? "text-green-600" : attendRate >= 50 ? "text-amber-600" : "text-red-500"
                              )}>{attendRate}%</span>
                              <div className="w-8 h-1 rounded-full bg-muted/50 overflow-hidden">
                                <div className={cn("h-full rounded-full",
                                  attendRate >= 80 ? "bg-green-500" : attendRate >= 50 ? "bg-amber-500" : "bg-red-500"
                                )} style={{ width: `${attendRate}%` }} />
                              </div>
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
        </TabsContent>

        {/* === MOST ABSENT VIEW === */}
        <TabsContent value="absentees" className="mt-3 space-y-3">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : memberRanking.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No data available.</div>
          ) : (
            <>
              {/* Top absentees cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {memberRanking.filter(m => m.absent > 0).slice(0, 6).map((m, idx) => {
                  const attendRate = m.total > 0 ? Math.round(((m.present + m.late) / m.total) * 100) : 0;
                  return (
                    <Card key={m.id} className={cn("border shadow-sm", idx < 3 ? "border-red-200 dark:border-red-900/30" : "border-border/40")}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                              idx === 0 ? "bg-red-500/20 text-red-600" : idx === 1 ? "bg-red-400/15 text-red-500" : idx === 2 ? "bg-amber-400/15 text-amber-600" : "bg-muted text-muted-foreground"
                            )}>
                              #{idx + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{m.name}</p>
                              <p className="text-[10px] text-muted-foreground">{m.phone}</p>
                            </div>
                          </div>
                          <Badge className={cn("text-[10px] shrink-0",
                            attendRate >= 80 ? "bg-green-500/10 text-green-600 border-green-200"
                              : attendRate >= 50 ? "bg-amber-500/10 text-amber-600 border-amber-200"
                              : "bg-red-500/10 text-red-500 border-red-200"
                          )}>{attendRate}%</Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[11px]">
                          <span className="text-green-600">{m.present} Present</span>
                          {m.late > 0 && <span className="text-amber-600">{m.late} Late</span>}
                          <span className="text-red-500 font-semibold">{m.absent} Absent</span>
                        </div>
                        <div className="mt-1.5 w-full h-1.5 rounded-full bg-muted/50 overflow-hidden flex">
                          {m.present > 0 && <div className="bg-green-500 h-full" style={{ width: `${(m.present / m.total) * 100}%` }} />}
                          {m.late > 0 && <div className="bg-amber-500 h-full" style={{ width: `${(m.late / m.total) * 100}%` }} />}
                          {m.absent > 0 && <div className="bg-red-400 h-full" style={{ width: `${(m.absent / m.total) * 100}%` }} />}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Full list table */}
              <Card className="border border-border/40 shadow-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <ChartBarIcon className="w-3.5 h-3.5" /> All Members — Sorted by Most Absent
                  </h4>
                  <span className="text-[10px] text-muted-foreground">{memberRanking.length} members</span>
                </div>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="bg-muted/20">
                        <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Member</th>
                        <th className="text-center px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Present</th>
                        <th className="text-center px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Late</th>
                        <th className="text-center px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Absent</th>
                        <th className="text-center px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {memberRanking.map((m, idx) => {
                        const attendRate = m.total > 0 ? Math.round(((m.present + m.late) / m.total) * 100) : 0;
                        return (
                          <tr key={m.id} className="hover:bg-muted/10">
                            <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                            <td className="px-3 py-1.5">
                              <span className="font-medium">{m.name}</span>
                              <span className="text-muted-foreground ml-2 hidden sm:inline">{m.phone}</span>
                            </td>
                            <td className="px-3 py-1.5 text-center text-green-600 font-medium">{m.present}</td>
                            <td className="px-3 py-1.5 text-center text-amber-600 font-medium">{m.late}</td>
                            <td className="px-3 py-1.5 text-center text-red-500 font-semibold">{m.absent}</td>
                            <td className="px-3 py-1.5 text-center">
                              <span className={cn("font-bold",
                                attendRate >= 80 ? "text-green-600" : attendRate >= 50 ? "text-amber-600" : "text-red-500"
                              )}>{attendRate}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
