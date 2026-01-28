import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowTrendingUpIcon,
  UsersIcon,
  CurrencyRupeeIcon,
  CalendarIcon,
} from "@heroicons/react/24/outline";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { PeriodSelector, PeriodType, getPeriodDates } from "@/components/admin/PeriodSelector";
import { format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, differenceInDays, parseISO } from "date-fns";

interface MonthlyRevenue {
  month: string;
  revenue: number;
  payments: number;
}

interface MemberGrowth {
  month: string;
  members: number;
  newMembers: number;
}

interface TrainerStats {
  name: string;
  id: string;
  members: number;
  revenue: number;
  monthlyRevenue: MonthlyRevenue[];
}

interface PackageSalesData {
  month: string;
  [key: string]: number | string;
}

interface PackageInfo {
  id: string;
  label: string;
  months: number;
}

const COLORS = ["hsl(var(--accent))", "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))"];

const PACKAGE_COLORS = [
  "hsl(var(--accent))",
  "hsl(var(--primary))", 
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(142, 76%, 36%)",
  "hsl(262, 83%, 58%)",
];

const AdminAnalytics = () => {
  const { currentBranch } = useBranch();
  const [period, setPeriod] = useState<PeriodType>("this_month");
  const [customDateFrom, setCustomDateFrom] = useState<string>("");
  const [customDateTo, setCustomDateTo] = useState<string>("");
  const [revenueData, setRevenueData] = useState<MonthlyRevenue[]>([]);
  const [memberGrowth, setMemberGrowth] = useState<MemberGrowth[]>([]);
  const [trainerStats, setTrainerStats] = useState<TrainerStats[]>([]);
  const [packageSalesData, setPackageSalesData] = useState<PackageSalesData[]>([]);
  const [packageList, setPackageList] = useState<PackageInfo[]>([]);
  const [totals, setTotals] = useState({
    totalRevenue: 0,
    totalMembers: 0,
    activeMembers: 0,
    avgRevenue: 0,
  });

  const { from: dateFromStr, to: dateToStr } = getPeriodDates(period, customDateFrom, customDateTo);
  const dateFrom = parseISO(dateFromStr);
  const dateTo = parseISO(dateToStr);

  useEffect(() => {
    if (currentBranch?.id) {
      fetchAnalytics();
    }
  }, [currentBranch?.id, dateFromStr, dateToStr]);

  const getTimeIntervals = () => {
    const daysDiff = differenceInDays(dateTo, dateFrom);
    
    if (daysDiff <= 14) {
      // Daily intervals for up to 2 weeks
      return eachDayOfInterval({ start: dateFrom, end: dateTo }).map(date => ({
        date,
        label: format(date, "dd MMM"),
        key: format(date, "yyyy-MM-dd")
      }));
    } else if (daysDiff <= 90) {
      // Weekly intervals for up to 3 months
      return eachWeekOfInterval({ start: dateFrom, end: dateTo }).map(date => ({
        date,
        label: format(date, "dd MMM"),
        key: format(date, "yyyy-'W'ww")
      }));
    } else {
      // Monthly intervals for longer periods
      return eachMonthOfInterval({ start: dateFrom, end: dateTo }).map(date => ({
        date,
        label: format(date, "MMM yy"),
        key: format(date, "yyyy-MM")
      }));
    }
  };

  const handleCustomDateChange = (from: string, to: string) => {
    setCustomDateFrom(from);
    setCustomDateTo(to);
  };

  const fetchAnalytics = async () => {
    if (!currentBranch?.id) return;
    
    try {
      const intervals = getTimeIntervals();
      const daysDiff = differenceInDays(dateTo, dateFrom);

      const { data: payments } = await supabase
        .from("payments")
        .select("amount, created_at, status")
        .eq("branch_id", currentBranch.id)
        .eq("status", "success")
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString())
        .order("created_at", { ascending: true });

      // Build revenue data based on intervals
      const revenueByInterval: Record<string, { revenue: number; payments: number }> = {};
      intervals.forEach(interval => {
        revenueByInterval[interval.label] = { revenue: 0, payments: 0 };
      });

      payments?.forEach((payment) => {
        const date = new Date(payment.created_at);
        let label: string;
        
        if (daysDiff <= 14) {
          label = format(date, "dd MMM");
        } else if (daysDiff <= 90) {
          const weekStart = eachWeekOfInterval({ start: dateFrom, end: dateTo })
            .find((w, i, arr) => {
              const nextWeek = arr[i + 1];
              return date >= w && (!nextWeek || date < nextWeek);
            });
          label = weekStart ? format(weekStart, "dd MMM") : format(date, "dd MMM");
        } else {
          label = format(date, "MMM yy");
        }
        
        if (revenueByInterval[label]) {
          revenueByInterval[label].revenue += Number(payment.amount);
          revenueByInterval[label].payments += 1;
        }
      });

      setRevenueData(
        intervals.map((interval) => ({
          month: interval.label,
          revenue: revenueByInterval[interval.label]?.revenue || 0,
          payments: revenueByInterval[interval.label]?.payments || 0,
        }))
      );

      // Fetch members within date range
      const { data: members } = await supabase
        .from("members")
        .select("created_at")
        .eq("branch_id", currentBranch.id)
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString())
        .order("created_at", { ascending: true });

      // Count members before the period for cumulative calculation
      const { count: membersBefore } = await supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", currentBranch.id)
        .lt("created_at", dateFrom.toISOString());

      const membersByInterval: Record<string, number> = {};
      intervals.forEach((interval) => (membersByInterval[interval.label] = 0));

      members?.forEach((member) => {
        const date = new Date(member.created_at);
        let label: string;
        
        if (daysDiff <= 14) {
          label = format(date, "dd MMM");
        } else if (daysDiff <= 90) {
          const weekStart = eachWeekOfInterval({ start: dateFrom, end: dateTo })
            .find((w, i, arr) => {
              const nextWeek = arr[i + 1];
              return date >= w && (!nextWeek || date < nextWeek);
            });
          label = weekStart ? format(weekStart, "dd MMM") : format(date, "dd MMM");
        } else {
          label = format(date, "MMM yy");
        }
        
        if (membersByInterval[label] !== undefined) {
          membersByInterval[label] += 1;
        }
      });

      let cumulative = membersBefore || 0;

      setMemberGrowth(
        intervals.map((interval) => {
          cumulative += membersByInterval[interval.label] || 0;
          return {
            month: interval.label,
            members: cumulative,
            newMembers: membersByInterval[interval.label] || 0,
          };
        })
      );

      const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const { count: totalMembers } = await supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", currentBranch.id);
      const { count: activeMembers } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", currentBranch.id)
        .eq("status", "active");

      const periodDays = Math.max(1, daysDiff);
      const avgDailyRevenue = totalRevenue / periodDays;

      setTotals({
        totalRevenue,
        totalMembers: totalMembers || 0,
        activeMembers: activeMembers || 0,
        avgRevenue: avgDailyRevenue * 30, // Monthly average
      });

      // Fetch trainer stats within date range
      const { data: trainers } = await supabase
        .from("personal_trainers")
        .select("id, name")
        .eq("branch_id", currentBranch.id)
        .eq("is_active", true);

      const { data: ptSubscriptions } = await supabase
        .from("pt_subscriptions")
        .select("personal_trainer_id, member_id, total_fee, created_at, status")
        .eq("branch_id", currentBranch.id)
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString());

      if (trainers && ptSubscriptions) {
        const trainerStatsData: TrainerStats[] = trainers.map((trainer) => {
          const trainerSubs = ptSubscriptions.filter(
            (sub) => sub.personal_trainer_id === trainer.id
          );
          const uniqueMembers = new Set(trainerSubs.map((sub) => sub.member_id)).size;
          const trainerRevenue = trainerSubs.reduce((sum, sub) => sum + Number(sub.total_fee || 0), 0);

          // Calculate interval-based revenue for this trainer
          const trainerIntervalRevenue: Record<string, number> = {};
          intervals.forEach((interval) => (trainerIntervalRevenue[interval.label] = 0));

          trainerSubs.forEach((sub) => {
            const date = new Date(sub.created_at);
            let label: string;
            
            if (daysDiff <= 14) {
              label = format(date, "dd MMM");
            } else if (daysDiff <= 90) {
              const weekStart = eachWeekOfInterval({ start: dateFrom, end: dateTo })
                .find((w, i, arr) => {
                  const nextWeek = arr[i + 1];
                  return date >= w && (!nextWeek || date < nextWeek);
                });
              label = weekStart ? format(weekStart, "dd MMM") : format(date, "dd MMM");
            } else {
              label = format(date, "MMM yy");
            }
            
            if (trainerIntervalRevenue[label] !== undefined) {
              trainerIntervalRevenue[label] += Number(sub.total_fee || 0);
            }
          });

          return {
            id: trainer.id,
            name: trainer.name,
            members: uniqueMembers,
            revenue: trainerRevenue,
            monthlyRevenue: intervals.map((interval) => ({
              month: interval.label,
              revenue: trainerIntervalRevenue[interval.label] || 0,
              payments: 0,
            })),
          };
        });

        setTrainerStats(trainerStatsData.filter((t) => t.members > 0 || t.revenue > 0));
      }

      // Fetch package sales data within date range
      const { data: monthlyPackages } = await supabase
        .from("monthly_packages")
        .select("id, months, price")
        .eq("branch_id", currentBranch.id)
        .eq("is_active", true)
        .order("months", { ascending: true });

      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("plan_months, created_at, is_custom_package")
        .eq("branch_id", currentBranch.id)
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString());

      if (monthlyPackages && subscriptions) {
        const packages: PackageInfo[] = monthlyPackages.map((pkg) => ({
          id: pkg.id,
          label: `${pkg.months} Month${pkg.months > 1 ? "s" : ""}`,
          months: pkg.months,
        }));
        setPackageList(packages);

        // Initialize package sales data structure
        const packageSales: Record<string, Record<number, number>> = {};
        intervals.forEach((interval) => {
          packageSales[interval.label] = {};
          packages.forEach((pkg) => {
            packageSales[interval.label][pkg.months] = 0;
          });
        });

        // Count subscriptions per package per interval
        subscriptions
          .filter((sub) => !sub.is_custom_package)
          .forEach((sub) => {
            const date = new Date(sub.created_at);
            let label: string;
            
            if (daysDiff <= 14) {
              label = format(date, "dd MMM");
            } else if (daysDiff <= 90) {
              const weekStart = eachWeekOfInterval({ start: dateFrom, end: dateTo })
                .find((w, i, arr) => {
                  const nextWeek = arr[i + 1];
                  return date >= w && (!nextWeek || date < nextWeek);
                });
              label = weekStart ? format(weekStart, "dd MMM") : format(date, "dd MMM");
            } else {
              label = format(date, "MMM yy");
            }
            
            if (packageSales[label] && packageSales[label][sub.plan_months] !== undefined) {
              packageSales[label][sub.plan_months] += 1;
            }
          });

        // Transform to chart data format
        const salesData: PackageSalesData[] = intervals.map((interval) => {
          const dataPoint: PackageSalesData = { month: interval.label };
          packages.forEach((pkg) => {
            dataPoint[pkg.label] = packageSales[interval.label][pkg.months] || 0;
          });
          return dataPoint;
        });

        setPackageSalesData(salesData);
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
    }
  };

  const chartConfig = {
    revenue: { label: "Revenue", color: "hsl(var(--accent))" },
    members: { label: "Members", color: "hsl(var(--primary))" },
    newMembers: { label: "New Members", color: "hsl(var(--success))" },
  };

  return (
    <AdminLayout title="Analytics" subtitle="Business insights and trends">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="hover-lift border-0 shadow-sm overflow-hidden">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-bold text-accent truncate">
                    <AnimatedCounter 
                      value={totals.totalRevenue} 
                      prefix="₹" 
                      duration={1200}
                      formatValue={(v) => v.toLocaleString("en-IN")}
                    />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Total Revenue</p>
                </div>
                <div className="p-2 sm:p-3 bg-accent/10 rounded-xl flex-shrink-0 ml-2">
                  <ArrowTrendingUpIcon className="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm overflow-hidden">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-bold text-primary truncate">
                    <AnimatedCounter value={totals.totalMembers} duration={1000} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Total Members</p>
                </div>
                <div className="p-2 sm:p-3 bg-primary/10 rounded-xl flex-shrink-0 ml-2">
                  <UsersIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm overflow-hidden">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-bold text-success truncate">
                    <AnimatedCounter value={totals.activeMembers} duration={800} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Active Members</p>
                </div>
                <div className="p-2 sm:p-3 bg-success/10 rounded-xl flex-shrink-0 ml-2">
                  <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm overflow-hidden">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-bold text-warning truncate">
                    <AnimatedCounter 
                      value={Math.round(totals.avgRevenue)} 
                      prefix="₹" 
                      duration={1000}
                      formatValue={(v) => v.toLocaleString("en-IN")}
                    />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Avg Monthly</p>
                </div>
                <div className="p-2 sm:p-3 bg-warning/10 rounded-xl flex-shrink-0 ml-2">
                  <CurrencyRupeeIcon className="w-5 h-5 sm:w-6 sm:h-6 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Period Selector - Compact */}
        <div className="flex justify-start">
          <PeriodSelector
            period={period}
            onPeriodChange={setPeriod}
            customDateFrom={customDateFrom}
            customDateTo={customDateTo}
            onCustomDateChange={handleCustomDateChange}
            compact
          />
        </div>

        {/* Revenue Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
            <CardDescription>Revenue trend over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Member Growth */}
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Member Growth</CardTitle>
              <CardDescription>Total members over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={memberGrowth}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="members" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>New Members</CardTitle>
              <CardDescription>New registrations per month</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={memberGrowth}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="newMembers" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Trainer Performance */}
        {trainerStats.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Trainer Performance</CardTitle>
              <CardDescription>Revenue and client distribution by trainer</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Trainer Revenue Pie Chart */}
                <div>
                  <h4 className="text-sm font-medium mb-4 text-center">Revenue Distribution</h4>
                  <ChartContainer config={chartConfig} className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={trainerStats}
                          dataKey="revenue"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {trainerStats.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload as TrainerStats;
                              return (
                                <div className="bg-popover p-2 rounded-md shadow-md border text-sm">
                                  <p className="font-medium">{data.name}</p>
                                  <p>Revenue: ₹{data.revenue.toLocaleString("en-IN")}</p>
                                  <p>Clients: {data.members}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>

                {/* Trainer Members Bar Chart */}
                <div>
                  <h4 className="text-sm font-medium mb-4 text-center">Client Count</h4>
                  <ChartContainer config={chartConfig} className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trainerStats} layout="vertical">
                        <XAxis type="number" tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={80} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="members" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Package Sales */}
        {packageList.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Package Sales Distribution</CardTitle>
              <CardDescription>Monthly subscription sales by package type</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={packageSalesData}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {packageList.map((pkg, index) => (
                      <Bar
                        key={pkg.id}
                        dataKey={pkg.label}
                        stackId="packages"
                        fill={PACKAGE_COLORS[index % PACKAGE_COLORS.length]}
                        radius={index === packageList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
              <div className="flex flex-wrap gap-4 mt-4 justify-center">
                {packageList.map((pkg, index) => (
                  <div key={pkg.id} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: PACKAGE_COLORS[index % PACKAGE_COLORS.length] }}
                    />
                    <span className="text-sm text-muted-foreground">{pkg.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAnalytics;
