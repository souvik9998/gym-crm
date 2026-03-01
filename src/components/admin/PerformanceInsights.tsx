import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  CurrencyRupeeIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
} from "@heroicons/react/24/outline";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { cn } from "@/lib/utils";

interface BranchMetrics {
  branchId: string;
  branchName: string;
  revenue: number;
  members: number;
  activeMembers: number;
  newMembers: number;
  ptSubscriptions: number;
  expenses: number;
  profit: number;
  avgRevenuePerMember: number;
}

interface TrainerMetrics {
  trainerId: string;
  trainerName: string;
  branchId: string;
  branchName: string;
  members: number;
  revenue: number;
  sessions: number;
  avgRevenuePerMember: number;
  percentage: number;
}

interface TimeSeriesData {
  date: string;
  [key: string]: string | number;
}

const COLORS = [
  "hsl(var(--accent))",
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(262, 83%, 58%)",
  "hsl(142, 76%, 36%)",
  "hsl(0, 72%, 51%)",
  "hsl(217, 91%, 60%)",
];

export const PerformanceInsights = () => {
  const { allBranches } = useBranch();
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>(
    format(startOfMonth(subDays(new Date(), 30)), "yyyy-MM-dd")
  );
  const [dateTo, setDateTo] = useState<string>(
    format(endOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [branchMetrics, setBranchMetrics] = useState<BranchMetrics[]>([]);
  const [trainerMetrics, setTrainerMetrics] = useState<TrainerMetrics[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"branches" | "trainers">("branches");

  useEffect(() => {
    if (allBranches && allBranches.length > 0) {
      // Auto-select all branches initially
      setSelectedBranches(allBranches.map((b) => b.id));
    }
  }, [allBranches]);

  useEffect(() => {
    if (selectedBranches.length > 0 && dateFrom && dateTo) {
      fetchBranchMetrics();
      if (activeTab === "trainers") {
        fetchTrainerMetrics();
      }
    }
  }, [selectedBranches, dateFrom, dateTo, activeTab]);

  const fetchBranchMetrics = async () => {
    setIsLoading(true);
    try {
      const metrics: BranchMetrics[] = [];

      for (const branchId of selectedBranches) {
        const branch = allBranches?.find((b) => b.id === branchId);
        if (!branch) continue;

        // Fetch payments (revenue)
        const { data: payments } = await supabase
          .from("payments")
          .select("amount, created_at, status")
          .eq("branch_id", branchId)
          .eq("status", "success")
          .gte("created_at", `${dateFrom}T00:00:00`)
          .lte("created_at", `${dateTo}T23:59:59`);

        const revenue = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

        // Fetch members
        const { data: members } = await supabase
          .from("members")
          .select("id, created_at")
          .eq("branch_id", branchId);

        const totalMembers = members?.length || 0;
        const newMembers =
          members?.filter(
            (m) =>
              new Date(m.created_at) >= new Date(`${dateFrom}T00:00:00`) &&
              new Date(m.created_at) <= new Date(`${dateTo}T23:59:59`)
          ).length || 0;

        // Fetch active subscriptions
        const { data: activeSubscriptions } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("branch_id", branchId)
          .eq("status", "active");

        const activeMembers = activeSubscriptions?.length || 0;

        // Fetch PT subscriptions
        const { data: ptSubs } = await supabase
          .from("pt_subscriptions")
          .select("id")
          .eq("branch_id", branchId)
          .gte("created_at", `${dateFrom}T00:00:00`)
          .lte("created_at", `${dateTo}T23:59:59`);

        const ptSubscriptions = ptSubs?.length || 0;

        // Fetch expenses
        const { data: expenses } = await supabase
          .from("ledger_entries")
          .select("amount")
          .eq("branch_id", branchId)
          .eq("entry_type", "expense")
          .gte("entry_date", dateFrom)
          .lte("entry_date", dateTo);

        const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;

        const profit = revenue - totalExpenses;
        const avgRevenuePerMember = totalMembers > 0 ? revenue / totalMembers : 0;

        metrics.push({
          branchId,
          branchName: branch.name,
          revenue,
          members: totalMembers,
          activeMembers,
          newMembers,
          ptSubscriptions,
          expenses: totalExpenses,
          profit,
          avgRevenuePerMember,
        });
      }

      setBranchMetrics(metrics);

      // Generate time series data for branch comparison
      await generateTimeSeriesData(selectedBranches);
    } catch (error) {
      console.error("Error fetching branch metrics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTrainerMetrics = async () => {
    setIsLoading(true);
    try {
      const metrics: TrainerMetrics[] = [];

      // Fetch all trainers from selected branches
      const { data: trainers } = await supabase
        .from("personal_trainers")
        .select("id, name, branch_id, percentage_fee")
        .in("branch_id", selectedBranches)
        .eq("is_active", true);

      if (!trainers) return;

      for (const trainer of trainers) {
        const branch = allBranches?.find((b) => b.id === trainer.branch_id);
        if (!branch) continue;

        // Fetch PT subscriptions for this trainer
        const { data: ptSubs } = await supabase
          .from("pt_subscriptions")
          .select("member_id, total_fee, created_at")
          .eq("personal_trainer_id", trainer.id)
          .eq("branch_id", trainer.branch_id)
          .gte("created_at", `${dateFrom}T00:00:00`)
          .lte("created_at", `${dateTo}T23:59:59`);

        const uniqueMembers = new Set(ptSubs?.map((sub) => sub.member_id) || []).size;
        const revenue = ptSubs?.reduce((sum, sub) => sum + Number(sub.total_fee || 0), 0) || 0;
        const sessions = ptSubs?.length || 0;
        const avgRevenuePerMember = uniqueMembers > 0 ? revenue / uniqueMembers : 0;

        metrics.push({
          trainerId: trainer.id,
          trainerName: trainer.name,
          branchId: trainer.branch_id || "",
          branchName: branch.name,
          members: uniqueMembers,
          revenue,
          sessions,
          avgRevenuePerMember,
          percentage: trainer.percentage_fee || 0,
        });
      }

      // Sort by revenue descending
      metrics.sort((a, b) => b.revenue - a.revenue);
      setTrainerMetrics(metrics);

      // Update selected trainers if needed
      if (selectedTrainers.length === 0 && metrics.length > 0) {
        // Auto-select top 5 trainers
        setSelectedTrainers(metrics.slice(0, 5).map((t) => t.trainerId));
      }
    } catch (error) {
      console.error("Error fetching trainer metrics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateTimeSeriesData = async (branchIds: string[]) => {
    try {
      const startDate = new Date(dateFrom);
      const endDate = new Date(dateTo);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Group by day if less than 30 days, otherwise by week
      const groupBy = days <= 30 ? "day" : "week";
      
      const timeSeries: TimeSeriesData[] = [];
      const branchData: Record<string, Record<string, number>> = {};

      // Initialize branch data structure
      branchIds.forEach((branchId) => {
        branchData[branchId] = {};
      });

      // Fetch payments grouped by date
      for (const branchId of branchIds) {
        const { data: payments } = await supabase
          .from("payments")
          .select("amount, created_at, status")
          .eq("branch_id", branchId)
          .eq("status", "success")
          .gte("created_at", `${dateFrom}T00:00:00`)
          .lte("created_at", `${dateTo}T23:59:59`)
          .order("created_at", { ascending: true });

        payments?.forEach((payment) => {
          const date = new Date(payment.created_at);
          const key =
            groupBy === "day"
              ? format(date, "MMM dd")
              : `Week ${format(date, "w")}`;
          
          if (!branchData[branchId][key]) {
            branchData[branchId][key] = 0;
          }
          branchData[branchId][key] += Number(payment.amount || 0);
        });
      }

      // Get all unique dates
      const allDates = new Set<string>();
      branchIds.forEach((branchId) => {
        Object.keys(branchData[branchId]).forEach((date) => allDates.add(date));
      });

      // Create time series data
      Array.from(allDates)
        .sort()
        .forEach((date) => {
          const dataPoint: TimeSeriesData = { date };
          branchIds.forEach((branchId) => {
            const branch = allBranches?.find((b) => b.id === branchId);
            if (branch) {
              dataPoint[branch.name] = branchData[branchId][date] || 0;
            }
          });
          timeSeries.push(dataPoint);
        });

      setTimeSeriesData(timeSeries);
    } catch (error) {
      console.error("Error generating time series data:", error);
    }
  };

  const handleBranchToggle = (branchId: string) => {
    setSelectedBranches((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    );
  };

  const handleTrainerToggle = (trainerId: string) => {
    setSelectedTrainers((prev) =>
      prev.includes(trainerId)
        ? prev.filter((id) => id !== trainerId)
        : [...prev, trainerId]
    );
  };

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString("en-IN")}`;
  };

  return (
    <div className="space-y-6">
      {/* Header with Date Range Picker */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Performance Insights</h2>
          <p className="text-sm text-muted-foreground">
            Compare branches and trainers across different time periods
          </p>
        </div>
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      </div>

      {/* Tabs for Branches and Trainers */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "branches" | "trainers")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="branches">
            <BuildingOffice2Icon className="w-4 h-4 mr-2" />
            Branch Comparison
          </TabsTrigger>
          <TabsTrigger value="trainers">
            <UserGroupIcon className="w-4 h-4 mr-2" />
            Trainer Comparison
          </TabsTrigger>
        </TabsList>

        {/* Branch Comparison Tab */}
        <TabsContent value="branches" className="space-y-6">
          {/* Branch Selector */}
          <Card>
            <CardHeader>
              <CardTitle>Select Branches</CardTitle>
              <CardDescription>Choose branches to compare</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {allBranches?.map((branch) => (
                  <Badge
                    key={branch.id}
                    variant={selectedBranches.includes(branch.id) ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1.5"
                    onClick={() => handleBranchToggle(branch.id)}
                  >
                    {branch.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Revenue</p>
                        <p className="text-2xl font-bold mt-1">
                          <AnimatedCounter
                            value={branchMetrics.reduce((sum, m) => sum + m.revenue, 0)}
                            prefix="₹"
                            duration={1200}
                            formatValue={(v) => v.toLocaleString("en-IN")}
                          />
                        </p>
                      </div>
                      <CurrencyRupeeIcon className="w-8 h-8 text-accent opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Members</p>
                        <p className="text-2xl font-bold mt-1">
                          <AnimatedCounter
                            value={branchMetrics.reduce((sum, m) => sum + m.members, 0)}
                            duration={1000}
                          />
                        </p>
                      </div>
                      <UserGroupIcon className="w-8 h-8 text-primary opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">New Members</p>
                        <p className="text-2xl font-bold mt-1">
                          <AnimatedCounter
                            value={branchMetrics.reduce((sum, m) => sum + m.newMembers, 0)}
                            duration={800}
                          />
                        </p>
                      </div>
                      <ArrowTrendingUpIcon className="w-8 h-8 text-success opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Net Profit</p>
                        <p className="text-2xl font-bold mt-1">
                          <AnimatedCounter
                            value={branchMetrics.reduce((sum, m) => sum + m.profit, 0)}
                            prefix="₹"
                            duration={1200}
                            formatValue={(v) => v.toLocaleString("en-IN")}
                          />
                        </p>
                      </div>
                      <ChartBarIcon className="w-8 h-8 text-warning opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Branch Comparison Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Branch Performance</CardTitle>
                  <CardDescription>Detailed metrics for each branch</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium">Branch</th>
                          <th className="text-right p-3 font-medium">Revenue</th>
                          <th className="text-right p-3 font-medium">Members</th>
                          <th className="text-right p-3 font-medium">Active</th>
                          <th className="text-right p-3 font-medium">New</th>
                          <th className="text-right p-3 font-medium">PT Subs</th>
                          <th className="text-right p-3 font-medium">Expenses</th>
                          <th className="text-right p-3 font-medium">Profit</th>
                          <th className="text-right p-3 font-medium">Avg/Member</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branchMetrics
                          .sort((a, b) => b.revenue - a.revenue)
                          .map((metric) => (
                            <tr key={metric.branchId} className="border-b hover:bg-muted/50">
                              <td className="p-3 font-medium">{metric.branchName}</td>
                              <td className="p-3 text-right">{formatCurrency(metric.revenue)}</td>
                              <td className="p-3 text-right">{metric.members}</td>
                              <td className="p-3 text-right">{metric.activeMembers}</td>
                              <td className="p-3 text-right">{metric.newMembers}</td>
                              <td className="p-3 text-right">{metric.ptSubscriptions}</td>
                              <td className="p-3 text-right text-red-600">
                                {formatCurrency(metric.expenses)}
                              </td>
                              <td
                                className={cn(
                                  "p-3 text-right font-medium",
                                  metric.profit >= 0 ? "text-green-600" : "text-red-600"
                                )}
                              >
                                {formatCurrency(metric.profit)}
                              </td>
                              <td className="p-3 text-right text-muted-foreground">
                                {formatCurrency(metric.avgRevenuePerMember)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Revenue Comparison Chart */}
              {timeSeriesData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue Trend Comparison</CardTitle>
                    <CardDescription>Revenue over time by branch</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        revenue: { label: "Revenue", color: "hsl(var(--accent))" },
                      }}
                      className="h-[400px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeSeriesData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis tickFormatter={(v) => `₹${v / 1000}k`} />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-popover p-3 rounded-md shadow-md border text-sm">
                                    {payload.map((entry, index) => (
                                      <p key={index} className="font-medium">
                                        {entry.name}: {formatCurrency(Number(entry.value || 0))}
                                      </p>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          {selectedBranches.map((branchId, index) => {
                            const branch = allBranches?.find((b) => b.id === branchId);
                            if (!branch) return null;
                            return (
                              <Line
                                key={branchId}
                                type="monotone"
                                dataKey={branch.name}
                                stroke={COLORS[index % COLORS.length]}
                                strokeWidth={2}
                                dot={{ r: 4 }}
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}

              {/* Revenue Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Distribution</CardTitle>
                  <CardDescription>Revenue share by branch</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      revenue: { label: "Revenue", color: "hsl(var(--accent))" },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={branchMetrics}>
                        <XAxis dataKey="branchName" />
                        <YAxis tickFormatter={(v) => `₹${v / 1000}k`} />
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload as BranchMetrics;
                              return (
                                <div className="bg-popover p-3 rounded-md shadow-md border text-sm">
                                  <p className="font-medium">{data.branchName}</p>
                                  <p>Revenue: {formatCurrency(data.revenue)}</p>
                                  <p>Members: {data.members}</p>
                                  <p>Profit: {formatCurrency(data.profit)}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Trainer Comparison Tab */}
        <TabsContent value="trainers" className="space-y-6">
          {/* Trainer Selector */}
          {trainerMetrics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Trainers</CardTitle>
                <CardDescription>Choose trainers to compare (showing top performers)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {trainerMetrics.map((trainer) => (
                    <Badge
                      key={trainer.trainerId}
                      variant={selectedTrainers.includes(trainer.trainerId) ? "default" : "outline"}
                      className="cursor-pointer px-3 py-1.5"
                      onClick={() => handleTrainerToggle(trainer.trainerId)}
                    >
                      {trainer.trainerName} ({trainer.branchName})
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Revenue</p>
                        <p className="text-2xl font-bold mt-1">
                          <AnimatedCounter
                            value={trainerMetrics.reduce((sum, t) => sum + t.revenue, 0)}
                            prefix="₹"
                            duration={1200}
                            formatValue={(v) => v.toLocaleString("en-IN")}
                          />
                        </p>
                      </div>
                      <CurrencyRupeeIcon className="w-8 h-8 text-accent opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Clients</p>
                        <p className="text-2xl font-bold mt-1">
                          <AnimatedCounter
                            value={trainerMetrics.reduce((sum, t) => sum + t.members, 0)}
                            duration={1000}
                          />
                        </p>
                      </div>
                      <UserGroupIcon className="w-8 h-8 text-primary opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Sessions</p>
                        <p className="text-2xl font-bold mt-1">
                          <AnimatedCounter
                            value={trainerMetrics.reduce((sum, t) => sum + t.sessions, 0)}
                            duration={800}
                          />
                        </p>
                      </div>
                      <ChartBarIcon className="w-8 h-8 text-success opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Revenue/Client</p>
                        <p className="text-2xl font-bold mt-1">
                          <AnimatedCounter
                            value={
                              trainerMetrics.length > 0
                                ? trainerMetrics.reduce((sum, t) => sum + t.avgRevenuePerMember, 0) /
                                  trainerMetrics.length
                                : 0
                            }
                            prefix="₹"
                            duration={1200}
                            formatValue={(v) => Math.round(v).toLocaleString("en-IN")}
                          />
                        </p>
                      </div>
                      <ArrowTrendingUpIcon className="w-8 h-8 text-warning opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Trainer Comparison Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Trainer Performance</CardTitle>
                  <CardDescription>Detailed metrics for each trainer</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium">Trainer</th>
                          <th className="text-left p-3 font-medium">Branch</th>
                          <th className="text-right p-3 font-medium">Revenue</th>
                          <th className="text-right p-3 font-medium">Clients</th>
                          <th className="text-right p-3 font-medium">Sessions</th>
                          <th className="text-right p-3 font-medium">Avg/Client</th>
                          <th className="text-right p-3 font-medium">Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trainerMetrics.map((metric) => (
                          <tr
                            key={metric.trainerId}
                            className={cn(
                              "border-b hover:bg-muted/50",
                              selectedTrainers.includes(metric.trainerId) && "bg-primary/5"
                            )}
                          >
                            <td className="p-3 font-medium">{metric.trainerName}</td>
                            <td className="p-3 text-muted-foreground">{metric.branchName}</td>
                            <td className="p-3 text-right font-medium">
                              {formatCurrency(metric.revenue)}
                            </td>
                            <td className="p-3 text-right">{metric.members}</td>
                            <td className="p-3 text-right">{metric.sessions}</td>
                            <td className="p-3 text-right text-muted-foreground">
                              {formatCurrency(metric.avgRevenuePerMember)}
                            </td>
                            <td className="p-3 text-right">{metric.percentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Trainer Revenue Comparison Chart */}
              {selectedTrainers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Trainer Revenue Comparison</CardTitle>
                    <CardDescription>Revenue by selected trainers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        revenue: { label: "Revenue", color: "hsl(var(--accent))" },
                      }}
                      className="h-[400px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={trainerMetrics
                            .filter((t) => selectedTrainers.includes(t.trainerId))
                            .sort((a, b) => b.revenue - a.revenue)}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="trainerName" angle={-45} textAnchor="end" height={100} />
                          <YAxis tickFormatter={(v) => `₹${v / 1000}k`} />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload as TrainerMetrics;
                                return (
                                  <div className="bg-popover p-3 rounded-md shadow-md border text-sm">
                                    <p className="font-medium">{data.trainerName}</p>
                                    <p>Branch: {data.branchName}</p>
                                    <p>Revenue: {formatCurrency(data.revenue)}</p>
                                    <p>Clients: {data.members}</p>
                                    <p>Sessions: {data.sessions}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
