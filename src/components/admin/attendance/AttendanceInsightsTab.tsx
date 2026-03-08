import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAttendanceInsights } from "@/hooks/queries/useAttendance";
import { AttendanceDatePicker } from "./AttendanceDatePicker";
import { useBranch } from "@/contexts/BranchContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { UsersIcon, ClockIcon, ChartBarIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useIsMobile } from "@/hooks/use-mobile";

export const AttendanceInsightsTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);

  const { data, isLoading } = useAttendanceInsights({
    branchId: currentBranch?.id,
    dateFrom,
    dateTo,
  });

  const hourLabels: Record<number, string> = {};
  for (let i = 0; i < 24; i++) {
    hourLabels[i] = `${i % 12 || 12}${i < 12 ? "AM" : "PM"}`;
  }

  return (
    <div className="space-y-3 lg:space-y-6">
      <div className="flex gap-2 lg:gap-3 flex-wrap">
        <AttendanceDatePicker label="From" value={dateFrom} onChange={setDateFrom} className="min-w-[140px] max-w-[180px]" />
        <AttendanceDatePicker label="To" value={dateTo} onChange={setDateTo} className="min-w-[140px] max-w-[180px]" />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading insights...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 lg:pt-4 lg:pb-4 lg:px-4">
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ChartBarIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg lg:text-2xl font-bold leading-tight">{data?.total_check_ins ?? 0}</p>
                    <p className="text-[10px] lg:text-xs text-muted-foreground">Total Check-ins</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 lg:pt-4 lg:pb-4 lg:px-4">
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <UsersIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg lg:text-2xl font-bold leading-tight">{data?.unique_members ?? 0}</p>
                    <p className="text-[10px] lg:text-xs text-muted-foreground">Unique Members</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 lg:pt-4 lg:pb-4 lg:px-4">
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ClockIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg lg:text-2xl font-bold leading-tight">{data?.avg_visit_duration ?? 0}h</p>
                    <p className="text-[10px] lg:text-xs text-muted-foreground">Avg Duration</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 lg:pt-4 lg:pb-4 lg:px-4">
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <UserGroupIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg lg:text-2xl font-bold leading-tight">
                      {data?.daily_footfall && data.daily_footfall.length > 0
                        ? Math.round(data.daily_footfall.reduce((s, d) => s + d.count, 0) / data.daily_footfall.length)
                        : 0}
                    </p>
                    <p className="text-[10px] lg:text-xs text-muted-foreground">Avg Daily Footfall</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Footfall Chart */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="px-3 lg:px-6 pt-3 lg:pt-6 pb-2 lg:pb-4">
              <CardTitle className="text-sm lg:text-lg">Daily Footfall</CardTitle>
            </CardHeader>
            <CardContent className="px-1 lg:px-6 pb-3 lg:pb-6">
              {data?.daily_footfall && data.daily_footfall.length > 0 ? (
                <ResponsiveContainer width="100%" height={isMobile ? 200 : 300}>
                  <LineChart data={data.daily_footfall}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: isMobile ? 9 : 12 }}
                      tickFormatter={(d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      interval={isMobile ? "preserveStartEnd" : undefined}
                    />
                    <YAxis tick={{ fontSize: isMobile ? 9 : 12 }} width={isMobile ? 30 : 40} />
                    <Tooltip labelFormatter={(d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long" })} />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8 text-xs lg:text-sm">No footfall data available.</p>
              )}
            </CardContent>
          </Card>

          {/* Peak Hours */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="px-3 lg:px-6 pt-3 lg:pt-6 pb-2 lg:pb-4">
              <CardTitle className="text-sm lg:text-lg">Peak Hours</CardTitle>
            </CardHeader>
            <CardContent className="px-1 lg:px-6 pb-3 lg:pb-6">
              {data?.peak_hours && data.peak_hours.length > 0 ? (
                <ResponsiveContainer width="100%" height={isMobile ? 180 : 250}>
                  <BarChart data={data.peak_hours}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: isMobile ? 8 : 11 }}
                      tickFormatter={(h: number) => hourLabels[h] || `${h}`}
                      interval={isMobile ? 2 : 0}
                    />
                    <YAxis tick={{ fontSize: isMobile ? 9 : 12 }} width={isMobile ? 25 : 40} />
                    <Tooltip labelFormatter={(h: number) => hourLabels[h] || `${h}:00`} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8 text-xs lg:text-sm">No peak hour data available.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
