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
  members: number;
  revenue: number;
}

const COLORS = ["hsl(var(--accent))", "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))"];

const AdminAnalytics = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<MonthlyRevenue[]>([]);
  const [memberGrowth, setMemberGrowth] = useState<MemberGrowth[]>([]);
  const [trainerStats, setTrainerStats] = useState<TrainerStats[]>([]);
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

      // Fetch trainer stats
      const { data: trainers } = await supabase
        .from("personal_trainers")
        .select("id, name");

      const { data: subs } = await supabase
        .from("subscriptions")
        .select("personal_trainer_id, trainer_fee")
        .not("personal_trainer_id", "is", null);

      const trainerData: Record<string, { name: string; members: number; revenue: number }> = {};
      trainers?.forEach((t) => {
        trainerData[t.id] = { name: t.name, members: 0, revenue: 0 };
      });

      subs?.forEach((sub) => {
        if (sub.personal_trainer_id && trainerData[sub.personal_trainer_id]) {
          trainerData[sub.personal_trainer_id].members += 1;
          trainerData[sub.personal_trainer_id].revenue += Number(sub.trainer_fee) || 0;
        }
      });

      setTrainerStats(Object.values(trainerData).filter((t) => t.members > 0));

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

        {/* Trainer Performance */}
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
                    <div key={trainer.name} className="flex items-center justify-between p-4 bg-muted rounded-lg">
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