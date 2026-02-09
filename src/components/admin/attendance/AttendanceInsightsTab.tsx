import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAttendanceInsights } from "@/hooks/queries/useAttendance";
import { useBranch } from "@/contexts/BranchContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { UsersIcon, ClockIcon, ChartBarIcon, UserGroupIcon } from "@heroicons/react/24/outline";

export const AttendanceInsightsTab = () => {
  const { currentBranch } = useBranch();
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
    <div className="space-y-6">
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading insights...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ChartBarIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.total_check_ins ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Total Check-ins</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <UsersIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.unique_members ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Unique Members</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ClockIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.avg_visit_duration ?? 0}h</p>
                    <p className="text-xs text-muted-foreground">Avg Visit Duration</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <UserGroupIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {data?.daily_footfall && data.daily_footfall.length > 0
                        ? Math.round(data.daily_footfall.reduce((s, d) => s + d.count, 0) / data.daily_footfall.length)
                        : 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg Daily Footfall</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Footfall Chart */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Daily Footfall</CardTitle></CardHeader>
            <CardContent>
              {data?.daily_footfall && data.daily_footfall.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.daily_footfall}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip labelFormatter={(d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long" })} />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">No footfall data available.</p>
              )}
            </CardContent>
          </Card>

          {/* Peak Hours */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Peak Hours</CardTitle></CardHeader>
            <CardContent>
              {data?.peak_hours && data.peak_hours.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.peak_hours}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(h: number) => hourLabels[h] || `${h}`} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip labelFormatter={(h: number) => hourLabels[h] || `${h}:00`} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">No peak hour data available.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
