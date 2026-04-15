import { useEffect, useState, useCallback, useMemo, memo, Fragment } from "react";
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
// AddPaymentDialog removed - payment mode now selected in AddMemberDialog
import { MemberFilter, type MemberFilterValue } from "@/components/admin/MemberFilter";
import { TimeSlotFilterDropdown } from "@/components/admin/TimeSlotFilterDropdown";
import { TrainerFilterDropdown } from "@/components/admin/TrainerFilterDropdown";
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
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useDebounce } from "@/hooks/useDebounce";
import { useDashboardStats, useInvalidateDashboard } from "@/hooks/queries";
import { useDashboardStore } from "@/stores/dashboardStore";
import { DashboardStatsSkeleton } from "@/components/ui/skeleton-loaders";

// Memoized stat card component
const StatCard = memo(({ 
  value, 
  label, 
  icon: Icon, 
  colorClass = "text-foreground",
  bgClass = "bg-primary/10",
  iconClass = "text-primary",
  index = 0,
}: { 
  value: number | string; 
  label: string; 
  icon: React.ElementType;
  colorClass?: string;
  bgClass?: string;
  iconClass?: string;
  index?: number;
}) => (
  <Card className="hover-lift border-0 shadow-sm h-full lg:animate-none" style={{ animationDelay: `${index * 80}ms` }}>
    {/* Mobile/Tablet layout - icon on right, text and number on left */}
    <CardContent className="p-3 md:p-4 lg:hidden flex items-center justify-between">
      <div className="flex-1 min-w-0 pr-2">
        <p className={`text-lg md:text-xl font-bold ${colorClass} leading-tight break-words tracking-tight`}>
          {value}
        </p>
        <p className="text-[10px] md:text-xs text-muted-foreground leading-tight mt-1 font-medium">
          {label}
        </p>
      </div>
      <div className={`w-10 h-10 md:w-11 md:h-11 ${bgClass} rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 active:scale-90`}>
        <Icon className={`w-5 h-5 md:w-5.5 md:h-5.5 ${iconClass}`} />
      </div>
    </CardContent>

    {/* Desktop layout */}
    <CardContent className="hidden lg:block lg:p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className={`text-2xl font-bold ${colorClass} truncate`}>{value}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{label}</p>
        </div>
        <div className={`p-3 ${bgClass} rounded-xl flex-shrink-0 ml-2`}>
          <Icon className={`w-6 h-6 ${iconClass}`} />
        </div>
      </div>
    </CardContent>
  </Card>
));
StatCard.displayName = "StatCard";


