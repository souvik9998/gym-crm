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
import { AddPaymentDialog } from "@/components/admin/AddPaymentDialog";
import { MemberFilter, type MemberFilterValue } from "@/components/admin/MemberFilter";
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
  iconClass = "text-primary"
}: { 
  value: number | string; 
  label: string; 
  icon: React.ElementType;
  colorClass?: string;
  bgClass?: string;
  iconClass?: string;
}) => (
  <Card className="hover-lift border-0 shadow-sm h-full">
    {/* Mobile layout - icon on right, text and number on left */}
    <CardContent className="p-2 flex items-center justify-between md:hidden">
      <div className="flex-1 min-w-0 pr-2">
        <p className={`text-base font-bold ${colorClass} leading-tight break-words`}>
          {value}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
          {label}
        </p>
      </div>
      <div className={`w-8 h-8 ${bgClass} rounded-lg flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${iconClass}`} />
      </div>
    </CardContent>

    {/* Desktop / tablet layout - keep existing design */}
    <CardContent className="hidden md:block md:p-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className={`text-xl lg:text-2xl font-bold ${colorClass} truncate`}>{value}</p>
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
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
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
  }, []);

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 lg:gap-4">
            <StatCard 
              value={displayStats.totalMembers} 
              label="Total Members" 
              icon={UsersIcon}
            />
            <StatCard 
              value={displayStats.activeMembers} 
              label="Active Members" 
              icon={ArrowTrendingUpIcon}
              colorClass="text-success"
              bgClass="bg-success/10"
              iconClass="text-success"
            />
            <StatCard 
              value={displayStats.expiringSoon} 
              label="Expiring Soon" 
              icon={ExclamationTriangleIcon}
              colorClass="text-warning"
              bgClass="bg-warning/10"
              iconClass="text-warning"
            />
            <StatCard 
              value={`₹${displayStats.monthlyRevenue.toLocaleString("en-IN")}`} 
              label="This Month" 
              icon={CreditCardIcon}
              colorClass="text-accent"
              bgClass="bg-accent/10"
              iconClass="text-accent"
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
                    <TabsTrigger 
                      value="daily_pass" 
                      className="gap-1 px-3 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground data-[state=active]:font-semibold transition-all"
                    >
                      <ClockIcon className="w-4 h-4" />
                      <span>Daily Passes</span>
                    </TabsTrigger>
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
                    
                    {/* Cash Payment Button - Only for admins or staff with can_manage_members */}
                    {canManageMembers && (
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => setIsAddPaymentOpen(true)} 
                        className="h-9 w-9 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                        title="Cash Payment"
                      >
                        <CreditCardIcon className="w-4 h-4" />
                      </Button>
                    )}
                    
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
                  <TabsList className="bg-muted/50 p-0.5 h-8 md:h-9 w-full">
                    <TabsTrigger 
                      value="members" 
                      className="flex-1 text-[10px] md:text-xs leading-tight px-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1"
                    >
                      <UsersIcon className="w-3.5 h-3.5 hidden md:inline" />
                      Members
                    </TabsTrigger>
                    <TabsTrigger 
                      value="daily_pass" 
                      className="flex-1 text-[10px] md:text-xs leading-tight px-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1"
                    >
                      <ClockIcon className="w-3.5 h-3.5 hidden md:inline" />
                      Daily Passes
                    </TabsTrigger>
                    <TabsTrigger 
                      value="payments" 
                      className="flex-1 text-[10px] md:text-xs leading-tight px-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1"
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
                      <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 md:w-4 h-3.5 md:h-4 text-muted-foreground group-focus-within:text-foreground transition-colors duration-200" />
                      <Input
                        placeholder="Search by name or phone..."
                        className="pl-8 md:pl-9 h-8 md:h-9 text-xs md:text-sm bg-muted/30 border-transparent hover:bg-muted/50 hover:border-border focus:bg-background focus:border-border transition-all duration-200"
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
                          variant="outline" 
                          size="icon"
                          onClick={() => setIsAddPaymentOpen(true)} 
                          className="h-9 w-9 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                          title="Cash Payment"
                        >
                          <CreditCardIcon className="w-4 h-4" />
                        </Button>
                      )}
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
            <CardContent className="p-2 sm:p-4 lg:pt-2 lg:px-6 lg:pb-6">
              <TabsContent value="members" className="mt-0 space-y-1.5 lg:space-y-4">
                {/* Mobile/Tablet: Filter Dropdown and Action Buttons Row */}
                <div className="md:hidden flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 md:gap-2">
                    {/* Member Filter Dropdown (Mobile/Tablet) */}
                    <div className="flex-1">
                      <MemberFilter 
                        value={memberFilter} 
                        onChange={handleMemberFilterChange}
                        counts={filterCounts}
                        ptFilterActive={ptFilterActive}
                        onPtFilterChange={handlePtFilterChange}
                        mobileMode={true}
                      />
                    </div>
                    
                     {/* Action Buttons - Mobile/Tablet */}
                    <div className="flex items-center gap-1 md:gap-1.5">
                      {/* Sort Button */}
                      <Popover open={sortOpen} onOpenChange={setSortOpen}>
                        <PopoverTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="h-6 w-6 md:h-8 md:w-8 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                            title="Sort"
                          >
                            {sortOrder === "asc" ? (
                              <BarsArrowUpIcon className="w-3 h-3 md:w-4 md:h-4" />
                            ) : (
                              <BarsArrowDownIcon className="w-3 h-3 md:w-4 md:h-4" />
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
                              <RadioGroupItem value="name" id="sort-name-mobile" />
                              <Label htmlFor="sort-name-mobile" className="cursor-pointer flex-1 text-sm">Name</Label>
                            </div>
                            <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                              <RadioGroupItem value="join_date" id="sort-join-mobile" />
                              <Label htmlFor="sort-join-mobile" className="cursor-pointer flex-1 text-sm">Join Date</Label>
                            </div>
                            <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                              <RadioGroupItem value="end_date" id="sort-expiry-mobile" />
                              <Label htmlFor="sort-expiry-mobile" className="cursor-pointer flex-1 text-sm">Expiry Date</Label>
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
                      
                      {/* Export Button */}
                        <Button 
                          variant="outline" 
                          size="icon"
                          className="h-6 w-6 md:h-8 md:w-8 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                          title="Export Data"
                          onClick={handleExport}
                        >
                          <ArrowDownTrayIcon className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>
                      
                      {/* Cash Payment Button */}
                      {canManageMembers && (
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => setIsAddPaymentOpen(true)} 
                          className="h-6 w-6 md:h-8 md:w-8 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                          title="Cash Payment"
                        >
                          <CreditCardIcon className="w-3 h-3 md:w-4 md:h-4" />
                        </Button>
                      )}
                      
                      {/* Add Member Button */}
                      {canManageMembers && (
                        <Button 
                          size="sm"
                          onClick={() => setIsAddMemberOpen(true)} 
                          className="gap-0.5 md:gap-1 h-6 md:h-8 bg-foreground text-background hover:bg-foreground/90 text-[10px] md:text-xs px-1.5 md:px-2.5"
                        >
                          <PlusIcon className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                          <span>Add Member</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Desktop/Tablet: Inline Member Filter Chips */}
                <div className="hidden md:block">
                  <MemberFilter 
                    value={memberFilter} 
                    onChange={handleMemberFilterChange}
                    counts={filterCounts}
                    ptFilterActive={ptFilterActive}
                    onPtFilterChange={handlePtFilterChange}
                    mobileMode={false}
                  />
                </div>




                <MembersTable
                  searchQuery={searchQuery} 
                  refreshKey={refreshKey} 
                  filterValue={memberFilter}
                  ptFilterActive={ptFilterActive}
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

      <AddPaymentDialog
        open={isAddPaymentOpen}
        onOpenChange={setIsAddPaymentOpen}
        onSuccess={handlePaymentSuccess}
      />
    </Fragment>
  );
};

export default AdminDashboard;
