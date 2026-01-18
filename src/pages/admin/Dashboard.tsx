import { useEffect, useState, useRef } from "react";
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
  BarsArrowDownIcon,
  BarsArrowUpIcon,
} from "@heroicons/react/24/outline";
import { MembersTable } from "@/components/admin/MembersTable";
import { PaymentHistory } from "@/components/admin/PaymentHistory";
import DailyPassTable from "@/components/admin/DailyPassTable";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { AddPaymentDialog } from "@/components/admin/AddPaymentDialog";
import { MemberFilter, type MemberFilterValue } from "@/components/admin/MemberFilter";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { exportToExcel } from "@/utils/exportToExcel";
import { toast } from "@/components/ui/sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useBranch } from "@/contexts/BranchContext";

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
  const { currentBranch } = useBranch();
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
  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "join_date" | "end_date">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    fetchStats();
  }, [refreshKey, currentBranch?.id]);

  const fetchStats = async () => {
    try {
      // Refresh subscription statuses first
      await supabase.rpc("refresh_subscription_statuses");

      // Build base query with branch filter
      let membersQuery = supabase.from("members").select("*", { count: "exact", head: true });
      if (currentBranch?.id) {
        membersQuery = membersQuery.eq("branch_id", currentBranch.id);
      }
      const { count: totalMembers } = await membersQuery;

      // Get all members with their latest subscription
      let memberDataQuery = supabase.from("members").select("id");
      if (currentBranch?.id) {
        memberDataQuery = memberDataQuery.eq("branch_id", currentBranch.id);
      }
      const { data: membersData } = await memberDataQuery;

      // Get subscriptions for status calculations
      let subscriptionsQuery = supabase
        .from("subscriptions")
        .select("member_id, status, end_date")
        .order("end_date", { ascending: false });
      if (currentBranch?.id) {
        subscriptionsQuery = subscriptionsQuery.eq("branch_id", currentBranch.id);
      }
      const { data: allSubscriptions } = await subscriptionsQuery;

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

      let paymentsQuery = supabase
        .from("payments")
        .select("amount")
        .eq("status", "success")
        .gte("created_at", startOfMonth.toISOString());
      if (currentBranch?.id) {
        paymentsQuery = paymentsQuery.eq("branch_id", currentBranch.id);
      }
      const { data: payments } = await paymentsQuery;

      const monthlyRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      // Get active PT subscriptions count
      const todayStr = new Date().toISOString().split("T")[0];
      let ptQuery = supabase
        .from("pt_subscriptions")
        .select("member_id")
        .eq("status", "active")
        .gte("end_date", todayStr);
      if (currentBranch?.id) {
        ptQuery = ptQuery.eq("branch_id", currentBranch.id);
      }
      const { data: activePTData } = await ptQuery;

      const uniquePTMembers = new Set(activePTData?.map((pt) => pt.member_id) || []).size;

      // Get daily pass users count
      let dailyPassQuery = supabase.from("daily_pass_users").select("*", { count: "exact", head: true });
      if (currentBranch?.id) {
        dailyPassQuery = dailyPassQuery.eq("branch_id", currentBranch.id);
      }
      const { count: dailyPassCount } = await dailyPassQuery;

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

  const handleExport = async () => {
    try {
      // Fetch all members with their subscriptions for export
      const { data: members, error } = await supabase
        .from("members")
        .select(`
          id,
          name,
          phone,
          email,
          join_date,
          subscriptions (
            status,
            start_date,
            end_date,
            plan_months
          )
        `)
        .order("name");

      if (error) throw error;

      const exportData = members?.map((member) => {
        const latestSub = member.subscriptions?.[0];
        return {
          Name: member.name,
          Phone: member.phone,
          Email: member.email || "-",
          "Join Date": member.join_date || "-",
          Status: latestSub?.status || "No subscription",
          "Plan (Months)": latestSub?.plan_months || "-",
          "Start Date": latestSub?.start_date || "-",
          "End Date": latestSub?.end_date || "-",
        };
      }) || [];

      exportToExcel(exportData, "members_export", "Members");
      toast.success("Export successful", {
        description: "Members data exported to Excel",
      });
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Export failed", {
        description: "Could not export data",
      });
    }
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
                <div className="flex items-center justify-between gap-3">
                  {/* Tabs - With text labels */}
                  <TabsList className="bg-muted/50 p-1 h-10">
                    <TabsTrigger 
                      value="members" 
                      className="gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      <UsersIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Members</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="daily_pass" 
                      className="gap-1 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      <ClockIcon className="w-4 h-4" />
                      {/* <span className="text-xs">({stats.dailyPassUsers})</span> */}
                      <span className="hidden sm:inline">Daily Passes</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="payments" 
                      className="gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      <CreditCardIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Payments</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Action Buttons - Right side */}
                  <div className="flex items-center gap-2">
                    {/* Sort Button with Popover */}
                    <Popover open={sortOpen} onOpenChange={setSortOpen}>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="icon"
                          className="h-9 w-9 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                          title="Sort"
                        >
                          {sortOrder === "asc" ? (
                            <BarsArrowUpIcon className="w-4 h-4" />
                          ) : (
                            <BarsArrowDownIcon className="w-4 h-4" />
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-0" align="end">
                        <div className="p-3 border-b border-border">
                          <p className="text-sm font-medium text-foreground">Sort by</p>
                        </div>
                        <RadioGroup 
                          value={sortBy} 
                          onValueChange={(value) => setSortBy(value as typeof sortBy)}
                          className="p-2"
                        >
                          <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                            <RadioGroupItem value="name" id="sort-name" />
                            <Label htmlFor="sort-name" className="cursor-pointer flex-1 text-sm">Name</Label>
                          </div>
                          <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                            <RadioGroupItem value="join_date" id="sort-join" />
                            <Label htmlFor="sort-join" className="cursor-pointer flex-1 text-sm">Join Date</Label>
                          </div>
                          <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                            <RadioGroupItem value="end_date" id="sort-expiry" />
                            <Label htmlFor="sort-expiry" className="cursor-pointer flex-1 text-sm">Expiry Date</Label>
                          </div>
                        </RadioGroup>
                        <Separator />
                        <div className="p-2 space-y-1">
                          <button
                            onClick={() => setSortOrder("asc")}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted ${sortOrder === "asc" ? "bg-muted font-medium" : ""}`}
                          >
                            <BarsArrowUpIcon className="w-4 h-4" />
                            Oldest first
                          </button>
                          <button
                            onClick={() => setSortOrder("desc")}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted ${sortOrder === "desc" ? "bg-muted font-medium" : ""}`}
                          >
                            <BarsArrowDownIcon className="w-4 h-4" />
                            Newest first
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    
                    {/* Download/Export Button */}
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="h-9 w-9 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                      title="Export Data"
                      onClick={handleExport}
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    </Button>
                    
                    {/* Cash Payment Button */}
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => setIsAddPaymentOpen(true)} 
                      className="h-9 w-9 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                      title="Cash Payment"
                    >
                      <CreditCardIcon className="w-4 h-4" />
                    </Button>
                    
                    {/* Add Member Button */}
                    <Button 
                      size="sm"
                      onClick={() => setIsAddMemberOpen(true)} 
                      className="gap-1.5 h-9 bg-foreground text-background hover:bg-foreground/90"
                    >
                      <PlusIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Add Member</span>
                    </Button>
                  </div>
                </div>
                
                {/* Search Bar */}
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
              <TabsContent value="members" className="mt-0 space-y-4">
                {/* Inline Member Filter Chips */}
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
