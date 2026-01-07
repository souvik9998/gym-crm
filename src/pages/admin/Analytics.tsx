import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Users,
  IndianRupee,
  Dumbbell,
  Calendar,
} from "lucide-react";
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
import type { User as SupabaseUser } from "@supabase/supabase-js";

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
  [key: string]: number | string; // Dynamic keys for package names
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
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/admin/login");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/admin/login");
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user]);

  const fetchAnalytics = async () => {
    try {
      // Fetch payments for revenue analysis
      const { data: payments } = await supabase
        .from("payments")
        .select("amount, created_at, status")
        .eq("status", "success")
        .order("created_at", { ascending: true });

      // Process monthly revenue
      const monthlyData: Record<string, { revenue: number; payments: number }> = {};
      const last6Months = [];
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

      // Fetch member growth
      const { data: members } = await supabase
        .from("members")
        .select("created_at")
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

      // Fetch trainer stats from pt_subscriptions
      const { data: trainers } = await supabase
        .from("personal_trainers")
        .select("id, name")
        .eq("is_active", true);

      const { data: ptSubs } = await supabase
        .from("pt_subscriptions")
        .select("personal_trainer_id, member_id, total_fee, created_at")
        .eq("status", "active");

      const trainerData: Record<string, { 
        name: string; 
        id: string;
        members: Set<string>; 
        revenue: number;
        payments: Array<{ amount: number; month: string }>;
      }> = {};
      
      trainers?.forEach((t) => {
        trainerData[t.id] = { 
          name: t.name, 
          id: t.id,
          members: new Set(), 
          revenue: 0,
          payments: []
        };
      });

      // Process PT subscriptions
      ptSubs?.forEach((ptSub) => {
        if (ptSub.personal_trainer_id && trainerData[ptSub.personal_trainer_id]) {
          trainerData[ptSub.personal_trainer_id].members.add(ptSub.member_id);
          trainerData[ptSub.personal_trainer_id].revenue += Number(ptSub.total_fee) || 0;
          
          // Track monthly revenue
          const date = new Date(ptSub.created_at);
          const monthKey = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
          trainerData[ptSub.personal_trainer_id].payments.push({
            amount: Number(ptSub.total_fee) || 0,
            month: monthKey
          });
        }
      });

      // Convert to array and calculate monthly revenue for each trainer
      const trainerStatsArray = Object.values(trainerData)
        .filter((t) => t.members.size > 0)
        .map((t) => {
          // Calculate monthly revenue for last 6 months
          const monthlyRevenueMap: Record<string, number> = {};
          last6Months.forEach((month) => {
            monthlyRevenueMap[month] = 0;
          });

          t.payments.forEach((payment) => {
            if (monthlyRevenueMap[payment.month] !== undefined) {
              monthlyRevenueMap[payment.month] += payment.amount;
            }
          });

          const monthlyRevenue = last6Months.map((month) => ({
            month,
            revenue: monthlyRevenueMap[month] || 0,
            payments: 0, // Not tracking payment count for trainers
          }));

          return {
            name: t.name,
            id: t.id,
            members: t.members.size,
            revenue: t.revenue,
            monthlyRevenue,
          };
        });

      setTrainerStats(trainerStatsArray);

      // Fetch package sales analytics
      const { data: monthlyPackages } = await supabase
        .from("monthly_packages")
        .select("id, months")
        .eq("is_active", true)
        .order("months");

      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("plan_months, created_at, is_custom_package")
        .order("created_at", { ascending: true });

      // Build package info list
      const pkgInfoList: PackageInfo[] = (monthlyPackages || []).map((p) => ({
        id: p.id,
        label: `${p.months} ${p.months === 1 ? "Month" : "Months"}`,
        months: p.months,
      }));
      setPackageList(pkgInfoList);

      // Process package sales by month
      const packageSalesMap: Record<string, Record<string, number>> = {};
      last6Months.forEach((month) => {
        packageSalesMap[month] = {};
        pkgInfoList.forEach((pkg) => {
          packageSalesMap[month][pkg.label] = 0;
        });
      });

      subscriptions?.forEach((sub) => {
        if (sub.is_custom_package) return; // Skip custom packages
        const date = new Date(sub.created_at);
        const monthKey = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
        const pkgInfo = pkgInfoList.find((p) => p.months === sub.plan_months);
        if (packageSalesMap[monthKey] && pkgInfo) {
          packageSalesMap[monthKey][pkgInfo.label] = (packageSalesMap[monthKey][pkgInfo.label] || 0) + 1;
        }
      });

      const packageSalesArray = last6Months.map((month) => ({
        month,
        ...packageSalesMap[month],
      }));
      setPackageSalesData(packageSalesArray);

      // Calculate totals
      const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const { count: totalMembers } = await supabase
        .from("members")
        .select("*", { count: "exact", head: true });
      const { count: activeMembers } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");

      setTotals({
        totalRevenue,
        totalMembers: totalMembers || 0,
        activeMembers: activeMembers || 0,
        avgRevenue: revenueData.length > 0 ? totalRevenue / 6 : 0,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const chartConfig = {
    revenue: { label: "Revenue", color: "hsl(var(--accent))" },
    members: { label: "Members", color: "hsl(var(--primary))" },
    newMembers: { label: "New Members", color: "hsl(var(--success))" },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/10 rounded-lg">
                <BarChart3 className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Reports & Analytics</h1>
                <p className="text-xs text-muted-foreground">Business insights and trends</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-6xl mx-auto space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-accent flex items-center gap-1">
                    <IndianRupee className="w-5 h-5" />
                    {totals.totalRevenue.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Total Revenue</p>
                </div>
                <div className="p-3 bg-accent/10 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-primary">{totals.totalMembers}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Members</p>
                </div>
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Users className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-success">{totals.activeMembers}</p>
                  <p className="text-xs text-muted-foreground mt-1">Active Members</p>
                </div>
                <div className="p-3 bg-success/10 rounded-lg">
                  <Calendar className="w-6 h-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-warning">{trainerStats.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Active Trainers</p>
                </div>
                <div className="p-3 bg-warning/10 rounded-lg">
                  <Dumbbell className="w-6 h-6 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="w-5 h-5 text-accent" />
              Monthly Revenue
            </CardTitle>
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

        {/* Member Growth Charts - Side by Side */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Member Growth
              </CardTitle>
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-success" />
                New Members per Month
              </CardTitle>
              <CardDescription>New member registrations</CardDescription>
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

        {/* Package Sales Analytics */}
        {packageSalesData.length > 0 && packageList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-accent" />
                Package Sales by Month
              </CardTitle>
              <CardDescription>Monthly breakdown of membership packages sold</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={packageSalesData}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {packageList.map((pkg, index) => (
                      <Bar 
                        key={pkg.id} 
                        dataKey={pkg.label} 
                        fill={PACKAGE_COLORS[index % PACKAGE_COLORS.length]} 
                        radius={[4, 4, 0, 0]}
                        stackId="packages"
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
              <div className="flex flex-wrap gap-3 mt-4 justify-center">
                {packageList.map((pkg, index) => (
                  <div key={pkg.id} className="flex items-center gap-2 text-sm">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: PACKAGE_COLORS[index % PACKAGE_COLORS.length] }} 
                    />
                    <span className="text-muted-foreground">{pkg.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {trainerStats.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Dumbbell className="w-5 h-5 text-warning" />
                  Trainer Performance
                </CardTitle>
                <CardDescription>Members trained by each trainer</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <ChartContainer config={chartConfig} className="h-[250px] w-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={trainerStats}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="members"
                        nameKey="name"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {trainerStats.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IndianRupee className="w-5 h-5 text-accent" />
                  Trainer Revenue
                </CardTitle>
                <CardDescription>Revenue generated by trainers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {trainerStats.map((trainer, index) => (
                    <div key={trainer.id} className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: COLORS[index % COLORS.length] + "20" }}
                          >
                            <Dumbbell className="w-5 h-5" style={{ color: COLORS[index % COLORS.length] }} />
                          </div>
                          <div>
                            <p className="font-medium">{trainer.name}</p>
                            <p className="text-sm text-muted-foreground">{trainer.members} members</p>
                          </div>
                        </div>
                        <p className="font-semibold text-accent flex items-center gap-1">
                          <IndianRupee className="w-4 h-4" />
                          {trainer.revenue.toLocaleString("en-IN")}
                        </p>
                      </div>
                      {/* Monthly Revenue Chart for this trainer */}
                      <div className="pl-2 border-l-2" style={{ borderColor: COLORS[index % COLORS.length] }}>
                        <p className="text-xs text-muted-foreground mb-2">Monthly Revenue</p>
                        <ChartContainer config={chartConfig} className="h-[120px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={trainer.monthlyRevenue}>
                              <XAxis 
                                dataKey="month" 
                                tickLine={false} 
                                axisLine={false}
                                tick={{ fontSize: 10 }}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                              />
                              <YAxis 
                                tickLine={false} 
                                axisLine={false}
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => `₹${v / 1000}k`}
                              />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <Bar 
                                dataKey="revenue" 
                                fill={COLORS[index % COLORS.length]} 
                                radius={[2, 2, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Dumbbell className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No trainer data available yet</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default AdminAnalytics;