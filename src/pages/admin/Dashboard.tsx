import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { MembersTable } from "@/components/admin/MembersTable";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { AddPaymentDialog } from "@/components/admin/AddPaymentDialog";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  expiringSoon: number;
  monthlyRevenue: number;
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
    monthlyRevenue: 0,
  });
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/admin/login");
        }
      }
    );

    // THEN check for existing session
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
      // Get total members
      const { count: totalMembers } = await supabase
        .from("members")
        .select("*", { count: "exact", head: true });

      // Get active subscriptions
      const { count: activeMembers } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");

      // Get expiring soon
      const { count: expiringSoon } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "expiring_soon");

      // Get monthly revenue
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: payments } = await supabase
        .from("payments")
        .select("amount")
        .eq("status", "success")
        .gte("created_at", startOfMonth.toISOString());

      const monthlyRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      setStats({
        totalMembers: totalMembers || 0,
        activeMembers: activeMembers || 0,
        expiringSoon: expiringSoon || 0,
        monthlyRevenue,
      });
    } catch (error: any) {
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
      <header className="sticky top-0 z-50 bg-primary shadow-lg">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent rounded-lg">
                <Dumbbell className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <h1 className="font-display text-lg font-bold text-primary-foreground">
                  Pro Plus Fitness
                </h1>
                <p className="text-xs text-primary-foreground/70">Admin Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                onClick={handleRefresh}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{stats.totalMembers}</p>
                  <p className="text-xs text-muted-foreground">Total Members</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-success/10 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{stats.activeMembers}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-warning/10 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{stats.expiringSoon}</p>
                  <p className="text-xs text-muted-foreground">Expiring Soon</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/10 rounded-lg">
                  <CreditCard className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">
                    ₹{stats.monthlyRevenue.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground">This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions & Search */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-lg">Members</CardTitle>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or phone..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsAddPaymentOpen(true)}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Cash Payment
                  </Button>
                  <Button variant="accent" onClick={() => setIsAddMemberOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Member
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <MembersTable searchQuery={searchQuery} refreshKey={refreshKey} />
          </CardContent>
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
