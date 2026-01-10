import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dumbbell,
  Users,
  CreditCard,
  AlertTriangle,
  Search,
  Plus,
  LogOut,
  RefreshCw,
  TrendingUp,
  QrCode,
  History,
  Settings,
  BarChart3,
  Clock,
  MessageSquare,
} from "lucide-react";
import { MembersTable } from "@/components/admin/MembersTable";
import { PaymentHistory } from "@/components/admin/PaymentHistory";
import DailyPassTable from "@/components/admin/DailyPassTable";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { AddPaymentDialog } from "@/components/admin/AddPaymentDialog";
import { MemberFilter, type MemberFilterValue } from "@/components/admin/MemberFilter";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  expiringSoon: number;
  expiredMembers: number;
  inactiveMembers: number;
  monthlyRevenue: number;
  withPT: number;
  dailyPassUsers: number;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<DashboardStats>({
    totalMembers: 0,
    activeMembers: 0,
    expiringSoon: 0,
    expiredMembers: 0,
    inactiveMembers: 0,
    monthlyRevenue: 0,
    withPT: 0,
    dailyPassUsers: 0,
  });
  const [dailyPassSearchQuery, setDailyPassSearchQuery] = useState("");
  const [dailyPassFilter, setDailyPassFilter] = useState("all");
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("members");
  const [memberFilter, setMemberFilter] = useState<MemberFilterValue>("all");
  const [ptFilterActive, setPtFilterActive] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/admin/login");
        }
      }
    );

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
      fetchStats();
    }
  }, [user, refreshKey]);

  const fetchStats = async () => {
    try {
      // Refresh subscription statuses first
      await supabase.rpc("refresh_subscription_statuses");

      const { count: totalMembers } = await supabase
        .from("members")
        .select("*", { count: "exact", head: true });

      // Get all members with their latest subscription
      const { data: membersData } = await supabase
        .from("members")
        .select("id");

      // Get subscriptions for status calculations
      const { data: allSubscriptions } = await supabase
        .from("subscriptions")
        .select("member_id, status, end_date")
        .order("end_date", { ascending: false });

      // Group subscriptions by member (latest first)
      const memberSubscriptions = new Map<string, { status: string; end_date: string }>();
      if (allSubscriptions) {
        for (const sub of allSubscriptions) {
          if (!memberSubscriptions.has(sub.member_id)) {
            memberSubscriptions.set(sub.member_id, { status: sub.status || 'inactive', end_date: sub.end_date });
          }
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let activeCount = 0;
      let expiringSoonCount = 0;
      let expiredCount = 0;
      let inactiveCount = 0;

      // Calculate status based on actual dates
      if (membersData) {
        for (const member of membersData) {
          const sub = memberSubscriptions.get(member.id);
          
          if (!sub) {
            // No subscription at all - this should not count as inactive for display
            // since we only count members with explicit inactive status
            continue;
          }

          // If explicitly marked as inactive, count as inactive
          if (sub.status === "inactive") {
            inactiveCount++;
            continue;
          }

          // Calculate based on actual end_date
          const endDate = new Date(sub.end_date);
          endDate.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const isExpired = diffDays < 0;
          const isExpiringSoon = !isExpired && diffDays >= 0 && diffDays <= 7;

          if (isExpired) {
            expiredCount++;
          } else if (isExpiringSoon) {
            expiringSoonCount++;
          } else {
            activeCount++;
          }
        }
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: payments } = await supabase
        .from("payments")
        .select("amount")
        .eq("status", "success")
        .gte("created_at", startOfMonth.toISOString());

      const monthlyRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      // Get active PT subscriptions count
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: activePTData } = await supabase
        .from("pt_subscriptions")
        .select("member_id")
        .eq("status", "active")
        .gte("end_date", todayStr);

      const uniquePTMembers = new Set(activePTData?.map((pt) => pt.member_id) || []).size;

      // Get daily pass users count
      const { count: dailyPassCount } = await supabase
        .from("daily_pass_users")
        .select("*", { count: "exact", head: true });

      setStats({
        totalMembers: totalMembers || 0,
        activeMembers: activeCount,
        expiringSoon: expiringSoonCount,
        expiredMembers: expiredCount,
        inactiveMembers: inactiveCount,
        monthlyRevenue,
        withPT: uniquePTMembers,
        dailyPassUsers: dailyPassCount || 0,
      });
    } catch (error: unknown) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    toast({ title: "Data refreshed" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow overflow-hidden">
              <img
                src="/logo.jpg"
                alt="Icon"
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  Pro Plus Fitness
                </h1>
                <p className="text-xs text-muted-foreground">Admin Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/whatsapp-logs")}
                title="WhatsApp Logs"
              >
                <MessageSquare className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/analytics")}
                title="Analytics"
              >
                <BarChart3 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/settings")}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/qr-code")}
                title="QR Code"
              >
                <QrCode className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleRefresh}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6 max-w-7xl mx-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalMembers}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Members</p>
                </div>
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Users className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-success">{stats.activeMembers}</p>
                  <p className="text-xs text-muted-foreground mt-1">Active Members</p>
                </div>
                <div className="p-3 bg-success/10 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-warning">{stats.expiringSoon}</p>
                  <p className="text-xs text-muted-foreground mt-1">Expiring Soon</p>
                </div>
                <div className="p-3 bg-warning/10 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-accent">
                    ₹{stats.monthlyRevenue.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">This Month</p>
                </div>
                <div className="p-3 bg-accent/10 rounded-lg">
                  <CreditCard className="w-6 h-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Members & Payments */}
        <Card className="border shadow-sm">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="pb-4 border-b">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <TabsList className="bg-muted">
                    <TabsTrigger value="members" className="gap-2">
                      <Users className="w-4 h-4" />
                      Members
                    </TabsTrigger>
                    <TabsTrigger value="daily_pass" className="gap-2">
                      <Clock className="w-4 h-4" />
                      Daily Pass ({stats.dailyPassUsers})
                    </TabsTrigger>
                    <TabsTrigger value="payments" className="gap-2">
                      <History className="w-4 h-4" />
                      Payments
                    </TabsTrigger>
                  </TabsList>
                  {(activeTab === "members" || activeTab === "daily_pass") && (
                    <div className="relative flex-1 min-w-[250px] max-w-md group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors duration-200" />
                      <Input
                        placeholder="Search by name or phone..."
                        className="pl-10 h-10 bg-muted/50 border-transparent hover:bg-muted hover:border-border focus:bg-background focus:border-border"
                        value={activeTab === "members" ? searchQuery : dailyPassSearchQuery}
                        onChange={(e) => activeTab === "members" ? setSearchQuery(e.target.value) : setDailyPassSearchQuery(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsAddPaymentOpen(true)}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Cash Payment
                  </Button>
                  <Button variant="default" onClick={() => setIsAddMemberOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Member
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <TabsContent value="members" className="mt-0 space-y-6">
                <MemberFilter 
                  value={memberFilter} 
                  onChange={(value) => {
                    setMemberFilter(value);
                    // Detoggle PT filter when "All Members" is clicked
                    if (value === "all" && ptFilterActive) {
                      setPtFilterActive(false);
                    }
                  }}
                  counts={{
                    all: stats.totalMembers,
                    active: stats.activeMembers,
                    expiring_soon: stats.expiringSoon,
                    expired: stats.expiredMembers,
                    inactive: stats.inactiveMembers,
                    with_pt: stats.withPT,
                  }}
                  ptFilterActive={ptFilterActive}
                  onPtFilterChange={setPtFilterActive}
                />
                <MembersTable 
                  searchQuery={searchQuery} 
                  refreshKey={refreshKey} 
                  filterValue={memberFilter}
                  ptFilterActive={ptFilterActive}
                />
              </TabsContent>
              <TabsContent value="daily_pass" className="mt-0">
                <DailyPassTable 
                  searchQuery={dailyPassSearchQuery} 
                  refreshKey={refreshKey}
                  filterValue={dailyPassFilter}
                />
              </TabsContent>
              <TabsContent value="payments" className="mt-0">
                <PaymentHistory refreshKey={refreshKey} />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </main>

      <AddMemberDialog
        open={isAddMemberOpen}
        onOpenChange={setIsAddMemberOpen}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      <AddPaymentDialog
        open={isAddPaymentOpen}
        onOpenChange={setIsAddPaymentOpen}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
};

export default AdminDashboard;
