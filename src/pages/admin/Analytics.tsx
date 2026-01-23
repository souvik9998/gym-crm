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

  useEffect(() => {
    if (currentBranch?.id) {
      fetchAnalytics();
    }
  }, [currentBranch?.id]);

  const fetchAnalytics = async () => {
    if (!currentBranch?.id) return;
    
    try {
      const { data: payments } = await supabase
        .from("payments")
        .select("amount, created_at, status")
        .eq("branch_id", currentBranch.id)
        .eq("status", "success")
        .order("created_at", { ascending: true });

      const monthlyData: Record<string, { revenue: number; payments: number }> = {};
      const last6Months: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const key = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
        monthlyData[key] = { revenue: 0, payments: 0 };
        last6Months.push(key);
      }

      payments?.forEach((payment) => {
        const date = new Date(payment.created_at);
        const key = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
        if (monthlyData[key]) {
          monthlyData[key].revenue += Number(payment.amount);
          monthlyData[key].payments += 1;
        }
      });

      setRevenueData(
        last6Months.map((month) => ({
          month,
          revenue: monthlyData[month]?.revenue || 0,
          payments: monthlyData[month]?.payments || 0,
        }))
      );

      const { data: members } = await supabase
        .from("members")
        .select("created_at")
        .eq("branch_id", currentBranch.id)
        .order("created_at", { ascending: true });

      const memberMonthly: Record<string, number> = {};
      last6Months.forEach((m) => (memberMonthly[m] = 0));

      members?.forEach((member) => {
        const date = new Date(member.created_at);
        const key = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
        if (memberMonthly[key] !== undefined) {
          memberMonthly[key] += 1;
        }
      });

      let cumulative = members?.filter((m) => {
        const date = new Date(m.created_at);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        return date < sixMonthsAgo;
      }).length || 0;

      setMemberGrowth(
        last6Months.map((month) => {
          cumulative += memberMonthly[month] || 0;
          return {
            month,
            members: cumulative,
            newMembers: memberMonthly[month] || 0,
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

      setTotals({
        totalRevenue,
        totalMembers: totalMembers || 0,
        activeMembers: activeMembers || 0,
        avgRevenue: totalRevenue / 6,
      });

      // Fetch trainer stats
      const { data: trainers } = await supabase
        .from("personal_trainers")
        .select("id, name")
        .eq("branch_id", currentBranch.id)
        .eq("is_active", true);

      const { data: ptSubscriptions } = await supabase
        .from("pt_subscriptions")
        .select("personal_trainer_id, member_id, total_fee, created_at, status")
        .eq("branch_id", currentBranch.id);

      if (trainers && ptSubscriptions) {
        const trainerStatsData: TrainerStats[] = trainers.map((trainer) => {
          const trainerSubs = ptSubscriptions.filter(
            (sub) => sub.personal_trainer_id === trainer.id
          );
          const uniqueMembers = new Set(trainerSubs.map((sub) => sub.member_id)).size;
          const trainerRevenue = trainerSubs.reduce((sum, sub) => sum + Number(sub.total_fee || 0), 0);

          // Calculate monthly revenue for this trainer
          const trainerMonthlyRevenue: Record<string, number> = {};
          last6Months.forEach((m) => (trainerMonthlyRevenue[m] = 0));

          trainerSubs.forEach((sub) => {
            const date = new Date(sub.created_at);
            const key = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
            if (trainerMonthlyRevenue[key] !== undefined) {
              trainerMonthlyRevenue[key] += Number(sub.total_fee || 0);
            }
          });

          return {
            id: trainer.id,
            name: trainer.name,
            members: uniqueMembers,
            revenue: trainerRevenue,
            monthlyRevenue: last6Months.map((month) => ({
              month,
              revenue: trainerMonthlyRevenue[month] || 0,
              payments: 0,
            })),
          };
        });

        setTrainerStats(trainerStatsData.filter((t) => t.members > 0 || t.revenue > 0));
      }

      // Fetch package sales data
      const { data: monthlyPackages } = await supabase
        .from("monthly_packages")
        .select("id, months, price")
        .eq("branch_id", currentBranch.id)
        .eq("is_active", true)
        .order("months", { ascending: true });

      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("plan_months, created_at, is_custom_package")
        .eq("branch_id", currentBranch.id);

      if (monthlyPackages && subscriptions) {
        const packages: PackageInfo[] = monthlyPackages.map((pkg) => ({
          id: pkg.id,
          label: `${pkg.months} Month${pkg.months > 1 ? "s" : ""}`,
          months: pkg.months,
        }));
        setPackageList(packages);

        // Initialize package sales data structure
        const packageSales: Record<string, Record<number, number>> = {};
        last6Months.forEach((month) => {
          packageSales[month] = {};
          packages.forEach((pkg) => {
            packageSales[month][pkg.months] = 0;
          });
        });

        // Count subscriptions per package per month
        subscriptions
          .filter((sub) => !sub.is_custom_package)
          .forEach((sub) => {
            const date = new Date(sub.created_at);
            const key = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
            if (packageSales[key] && packageSales[key][sub.plan_months] !== undefined) {
              packageSales[key][sub.plan_months] += 1;
            }
          });

        // Transform to chart data format
        const salesData: PackageSalesData[] = last6Months.map((month) => {
          const dataPoint: PackageSalesData = { month };
          packages.forEach((pkg) => {
            dataPoint[pkg.label] = packageSales[month][pkg.months] || 0;
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
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-primary">
                    <AnimatedCounter value={totals.totalMembers} duration={1000} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Total Members</p>
                </div>
                <div className="p-3 bg-primary/10 rounded-xl">
                  <UsersIcon className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-success">
                    <AnimatedCounter value={totals.activeMembers} duration={800} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Active Members</p>
                </div>
                <div className="p-3 bg-success/10 rounded-xl">
                  <CalendarIcon className="w-6 h-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-warning">
                    <AnimatedCounter 
                      value={Math.round(totals.avgRevenue)} 
                      prefix="₹" 
                      duration={1000}
                      formatValue={(v) => v.toLocaleString("en-IN")}
                    />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Avg Monthly</p>
                </div>
                <div className="p-3 bg-warning/10 rounded-xl">
                  <CurrencyRupeeIcon className="w-6 h-6 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
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
