import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UsersIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import { MembersTable } from "@/components/admin/MembersTable";
import { PaymentHistory } from "@/components/admin/PaymentHistory";
import DailyPassTable from "@/components/admin/DailyPassTable";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { AddPaymentDialog } from "@/components/admin/AddPaymentDialog";
import { MemberFilter, type MemberFilterValue } from "@/components/admin/MemberFilter";
import { AdminLayout } from "@/components/admin/AdminLayout";

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
    fetchStats();
  }, [refreshKey]);

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

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Overview of your gym"
      onRefresh={handleRefresh}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Card className="hover-lift border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.totalMembers}</p>
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
                  <p className="text-2xl font-bold text-success">{stats.activeMembers}</p>
                  <p className="text-xs text-muted-foreground mt-1">Active Members</p>
                </div>
                <div className="p-3 bg-success/10 rounded-xl">
                  <ArrowTrendingUpIcon className="w-6 h-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-warning">{stats.expiringSoon}</p>
                  <p className="text-xs text-muted-foreground mt-1">Expiring Soon</p>
                </div>
                <div className="p-3 bg-warning/10 rounded-xl">
                  <ExclamationTriangleIcon className="w-6 h-6 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-accent">
                    ₹{stats.monthlyRevenue.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">This Month</p>
                </div>
                <div className="p-3 bg-accent/10 rounded-xl">
                  <CreditCardIcon className="w-6 h-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Members & Payments */}
        <Card className="border-0 shadow-sm">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="pb-4 border-b">
              <div className="flex flex-col gap-4">
                {/* Top Row - Tabs and Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <TabsList className="bg-muted/50 p-1 w-full sm:w-auto overflow-x-auto">
                    <TabsTrigger value="members" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      <UsersIcon className="w-4 h-4" />
                      <span className="hidden xs:inline">Members</span>
                    </TabsTrigger>
                    <TabsTrigger value="daily_pass" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      <ClockIcon className="w-4 h-4" />
                      <span className="hidden xs:inline">Daily Pass</span>
                      <span className="text-xs">({stats.dailyPassUsers})</span>
                    </TabsTrigger>
                    <TabsTrigger value="payments" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
                      <CreditCardIcon className="w-4 h-4" />
                      <span className="hidden xs:inline">Payments</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="h-9 w-9"
                      title="Filter"
                    >
                      <FunnelIcon className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="h-9 w-9"
                      title="Export Data"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setIsAddPaymentOpen(true)} 
                      className="gap-1.5 h-9"
                    >
                      <CreditCardIcon className="w-4 h-4" />
                      <span className="hidden md:inline">Cash</span>
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => setIsAddMemberOpen(true)} 
                      className="gap-1.5 h-9"
                    >
                      <PlusIcon className="w-4 h-4" />
                      <span className="hidden md:inline">Add Member</span>
                    </Button>
                  </div>
                </div>
                
                {/* Search Bar - Below tabs on mobile, inline on desktop */}
                {(activeTab === "members" || activeTab === "daily_pass") && (
                  <div className="relative w-full md:max-w-sm group">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors duration-200" />
                    <Input
                      placeholder="Search by name or phone..."
                      className="pl-10 h-9 bg-muted/30 border-transparent hover:bg-muted/50 hover:border-border focus:bg-background focus:border-border transition-all duration-200"
                      value={activeTab === "members" ? searchQuery : dailyPassSearchQuery}
                      onChange={(e) => activeTab === "members" ? setSearchQuery(e.target.value) : setDailyPassSearchQuery(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 md:p-6">
              <TabsContent value="members" className="mt-0 space-y-6">
                <MemberFilter 
                  value={memberFilter} 
                  onChange={(value) => {
                    setMemberFilter(value);
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
      </div>

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
    </AdminLayout>
  );
};

export default AdminDashboard;
