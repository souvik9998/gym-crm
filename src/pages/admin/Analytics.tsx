import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const { data: payments } = await supabase
        .from("payments")
        .select("amount, created_at, status")
        .eq("status", "success")
        .order("created_at", { ascending: true });

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
        avgRevenue: totalRevenue / 6,
      });
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover-lift border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-accent">
                    ₹{totals.totalRevenue.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Total Revenue</p>
                </div>
                <div className="p-3 bg-accent/10 rounded-xl">
                  <ArrowTrendingUpIcon className="w-6 h-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-primary">{totals.totalMembers}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Members</p>
                </div>
                <div className="p-3 bg-primary/10 rounded-xl">
                  <UsersIcon className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-success">{totals.activeMembers}</p>
                  <p className="text-xs text-muted-foreground mt-1">Active Members</p>
                </div>
                <div className="p-3 bg-success/10 rounded-xl">
                  <CalendarIcon className="w-6 h-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-warning">
                    ₹{Math.round(totals.avgRevenue).toLocaleString("en-IN")}
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
        <div className="grid md:grid-cols-2 gap-6">
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
      </div>
    </AdminLayout>
  );
};

export default AdminAnalytics;
