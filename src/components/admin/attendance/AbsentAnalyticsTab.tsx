import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useAssignedMemberIds } from "@/hooks/useAssignedMembers";
import {
  ExclamationTriangleIcon,
  UserGroupIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  MinusCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MemberAbsentStats {
  memberId: string;
  memberName: string;
  memberPhone: string;
  presentDays: number;
  absentDays: number;
  skippedDays: number;
  /** Days that count toward the rate (present + absent). Excludes skipped. */
  countedDays: number;
  /** present / countedDays */
  attendanceRate: number;
}

export const AbsentAnalyticsTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  const branchId = currentBranch?.id;
  const { assignedMemberIds } = useAssignedMemberIds();

  const today = new Date().toISOString().split("T")[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);

  const { data: records = [], isLoading, refetch } = useQuery({
    queryKey: ["attendance-analytics", branchId, dateFrom, dateTo, assignedMemberIds],
    queryFn: async () => {
      if (!branchId) return [];
      let query = supabase
        .from("daily_attendance")
        .select("member_id, status, date, members(name, phone)")
        .eq("branch_id", branchId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .is("time_slot_id", null);
      if (assignedMemberIds !== null && assignedMemberIds.length > 0) {
        query = query.in("member_id", assignedMemberIds);
      } else if (assignedMemberIds !== null && assignedMemberIds.length === 0) {
        return [];
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && (assignedMemberIds === null || assignedMemberIds !== undefined),
  });

  // Latest gym subscription status per member appearing in this period.
  // Used to surface attendance recorded while the member was already expired
  // (renewal reminder workflow).
  const memberIdsInPeriod = useMemo(() => {
    const ids = new Set<string>();
    records.forEach((r: any) => { if (r.member_id) ids.add(r.member_id); });
    return Array.from(ids);
  }, [records]);

  const { data: memberStatusMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["attendance-analytics-statuses", branchId, memberIdsInPeriod.sort().join(",")],
    queryFn: async () => {
      if (!branchId || memberIdsInPeriod.length === 0) return {};
      const { data, error } = await supabase
        .from("subscriptions")
        .select("member_id, status, end_date")
        .in("member_id", memberIdsInPeriod)
        .order("end_date", { ascending: false });
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data || []) as any[]) {
        if (row.member_id && !map[row.member_id]) map[row.member_id] = row.status;
      }
      return map;
    },
    enabled: !!branchId && memberIdsInPeriod.length > 0,
    staleTime: 60_000,
  });

  const memberStats = useMemo((): MemberAbsentStats[] => {
    const map = new Map<string, { name: string; phone: string; present: number; absent: number; skipped: number }>();

    records.forEach((r: any) => {
      const id = r.member_id;
      if (!map.has(id)) {
        map.set(id, {
          name: r.members?.name || "Unknown",
          phone: r.members?.phone || "",
          present: 0, absent: 0, skipped: 0,
        });
      }
      const entry = map.get(id)!;
      if (r.status === "present") entry.present++;
      else if (r.status === "skipped" || r.status === "late") entry.skipped++;
      else entry.absent++;
    });

    return Array.from(map.entries())
      .map(([id, data]) => {
        const counted = data.present + data.absent; // skipped excluded
        return {
          memberId: id,
          memberName: data.name,
          memberPhone: data.phone,
          presentDays: data.present,
          absentDays: data.absent,
          skippedDays: data.skipped,
          countedDays: counted,
          attendanceRate: counted > 0 ? Math.round((data.present / counted) * 100) : 0,
        };
      })
      .sort((a, b) => {
        // Show members with low attendance first; members with no counted days last
        if (a.countedDays === 0 && b.countedDays > 0) return 1;
        if (b.countedDays === 0 && a.countedDays > 0) return -1;
        return a.attendanceRate - b.attendanceRate;
      });
  }, [records]);

  // Branch-wide summary (skipped excluded from rate)
  const summary = useMemo(() => {
    let present = 0, absent = 0, skipped = 0;
    memberStats.forEach((m) => {
      present += m.presentDays;
      absent += m.absentDays;
      skipped += m.skippedDays;
    });
    const counted = present + absent;
    const rate = counted > 0 ? Math.round((present / counted) * 100) : 0;
    return { present, absent, skipped, counted, rate, totalMembers: memberStats.length };
  }, [memberStats]);

  const frequentAbsentees = memberStats.filter((m) => m.countedDays >= 3 && m.attendanceRate < 50);

  const getAttendanceColor = (rate: number) => {
    if (rate >= 80) return "text-green-600";
    if (rate >= 50) return "text-amber-600";
    return "text-red-500";
  };

  const getProgressColor = (rate: number) => {
    if (rate >= 80) return "bg-green-500";
    if (rate >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 lg:gap-3 animate-fade-in">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-[10px] lg:text-xs text-muted-foreground font-medium shrink-0">Date range</span>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
              }}
              className="w-full sm:w-[260px] h-8 lg:h-9 text-xs lg:text-sm transition-all hover:border-primary/50"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1 h-8 text-xs transition-all hover:bg-accent hover:scale-[1.02] active:scale-[0.98]"
          >
            <ArrowPathIcon className={cn("w-3.5 h-3.5 transition-transform", isLoading && "animate-spin")} /> Refresh
          </Button>
        </div>

        {/* Plain-English explainer */}
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border/40 text-[11px] lg:text-xs text-muted-foreground">
          <InformationCircleIcon className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
          <p>
            <span className="font-medium text-foreground">Attendance % = Present ÷ (Present + Absent).</span>{" "}
            Skipped days (holidays, leaves, off-days) are excluded — they don't count as absent.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
          <Card className="border border-border/40 shadow-sm">
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] lg:text-xs text-muted-foreground font-medium">Attendance Rate</span>
                <CheckCircleIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-green-600" />
              </div>
              <p className={cn("text-lg lg:text-2xl font-bold", getAttendanceColor(summary.rate))}>
                {summary.counted > 0 ? `${summary.rate}%` : "—"}
              </p>
              <p className="text-[9px] lg:text-[10px] text-muted-foreground mt-0.5">
                {summary.present} of {summary.counted} counted days
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border/40 shadow-sm">
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] lg:text-xs text-muted-foreground font-medium">Present</span>
                <CheckCircleIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-green-600" />
              </div>
              <p className="text-lg lg:text-2xl font-bold text-green-600">{summary.present}</p>
              <p className="text-[9px] lg:text-[10px] text-muted-foreground mt-0.5">total check-ins</p>
            </CardContent>
          </Card>

          <Card className="border border-border/40 shadow-sm">
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] lg:text-xs text-muted-foreground font-medium">Absent</span>
                <XCircleIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-red-500" />
              </div>
              <p className="text-lg lg:text-2xl font-bold text-red-500">{summary.absent}</p>
              <p className="text-[9px] lg:text-[10px] text-muted-foreground mt-0.5">missed gym days</p>
            </CardContent>
          </Card>

          <Card className="border border-border/40 shadow-sm">
            <CardContent className="p-3 lg:p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] lg:text-xs text-muted-foreground font-medium">Skipped</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <MinusCircleIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-xs">
                    Days marked as off, leave, or holiday. Excluded from the attendance rate.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-lg lg:text-2xl font-bold text-slate-600 dark:text-slate-300">{summary.skipped}</p>
              <p className="text-[9px] lg:text-[10px] text-muted-foreground mt-0.5">excluded from rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Frequent Absentees Alert */}
        {frequentAbsentees.length > 0 && (
          <Card className="border border-red-200 dark:border-red-800 bg-red-500/5 shadow-sm">
            <CardHeader className="px-3 lg:px-4 py-2.5 lg:py-3">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 lg:w-5 lg:h-5 text-red-500" />
                <CardTitle className="text-xs lg:text-sm text-red-600 dark:text-red-400">
                  {frequentAbsentees.length} member{frequentAbsentees.length > 1 ? "s" : ""} need attention (&lt;50% attendance)
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-3 lg:px-4 pb-3 pt-0">
              <div className="flex flex-wrap gap-1.5">
                {frequentAbsentees.slice(0, 10).map((m) => (
                  <Badge key={m.memberId} variant="outline" className="text-[10px] border-red-200 text-red-600 dark:border-red-800 dark:text-red-400">
                    {m.memberName} ({m.attendanceRate}%)
                  </Badge>
                ))}
                {frequentAbsentees.length > 10 && (
                  <Badge variant="secondary" className="text-[10px]">
                    +{frequentAbsentees.length - 10} more
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Full Member Analytics */}
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Analyzing attendance...</div>
        ) : memberStats.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <UserGroupIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No attendance data for this period.</p>
          </div>
        ) : (
          <Card className="border border-border/40 shadow-sm overflow-hidden">
            <CardHeader className="px-3 lg:px-4 py-2.5 bg-muted/30 flex flex-row items-center justify-between">
              <CardTitle className="text-xs lg:text-sm font-semibold">Member Attendance Ranking</CardTitle>
              <div className="flex items-center gap-3 text-[9px] lg:text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Present</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Absent</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Skipped</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {memberStats.map((member, idx) => (
                  <div
                    key={member.memberId}
                    className={cn(
                      "px-3 lg:px-4 py-2.5 lg:py-3 flex items-center gap-3 transition-all hover:bg-muted/20",
                      member.countedDays >= 3 && member.attendanceRate < 50 && "bg-red-500/[0.02]"
                    )}
                  >
                    {/* Rank */}
                    <div className="w-6 lg:w-7 text-center shrink-0">
                      <span className={cn(
                        "text-xs lg:text-sm font-bold",
                        idx < 3 && member.countedDays > 0 ? "text-primary" : "text-muted-foreground"
                      )}>
                        {idx + 1}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs lg:text-sm font-medium truncate">{member.memberName}</p>
                        {member.countedDays >= 3 && member.attendanceRate < 30 && (
                          <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        {member.countedDays === 0 && member.skippedDays > 0 && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">All skipped</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500", getProgressColor(member.attendanceRate))}
                            style={{ width: `${member.countedDays > 0 ? member.attendanceRate : 0}%` }}
                          />
                        </div>
                        <span className={cn("text-[10px] lg:text-xs font-semibold w-10 text-right", getAttendanceColor(member.attendanceRate))}>
                          {member.countedDays > 0 ? `${member.attendanceRate}%` : "—"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[9px] lg:text-[10px] text-muted-foreground">
                        <span className="text-green-600 font-medium">{member.presentDays} present</span>
                        <span className="text-red-500 font-medium">{member.absentDays} absent</span>
                        {member.skippedDays > 0 && (
                          <span className="text-slate-500">{member.skippedDays} skipped (excluded)</span>
                        )}
                      </div>
                    </div>

                    {/* Phone */}
                    {!isMobile && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{member.memberPhone}</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
};
