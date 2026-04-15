import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { AttendanceDatePicker } from "./AttendanceDatePicker";
import { Progress } from "@/components/ui/progress";
import {
  ExclamationTriangleIcon,
  UserGroupIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface MemberAbsentStats {
  memberId: string;
  memberName: string;
  memberPhone: string;
  totalDays: number;
  absentDays: number;
  presentDays: number;
  lateDays: number;
  attendanceRate: number;
}

export const AbsentAnalyticsTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);

  const { data: records = [], isLoading, refetch } = useQuery({
    queryKey: ["attendance-analytics", branchId, dateFrom, dateTo],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("member_id, status, date, members(name, phone)")
        .eq("branch_id", branchId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .is("time_slot_id", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  const memberStats = useMemo((): MemberAbsentStats[] => {
    const map = new Map<string, { name: string; phone: string; present: number; absent: number; late: number; dates: Set<string> }>();

    records.forEach((r: any) => {
      const id = r.member_id;
      if (!map.has(id)) {
        map.set(id, {
          name: r.members?.name || "Unknown",
          phone: r.members?.phone || "",
          present: 0, absent: 0, late: 0,
          dates: new Set(),
        });
      }
      const entry = map.get(id)!;
      entry.dates.add(r.date);
      if (r.status === "present") entry.present++;
      else if (r.status === "late") entry.late++;
      else entry.absent++;
    });

    return Array.from(map.entries())
      .map(([id, data]) => ({
        memberId: id,
        memberName: data.name,
        memberPhone: data.phone,
        totalDays: data.dates.size,
        absentDays: data.absent,
        presentDays: data.present,
        lateDays: data.late,
        attendanceRate: data.dates.size > 0
          ? Math.round(((data.present + data.late) / data.dates.size) * 100)
          : 0,
      }))
      .sort((a, b) => a.attendanceRate - b.attendanceRate); // Worst attendance first
  }, [records]);

  const frequentAbsentees = memberStats.filter((m) => m.attendanceRate < 50 && m.totalDays >= 3);

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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 lg:gap-3 flex-wrap">
          <AttendanceDatePicker label="From" value={dateFrom} onChange={setDateFrom} className="min-w-[140px] max-w-[180px]" />
          <AttendanceDatePicker label="To" value={dateTo} onChange={setDateTo} className="min-w-[140px] max-w-[180px]" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1 h-8 text-xs">
          <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Frequent Absentees Alert */}
      {frequentAbsentees.length > 0 && (
        <Card className="border border-red-200 dark:border-red-800 bg-red-500/5 shadow-sm">
          <CardHeader className="px-3 lg:px-4 py-2.5 lg:py-3">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 lg:w-5 lg:h-5 text-red-500" />
              <CardTitle className="text-xs lg:text-sm text-red-600 dark:text-red-400">
                {frequentAbsentees.length} member{frequentAbsentees.length > 1 ? "s" : ""} with low attendance (&lt;50%)
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
          <CardHeader className="px-3 lg:px-4 py-2.5 bg-muted/30">
            <CardTitle className="text-xs lg:text-sm font-semibold">Member Attendance Ranking</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/30">
              {memberStats.map((member, idx) => (
                <div
                  key={member.memberId}
                  className={cn(
                    "px-3 lg:px-4 py-2.5 lg:py-3 flex items-center gap-3 transition-all hover:bg-muted/20",
                    member.attendanceRate < 50 && "bg-red-500/[0.02]"
                  )}
                >
                  {/* Rank */}
                  <div className="w-6 lg:w-7 text-center shrink-0">
                    <span className={cn(
                      "text-xs lg:text-sm font-bold",
                      idx < 3 ? "text-primary" : "text-muted-foreground"
                    )}>
                      {idx + 1}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs lg:text-sm font-medium truncate">{member.memberName}</p>
                      {member.attendanceRate < 30 && (
                        <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", getProgressColor(member.attendanceRate))}
                          style={{ width: `${member.attendanceRate}%` }}
                        />
                      </div>
                      <span className={cn("text-[10px] lg:text-xs font-semibold w-10 text-right", getAttendanceColor(member.attendanceRate))}>
                        {member.attendanceRate}%
                      </span>
                    </div>
                    <div className="flex gap-2 mt-1 text-[9px] lg:text-[10px] text-muted-foreground">
                      <span className="text-green-600">{member.presentDays}P</span>
                      <span className="text-amber-600">{member.lateDays}L</span>
                      <span className="text-red-500">{member.absentDays}A</span>
                      <span>/ {member.totalDays} days</span>
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
  );
};