const AdminDashboard = () => {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, permissions, isLoading: staffLoading, staffUser } = useStaffAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { invalidateMembers, invalidatePayments } = useInvalidateDashboard();
  const [isDailyPassEnabled, setIsDailyPassEnabled] = useState(true);

  // Fetch daily pass enabled setting
  useEffect(() => {
    if (!currentBranch?.id) return;
    supabase
      .from("gym_settings")
      .select("registration_field_settings")
      .eq("branch_id", currentBranch.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.registration_field_settings) {
          const parsed = typeof data.registration_field_settings === "string"
            ? JSON.parse(data.registration_field_settings as string)
            : data.registration_field_settings;
          if (parsed?.daily_pass_enabled?.enabled === false) {
            setIsDailyPassEnabled(false);
          } else {
            setIsDailyPassEnabled(true);
          }
        }
      });
  }, [currentBranch?.id]);
  
  // Check sessions immediately using synchronous localStorage checks
  // This ensures the button appears instantly on page load
  const [hasAdminSession, setHasAdminSession] = useState(() => {
    try {
      // Check all localStorage keys for supabase auth tokens
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-')) && key.includes('auth')) {
          const data = localStorage.getItem(key);
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed?.access_token || parsed?.currentSession?.access_token || parsed?.expires_at) {
                return true;
              }
            } catch {
              // Continue checking
            }
          }
        }
      }
    } catch (error) {
      // Silent fail
    }
    return false;
  });
  
  // Check staff session synchronously
  const [hasStaffSession] = useState(() => {
    try {
      const staffSession = localStorage.getItem('staff_session');
      if (staffSession) {
        const parsed = JSON.parse(staffSession);
        // Check if session is not expired
        if (parsed?.expiresAt && new Date(parsed.expiresAt) > new Date()) {
          return true;
        }
      }
    } catch (error) {
      // Silent fail
    }
    return false;
  });
  
  // Also verify sessions asynchronously
  useEffect(() => {
    const checkSessions = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setHasAdminSession(!!session?.user);
    };
    checkSessions();
  }, []);
  
  // Use Zustand store for persisted UI state
  const {
    activeTab,
    setActiveTab,
    memberFilter,
    setMemberFilter,
    ptFilterActive,
    setPtFilterActive,
    trainerFilter,
    setTrainerFilter,
    timeSlotFilter,
    setTimeSlotFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    dailyPassFilter,
    setDailyPassFilter,
  } = useDashboardStore();
  
  // Check if user can manage members (admin or staff with can_manage_members permission)
  // Show button immediately if:
  // 1. Admin session exists (optimistic check from localStorage) OR isAdmin is true
  // 2. Staff session exists (optimistic) - show button, permissions will be verified when they load
  // 3. Staff user with permissions loaded and can_manage_members is true
  // This ensures the button appears instantly on page load
  const canManageMembers = hasAdminSession || isAdmin || hasStaffSession || (isStaffLoggedIn && (permissions?.can_manage_members === true || !staffLoading));
  
  // Search with debouncing (not persisted - cleared on refresh is fine)
  const [searchInput, setSearchInput] = useState("");
  const searchQuery = useDebounce(searchInput, 300);
  
  const [dailyPassSearchInput, setDailyPassSearchInput] = useState("");
  const dailyPassSearchQuery = useDebounce(dailyPassSearchInput, 300);
  
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortOpen, setSortOpen] = useState(false);

  // Dashboard stats with React Query caching - persisted to localStorage via PersistQueryClient
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats();

  const displayStats = stats || {
    totalMembers: 0,
    activeMembers: 0,
    expiringSoon: 0,
    expiredMembers: 0,
    inactiveMembers: 0,
    monthlyRevenue: 0,
    withPT: 0,
    dailyPassUsers: 0,
  };

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    refetchStats();
  }, [refetchStats]);

  const handleExport = useCallback(async () => {
    try {
      const branchId = currentBranch?.id;

      if (activeTab === "members") {
        const query = supabase
          .from("members")
          .select(`id, name, phone, email, join_date, subscriptions (status, start_date, end_date, plan_months)`)
          .order("name");
        if (branchId) query.eq("branch_id", branchId);
        const { data: members, error } = await query;
        if (error) throw error;
        const exportData = (members || []).map((member) => {
          const latestSub = (member.subscriptions as any)?.[0];
          return {
            Name: member.name, Phone: member.phone, Email: member.email || "-",
            "Join Date": member.join_date || "-", Status: latestSub?.status || "No subscription",
            "Plan (Months)": latestSub?.plan_months || "-", "Start Date": latestSub?.start_date || "-",
            "End Date": latestSub?.end_date || "-",
          };
        });
        exportToExcel(exportData, "members_export", "Members");
        toast.success("Export successful", { description: `Exported ${exportData.length} member(s) to Excel` });

      } else if (activeTab === "daily_pass") {
        const query = supabase
          .from("daily_pass_users")
          .select(`id, name, phone, email, gender, created_at, daily_pass_subscriptions (package_name, duration_days, start_date, end_date, price, status, personal_trainer_id)`)
          .order("created_at", { ascending: false });
        if (branchId) query.eq("branch_id", branchId);
        const { data: users, error } = await query;
        if (error) throw error;
        const exportData = (users || []).map((user) => {
          const sub = (user.daily_pass_subscriptions as any)?.[0];
          return {
            Name: user.name, Phone: user.phone, Email: user.email || "-",
            Gender: user.gender || "-", "Package Name": sub?.package_name || "-",
            "Duration (Days)": sub?.duration_days || "-", "Start Date": sub?.start_date || "-",
            "End Date": sub?.end_date || "-", Price: sub?.price ? `₹${sub.price}` : "-",
            Status: sub?.status || "-", "Created At": user.created_at ? new Date(user.created_at).toLocaleDateString("en-IN") : "-",
          };
        });
        exportToExcel(exportData, "daily_pass_users", "Daily Pass");
        toast.success("Export successful", { description: `Exported ${exportData.length} daily pass user(s) to Excel` });

      } else if (activeTab === "payments") {
        const query = supabase
          .from("payments")
          .select(`id, amount, payment_mode, status, created_at, notes, payment_type, member:members(name, phone), daily_pass_user:daily_pass_users(name, phone)`)
          .order("created_at", { ascending: false });
        if (branchId) query.eq("branch_id", branchId);
        const { data: payments, error } = await query;
        if (error) throw error;
        const getTypeText = (t: string | null) => {
          switch (t) { case "gym_and_pt": return "Gym + PT"; case "pt_only": case "pt": return "PT"; case "gym_membership": return "Gym"; default: return t || "-"; }
        };
        const exportData = (payments || []).map((p: any) => ({
          Date: p.created_at ? new Date(p.created_at).toLocaleString("en-IN") : "-",
          "Member Name": p.member?.name || p.daily_pass_user?.name || "-",
          "Member Phone": p.member?.phone || p.daily_pass_user?.phone || "-",
          "Payment Type": getTypeText(p.payment_type),
          "Payment Mode": p.payment_mode === "online" ? "Online" : "Cash",
          Amount: `₹${Number(p.amount).toLocaleString("en-IN")}`,
          Status: p.status === "success" ? "Success" : p.status === "pending" ? "Pending" : p.status === "failed" ? "Failed" : "Unknown",
          Notes: p.notes || "-",
        }));
        exportToExcel(exportData, "payments_export", "Payments");
        toast.success("Export successful", { description: `Exported ${exportData.length} payment(s) to Excel` });
      }
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error("Export failed", { description: error.message || "Could not export data" });
    }
  }, [activeTab, currentBranch?.id]);

  const handleMemberSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
    invalidateMembers();
  }, [invalidateMembers]);

  const handlePaymentSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
    invalidatePayments();
  }, [invalidatePayments]);

  // Memoized filter change handler
  const handleMemberFilterChange = useCallback((value: MemberFilterValue) => {
    setMemberFilter(value);
    // Deactivate PT filter when a regular filter is selected
    setPtFilterActive(false);
  }, [setMemberFilter, setPtFilterActive]);
  
  // Separate handler for PT filter toggle
  const handlePtFilterChange = useCallback((active: boolean) => {
    setPtFilterActive(active);
    if (active) {
      setMemberFilter("all");
    }
  }, [setPtFilterActive, setMemberFilter]);

  // Memoized counts object
  const filterCounts = useMemo(() => ({
    all: displayStats.totalMembers,
    active: displayStats.activeMembers,
    expiring_soon: displayStats.expiringSoon,
    expired: displayStats.expiredMembers,
    inactive: displayStats.inactiveMembers,
    with_pt: displayStats.withPT,
  }), [displayStats]);

  return (
    <Fragment>
      <div className="space-y-3 md:space-y-6 max-w-7xl mx-auto">
        {/* Stats Grid */}
        {statsLoading && !stats ? (
          <DashboardStatsSkeleton />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-3.5 lg:gap-4">
            <StatCard 
              value={displayStats.totalMembers} 
              label="Total Members" 
              icon={UsersIcon}
              index={0}
            />
            <StatCard 
              value={displayStats.activeMembers} 
              label="Active Members" 
              icon={ArrowTrendingUpIcon}
              colorClass="text-success"
              bgClass="bg-success/10"
              iconClass="text-success"
              index={1}
            />
            <StatCard 
              value={displayStats.expiringSoon} 
              label="Expiring Soon" 
              icon={ExclamationTriangleIcon}
              colorClass="text-warning"
              bgClass="bg-warning/10"
              iconClass="text-warning"
              index={2}
            />
            <StatCard 
              value={`₹${displayStats.monthlyRevenue.toLocaleString("en-IN")}`} 
              label="This Month" 
              icon={CreditCardIcon}
              colorClass="text-accent"
              bgClass="bg-accent/10"
              iconClass="text-accent"
              index={3}
            />
          </div>
        )}

        {/* Tabs for Members & Payments */}
        <Card className="border-0 shadow-sm">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="pb-2 lg:pb-4 border-b px-2 lg:px-6 pt-2 lg:pt-6">
              <div className="flex flex-col gap-2 lg:gap-4">
                {/* Top Row - Tabs (Desktop), Search Bar (Desktop), and Actions (Desktop) */}
                <div className="hidden lg:flex flex-row items-center gap-3">
                  {/* Tabs - With icons and text on desktop */}
                  <TabsList className="bg-muted/50 p-1 h-10">
                    <TabsTrigger 
                      value="members" 
                      className="gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground data-[state=active]:font-semibold transition-all"
                    >
                      <UsersIcon className="w-4 h-4" />
                      <span>Members</span>
                    </TabsTrigger>
                    {isDailyPassEnabled && (
                    <TabsTrigger 
                      value="daily_pass" 
                      className="gap-1 px-3 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground data-[state=active]:font-semibold transition-all"
                    >
                      <ClockIcon className="w-4 h-4" />
                      <span>Daily Passes</span>
                    </TabsTrigger>
                    )}
                    <TabsTrigger 
                      value="payments" 
                      className="gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground data-[state=active]:font-semibold transition-all"
                    >
                      <CreditCardIcon className="w-4 h-4" />
                      <span>Payments</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Search Bar - Desktop (between tabs and actions) */}
                  {(activeTab === "members" || activeTab === "daily_pass") && (
                    <div className="relative flex-1 max-w-md group">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors duration-200 z-10" />
                      <Input
                        placeholder="Search by name or phone..."
                        className="pl-10 h-9 text-sm bg-muted/40 border border-border/50 hover:bg-muted/60 hover:border-border focus:bg-background focus:border-border focus:ring-2 focus:ring-ring/20 shadow-sm hover:shadow transition-all duration-200"
                        value={activeTab === "members" ? searchInput : dailyPassSearchInput}
                        onChange={(e) => activeTab === "members" ? setSearchInput(e.target.value) : setDailyPassSearchInput(e.target.value)}
                      />
                    </div>
                  )}
                  
                  {/* Action Buttons - Right side (Desktop) */}
                  <div className="flex items-center gap-2 flex-wrap ml-auto">
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
                    
                    
                    
                    {/* Add Member Button - Only for admins or staff with can_manage_members */}
                    {canManageMembers && (
                      <Button 
                        size="sm"
                        onClick={() => setIsAddMemberOpen(true)} 
                        className="gap-1.5 h-9 bg-foreground text-background hover:bg-foreground/90"
                      >
                        <PlusIcon className="w-4 h-4" />
                        <span>Add Member</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Mobile/Tablet: Text-only Tabs */}
                <div className="lg:hidden">
                  <TabsList className="bg-muted/40 p-0.5 h-9 md:h-10 w-full rounded-xl">
                    <TabsTrigger 
                      value="members" 
                      className="flex-1 text-xs md:text-sm leading-tight px-2 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:font-semibold transition-all duration-200 gap-1.5"
                    >
                      <UsersIcon className="w-3.5 h-3.5 hidden md:inline" />
                      Members
                    </TabsTrigger>
                    {isDailyPassEnabled && (
                    <TabsTrigger 
                      value="daily_pass" 
                      className="flex-1 text-xs md:text-sm leading-tight px-2 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:font-semibold transition-all duration-200 gap-1.5"
                    >
                      <ClockIcon className="w-3.5 h-3.5 hidden md:inline" />
                      Daily Passes
                    </TabsTrigger>
                    )}
                    <TabsTrigger 
                      value="payments" 
                      className="flex-1 text-xs md:text-sm leading-tight px-2 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:font-semibold transition-all duration-200 gap-1.5"
                    >
                      <CreditCardIcon className="w-3.5 h-3.5 hidden md:inline" />
                      Payments
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                {/* Search Bar - Mobile/Tablet only */}
                {(activeTab === "members" || activeTab === "daily_pass") && (
                  <div className="flex items-center gap-1.5 lg:hidden">
                    <div className="relative flex-1 group">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors duration-200" />
                      <Input
                        placeholder="Search by name or phone..."
                        className="pl-9 h-9 md:h-10 text-sm bg-muted/30 border-transparent rounded-xl hover:bg-muted/50 hover:border-border focus:bg-background focus:border-border focus:ring-2 focus:ring-ring/20 transition-all duration-200"
                        value={activeTab === "members" ? searchInput : dailyPassSearchInput}
                        onChange={(e) => activeTab === "members" ? setSearchInput(e.target.value) : setDailyPassSearchInput(e.target.value)}
                      />
                    </div>
                    {/* Tablet-only inline action buttons next to search */}
                    <div className="hidden md:flex lg:hidden items-center gap-1.5">
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
                              <RadioGroupItem value="name" id="sort-name-tablet" />
                              <Label htmlFor="sort-name-tablet" className="cursor-pointer flex-1 text-sm">Name</Label>
                            </div>
                            <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                              <RadioGroupItem value="join_date" id="sort-join-tablet" />
                              <Label htmlFor="sort-join-tablet" className="cursor-pointer flex-1 text-sm">Join Date</Label>
                            </div>
                            <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                              <RadioGroupItem value="end_date" id="sort-expiry-tablet" />
                              <Label htmlFor="sort-expiry-tablet" className="cursor-pointer flex-1 text-sm">Expiry Date</Label>
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
                      <Button 
                        variant="outline" 
                        size="icon"
                        className="h-9 w-9 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                        title="Export Data"
                        onClick={handleExport}
                      >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                      </Button>
                      
                      {canManageMembers && (
                        <Button 
                          size="sm"
                          onClick={() => setIsAddMemberOpen(true)} 
                          className="gap-1 h-9 bg-foreground text-background hover:bg-foreground/90 text-xs px-3 whitespace-nowrap"
                        >
                          <PlusIcon className="w-3.5 h-3.5" />
                          Add Member
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 lg:pt-2 lg:px-6 lg:pb-6">
              <TabsContent value="members" className="mt-0 space-y-2.5 lg:space-y-4">
                {/* Mobile/Tablet: Filter + Action Buttons Row */}
                <div className="md:hidden flex items-center gap-2">
                  {/* Member Filter Dropdown */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <MemberFilter 
                      value={memberFilter} 
                      onChange={handleMemberFilterChange}
                      counts={filterCounts}
                      mobileMode={true}
                    />
                    <TimeSlotFilterDropdown
                      value={timeSlotFilter}
                      onChange={setTimeSlotFilter}
                      trainerFilter={trainerFilter}
                      compact={true}
                    />
                    <TrainerFilterDropdown
                      value={trainerFilter}
                      onChange={setTrainerFilter}
                      compact={true}
                    />
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Sort */}
                    <Popover open={sortOpen} onOpenChange={setSortOpen}>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="icon"
                          className="h-9 w-9 rounded-xl border-border/50 bg-card text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all duration-200"
                          title="Sort"
                        >
                          {sortOrder === "asc" ? (
                            <BarsArrowUpIcon className="w-4 h-4" />
                          ) : (
                            <BarsArrowDownIcon className="w-4 h-4" />
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-0 rounded-xl shadow-lg border-border/50" align="end">
                        <div className="p-3 border-b border-border/50">
                          <p className="text-sm font-semibold text-foreground">Sort by</p>
                        </div>
                        <RadioGroup 
                          value={sortBy} 
                          onValueChange={(value) => setSortBy(value as typeof sortBy)}
                          className="p-1.5"
                        >
                          <div className="flex items-center space-x-2 px-2.5 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                            <RadioGroupItem value="name" id="sort-name-mobile" />
                            <Label htmlFor="sort-name-mobile" className="cursor-pointer flex-1 text-sm">Name</Label>
                          </div>
                          <div className="flex items-center space-x-2 px-2.5 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                            <RadioGroupItem value="join_date" id="sort-join-mobile" />
                            <Label htmlFor="sort-join-mobile" className="cursor-pointer flex-1 text-sm">Join Date</Label>
                          </div>
                          <div className="flex items-center space-x-2 px-2.5 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                            <RadioGroupItem value="end_date" id="sort-expiry-mobile" />
                            <Label htmlFor="sort-expiry-mobile" className="cursor-pointer flex-1 text-sm">Expiry Date</Label>
                          </div>
                        </RadioGroup>
                        <Separator />
                        <div className="p-1.5 space-y-0.5">
                          <button
                            onClick={() => setSortOrder("asc")}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-muted transition-colors ${sortOrder === "asc" ? "bg-muted font-medium" : ""}`}
                          >
                            <BarsArrowUpIcon className="w-4 h-4" />
                            Oldest first
                          </button>
                          <button
                            onClick={() => setSortOrder("desc")}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-muted transition-colors ${sortOrder === "desc" ? "bg-muted font-medium" : ""}`}
                          >
                            <BarsArrowDownIcon className="w-4 h-4" />
                            Newest first
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    
                    {/* Export */}
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="h-9 w-9 rounded-xl border-border/50 bg-card text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all duration-200"
                      title="Export Data"
                      onClick={handleExport}
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    </Button>
                    
                    
                    
                    {/* Add Member */}
                    {canManageMembers && (
                      <Button 
                        size="sm"
                        onClick={() => setIsAddMemberOpen(true)} 
                        className="gap-1 h-9 bg-foreground text-background hover:bg-foreground/90 text-xs px-3 rounded-xl active:scale-95 transition-all duration-200 shadow-sm whitespace-nowrap"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                        <span className="font-medium hidden min-[400px]:inline">Add Member</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Desktop/Tablet: Inline Member Filter Chips */}
                <div className="hidden md:flex md:items-center md:gap-2 md:flex-wrap">
                  <MemberFilter 
                    value={memberFilter} 
                    onChange={handleMemberFilterChange}
                    counts={filterCounts}
                    mobileMode={false}
                  />
                  <TrainerFilterDropdown
                    value={trainerFilter}
                    onChange={setTrainerFilter}
                  />
                  <TimeSlotFilterDropdown
                    value={timeSlotFilter}
                    onChange={setTimeSlotFilter}
                    trainerFilter={trainerFilter}
                  />
                </div>




                <MembersTable
                  searchQuery={searchQuery} 
                  refreshKey={refreshKey} 
                  filterValue={memberFilter}
                  ptFilterActive={ptFilterActive}
                  trainerFilter={trainerFilter}
                  timeSlotFilter={timeSlotFilter}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
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
        onSuccess={handleMemberSuccess}
      />

    </Fragment>
  );
};

export default AdminDashboard;
