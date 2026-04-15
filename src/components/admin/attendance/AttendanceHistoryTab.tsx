import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { useAttendanceFilters, formatSlotTime } from "@/hooks/queries/useAttendanceFilters";
import { UserGroupIcon, FunnelIcon } from "@heroicons/react/24/outline";

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

const DAY_HEADERS_MOBILE = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const AttendanceHistoryTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
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
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const { trainers, allSlots, isLimitedAccess } = useAttendanceFilters();
  const filteredSlots = useMemo(() => {
    if (selectedTrainerId) return allSlots.filter(s => s.trainer_id === selectedTrainerId);
    return allSlots;
  }, [allSlots, selectedTrainerId]);

  const weeks = useMemo(() => getMonthDates(currentMonth.year, currentMonth.month), [currentMonth]);
  const monthStart = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-${new Date(currentMonth.year, currentMonth.month + 1, 0).getDate()}`;
  const monthLabel = new Date(currentMonth.year, currentMonth.month).toLocaleDateString("en-IN", { month: isMobile ? "short" : "long", year: "numeric" });

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

  const memberStats = useMemo(() => {
    const map: Record<string, { name: string; phone: string; present: number; late: number; absent: number; total: number; dates: Record<string, string> }> = {};
    monthRecords.forEach((r: any) => {
      const id = r.member_id;
      if (!id) return;
      if (!map[id]) map[id] = { name: r.members?.name || "Unknown", phone: r.members?.phone || "", present: 0, late: 0, absent: 0, total: 0, dates: {} };
      map[id].total++;
      if (r.status === "present") map[id].present++;
      else if (r.status === "late") map[id].late++;
      else map[id].absent++;
      map[id].dates[r.date] = r.status;
    });
    return map;
  }, [monthRecords]);

  const memberRanking = useMemo(() => {
    const arr = Object.entries(memberStats).map(([id, s]) => ({ id, ...s, absentRate: s.total > 0 ? s.absent / s.total : 0 }));
    const q = memberSearch.toLowerCase();
    const filtered = q ? arr.filter(m => m.name.toLowerCase().includes(q) || m.phone.includes(q)) : arr;
    return filtered.sort((a, b) => b.absent - a.absent || b.absentRate - a.absentRate);
  }, [memberStats, memberSearch]);

  const monthTotals = useMemo(() => {
    let present = 0, late = 0, absent = 0;
    monthRecords.forEach((r: any) => {
      if (r.status === "present") present++;
      else if (r.status === "late") late++;
      else absent++;
    });
    return { present, late, absent, total: monthRecords.length };
  }, [monthRecords]);

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
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: isMobile ? "short" : "long", day: "numeric", month: "short",
    });

  const getHeatColor = (date: string) => {
    const s = daySummary[date];
    if (!s || s.total === 0) return "";
    const rate = (s.present + s.late) / s.total;
    if (rate >= 0.8) return "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300";
    if (rate >= 0.5) return "bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300";
    return "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300";
  };

  const datesWithData = useMemo(() => Object.keys(daySummary).sort(), [daySummary]);
  const headers = isMobile ? DAY_HEADERS_MOBILE : DAY_HEADERS;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Month Nav + Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateMonth("prev")}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <h3 className="text-sm font-semibold min-w-[100px] lg:min-w-[140px] text-center">{monthLabel}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateMonth("next")}
            disabled={currentMonth.year === new Date().getFullYear() && currentMonth.month >= new Date().getMonth()}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 font-medium">{monthTotals.present}P</span>
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 font-medium">{monthTotals.late}L</span>
            <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 font-medium">{monthTotals.absent}A</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
            <ArrowPathIcon className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* View Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="h-7 p-0.5 bg-muted/50 w-full">
          <TabsTrigger value="calendar" className="gap-1 text-[10px] lg:text-xs h-6 px-2 lg:px-3 flex-1">
            <CalendarDaysIcon className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> Calendar
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-1 text-[10px] lg:text-xs h-6 px-2 lg:px-3 flex-1">
            <UserIcon className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> Tracker
          </TabsTrigger>
          <TabsTrigger value="absentees" className="gap-1 text-[10px] lg:text-xs h-6 px-2 lg:px-3 flex-1">
            <ExclamationTriangleIcon className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> Absent
          </TabsTrigger>
        </TabsList>

        {/* ═══ CALENDAR VIEW ═══ */}
        <TabsContent value="calendar" className="mt-3 space-y-3 animate-fade-in">
          <Card className="border border-border/40 shadow-sm">
            <CardContent className="p-2 lg:p-3">
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
              ) : (
                <div>
                  <table className="w-full table-fixed">
                    <thead>
                      <tr>
                        {headers.map((d) => (
                          <th key={d} className="text-center text-[9px] lg:text-[10px] font-medium text-muted-foreground py-1 uppercase">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((week, wi) => (
                        <tr key={wi}>
                          {week.map((date, di) => {
                            if (!date) return <td key={di} className="p-0.5"><div className={cn(isMobile ? "h-10" : "h-14")} /></td>;
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
                                    "w-full rounded-lg flex flex-col items-center justify-center transition-all duration-200 border active:scale-95",
                                    isMobile ? "h-10 gap-0" : "h-14 gap-0.5",
                                    isFuture && "opacity-20 cursor-not-allowed",
                                    isSelected
                                      ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm"
                                      : heatColor
                                        ? `${heatColor} border-transparent hover:ring-1 hover:ring-primary/30`
                                        : "border-border/20 hover:bg-muted/30",
                                    isToday && !isSelected && "ring-1 ring-primary/40"
                                  )}
                                >
                                  <span className={cn(
                                    "font-bold",
                                    isMobile ? "text-[10px]" : "text-xs",
                                    isSelected || isToday ? "text-primary" : ""
                                  )}>{dayNum}</span>
                                  {summary && summary.total > 0 && !isMobile && (
                                    <>
                                      <div className="flex items-center gap-0.5">
                                        <span className="text-[7px] text-green-600 font-medium">{summary.present}</span>
                                        <span className="text-[7px] text-red-500">{summary.absent}</span>
                                      </div>
                                      <div className="w-6 h-0.5 rounded-full bg-muted/50 overflow-hidden flex">
                                        <div className="bg-green-500 h-full" style={{ width: `${summary.total > 0 ? (summary.present / summary.total) * 100 : 0}%` }} />
                                      </div>
                                    </>
                                  )}
                                  {summary && summary.total > 0 && isMobile && (
                                    <div className={cn("w-1.5 h-1.5 rounded-full mt-0.5",
                                      (summary.present + summary.late) / summary.total >= 0.8 ? "bg-green-500" :
                                      (summary.present + summary.late) / summary.total >= 0.5 ? "bg-amber-500" : "bg-red-500"
                                    )} />
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!isMobile && (
                    <div className="flex items-center justify-center gap-3 mt-2 text-[9px] text-muted-foreground">
                      <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-green-100 dark:bg-green-900/20 border border-green-200" />≥80%</div>
                      <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-amber-100 dark:bg-amber-900/20 border border-amber-200" />50-80%</div>
                      <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-red-100 dark:bg-red-900/20 border border-red-200" />&lt;50%</div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Day Detail */}
          {selectedDate && (
            <Card className="border border-border/40 shadow-sm animate-fade-in">
              <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CalendarDaysIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <h4 className="text-xs font-semibold truncate">{formatDateDisplay(selectedDate)}</h4>
                  {selectedDate === today && <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] py-0 h-4">Today</Badge>}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                  <span className="text-green-600 font-medium">{selectedStats.present}P</span>
                  <span className="text-amber-600 font-medium">{selectedStats.late}L</span>
                  <span className="text-red-500 font-medium">{selectedStats.absent}A</span>
                </div>
              </div>

              {selectedStats.total > 0 && (
                <div className="px-3 py-1.5 border-b border-border/20">
                  <div className="relative w-full">
                    <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-7 h-7 text-[11px] rounded-md" />
                  </div>
                </div>
              )}

              <div className="max-h-[350px] overflow-y-auto">
                {selectedRecords.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-xs">No records.</div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {selectedRecords.map((r: any, idx: number) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/10 animate-fade-in"
                        style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                            r.status === "present" ? "bg-green-500" : r.status === "late" ? "bg-amber-500" : "bg-red-500"
                          )} />
                          <div className="min-w-0">
                            <span className="text-xs font-medium truncate block">{r.members?.name || "—"}</span>
                            {isMobile && <span className="text-[10px] text-muted-foreground">{r.members?.phone || ""}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!isMobile && <span className="text-[10px] text-muted-foreground">{r.members?.phone || ""}</span>}
                          <Badge className={cn("text-[9px] px-1.5",
                            r.status === "present" ? "bg-green-500/10 text-green-600 border-green-200" :
                            r.status === "late" ? "bg-amber-500/10 text-amber-600 border-amber-200" :
                            "bg-red-500/10 text-red-500 border-red-200"
                          )}>
                            {r.status === "present" ? "P" : r.status === "late" ? "L" : "A"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ═══ MEMBER TRACKER ═══ */}
        <TabsContent value="members" className="mt-3 space-y-3 animate-fade-in">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search member..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : memberRanking.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No data this month.</div>
          ) : isMobile ? (
            /* Mobile: Card per member with dot grid */
            <div className="space-y-2">
              {memberRanking.map((m, idx) => {
                const attendRate = m.total > 0 ? Math.round(((m.present + m.late) / m.total) * 100) : 0;
                return (
                  <Card key={m.id} className="border border-border/40 animate-fade-in" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <p className="text-[10px] text-muted-foreground">{m.phone}</p>
                        </div>
                        <Badge className={cn("text-[10px] shrink-0",
                          attendRate >= 80 ? "bg-green-500/10 text-green-600 border-green-200" :
                          attendRate >= 50 ? "bg-amber-500/10 text-amber-600 border-amber-200" :
                          "bg-red-500/10 text-red-500 border-red-200"
                        )}>{attendRate}%</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] mb-2">
                        <span className="text-green-600">{m.present}P</span>
                        {m.late > 0 && <span className="text-amber-600">{m.late}L</span>}
                        <span className="text-red-500">{m.absent}A</span>
                      </div>
                      {/* Dot grid of dates */}
                      <div className="flex flex-wrap gap-0.5">
                        {datesWithData.map(d => {
                          const st = m.dates[d];
                          return (
                            <div key={d} className={cn("w-4 h-4 rounded-sm text-[7px] font-bold flex items-center justify-center transition-colors",
                              st === "present" ? "bg-green-500/20 text-green-700" :
                              st === "late" ? "bg-amber-500/20 text-amber-700" :
                              st === "absent" ? "bg-red-500/20 text-red-600" :
                              "bg-muted/30"
                            )} title={d}>
                              {new Date(d + "T00:00:00").getDate()}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* Desktop: Table grid */
            <Card className="border border-border/40 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] sticky left-0 bg-muted/30 min-w-[140px]">Member</th>
                      {datesWithData.map(d => (
                        <th key={d} className="text-center px-1 py-2 font-medium text-muted-foreground text-[10px] min-w-[28px]">
                          {new Date(d + "T00:00:00").getDate()}
                        </th>
                      ))}
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground text-[10px] min-w-[36px]">P</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground text-[10px] min-w-[36px]">A</th>
                      <th className="text-center px-2 py-2 font-medium text-muted-foreground text-[10px] min-w-[44px]">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {memberRanking.map((m) => {
                      const attendRate = m.total > 0 ? Math.round(((m.present + m.late) / m.total) * 100) : 0;
                      return (
                        <tr key={m.id} className="hover:bg-muted/10 transition-colors duration-150">
                          <td className="px-3 py-1.5 sticky left-0 bg-background">
                            <div className="truncate font-medium text-xs">{m.name}</div>
                            <div className="text-[10px] text-muted-foreground">{m.phone}</div>
                          </td>
                          {datesWithData.map(d => {
                            const st = m.dates[d];
                            return (
                              <td key={d} className="text-center px-0.5 py-1.5">
                                {st ? (
                                  <div className={cn("w-5 h-5 rounded-sm mx-auto flex items-center justify-center text-[8px] font-bold transition-colors duration-200",
                                    st === "present" ? "bg-green-500/20 text-green-700 dark:text-green-400" :
                                    st === "late" ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" :
                                    "bg-red-500/20 text-red-600 dark:text-red-400"
                                  )}>
                                    {st[0].toUpperCase()}
                                  </div>
                                ) : <div className="w-5 h-5 rounded-sm mx-auto bg-muted/20" />}
                              </td>
                            );
                          })}
                          <td className="text-center px-2 py-1.5"><span className="text-green-600 font-semibold text-[11px]">{m.present + m.late}</span></td>
                          <td className="text-center px-2 py-1.5"><span className="text-red-500 font-semibold text-[11px]">{m.absent}</span></td>
                          <td className="text-center px-2 py-1.5">
                            <span className={cn("text-[11px] font-bold",
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
          )}
        </TabsContent>

        {/* ═══ MOST ABSENT ═══ */}
        <TabsContent value="absentees" className="mt-3 space-y-3 animate-fade-in">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : memberRanking.filter(m => m.absent > 0).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No absentees this month 🎉</div>
          ) : (
            <>
              {/* Top absentees */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {memberRanking.filter(m => m.absent > 0).slice(0, 6).map((m, idx) => {
                  const attendRate = m.total > 0 ? Math.round(((m.present + m.late) / m.total) * 100) : 0;
                  return (
                    <Card key={m.id}
                      className={cn("border shadow-sm animate-fade-in", idx < 3 ? "border-red-200 dark:border-red-900/30" : "border-border/40")}
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                              idx === 0 ? "bg-red-500/20 text-red-600" : idx === 1 ? "bg-red-400/15 text-red-500" : "bg-muted text-muted-foreground"
                            )}>#{idx + 1}</div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{m.name}</p>
                              <p className="text-[10px] text-muted-foreground">{m.phone}</p>
                            </div>
                          </div>
                          <Badge className={cn("text-[9px] shrink-0",
                            attendRate >= 80 ? "bg-green-500/10 text-green-600 border-green-200" :
                            attendRate >= 50 ? "bg-amber-500/10 text-amber-600 border-amber-200" :
                            "bg-red-500/10 text-red-500 border-red-200"
                          )}>{attendRate}%</Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[10px]">
                          <span className="text-green-600">{m.present}P</span>
                          {m.late > 0 && <span className="text-amber-600">{m.late}L</span>}
                          <span className="text-red-500 font-semibold">{m.absent}A</span>
                        </div>
                        <div className="mt-1.5 w-full h-1 rounded-full bg-muted/50 overflow-hidden flex">
                          {m.present > 0 && <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${(m.present / m.total) * 100}%` }} />}
                          {m.late > 0 && <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${(m.late / m.total) * 100}%` }} />}
                          {m.absent > 0 && <div className="bg-red-400 h-full transition-all duration-500" style={{ width: `${(m.absent / m.total) * 100}%` }} />}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Full ranking table */}
              <Card className="border border-border/40 shadow-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-border/30">
                  <h4 className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <ChartBarIcon className="w-3 h-3" /> Sorted by Most Absent
                  </h4>
                </div>
                <div className="max-h-[350px] overflow-y-auto">
                  <div className="divide-y divide-border/20">
                    {memberRanking.map((m, idx) => {
                      const attendRate = m.total > 0 ? Math.round(((m.present + m.late) / m.total) * 100) : 0;
                      return (
                        <div key={m.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/10 transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] text-muted-foreground w-5 shrink-0">{idx + 1}</span>
                            <div className="min-w-0">
                              <span className="text-xs font-medium truncate block">{m.name}</span>
                              {isMobile && <span className="text-[10px] text-muted-foreground">{m.phone}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-[10px]">
                            {!isMobile && <span className="text-muted-foreground">{m.phone}</span>}
                            <span className="text-green-600">{m.present}P</span>
                            <span className="text-red-500 font-semibold">{m.absent}A</span>
                            <span className={cn("font-bold min-w-[30px] text-right",
                              attendRate >= 80 ? "text-green-600" : attendRate >= 50 ? "text-amber-600" : "text-red-500"
                            )}>{attendRate}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
