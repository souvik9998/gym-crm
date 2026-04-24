import { useEffect, useState, useCallback, useMemo, memo, Fragment } from "react";
// StaffDashboard - v3 (matching admin layout)
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
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
  BarsArrowDownIcon,
  BarsArrowUpIcon,
} from "@heroicons/react/24/outline";
import { MembersTable } from "@/components/admin/MembersTable";
import { PaymentHistory } from "@/components/admin/PaymentHistory";
import DailyPassTable from "@/components/admin/DailyPassTable";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { MemberFilter, type MemberFilterValue } from "@/components/admin/MemberFilter";
import { TimeSlotFilterDropdown } from "@/components/admin/TimeSlotFilterDropdown";
import { TrainerFilterDropdown } from "@/components/admin/TrainerFilterDropdown";
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
import { useStaffAuth, useStaffPermission } from "@/contexts/StaffAuthContext";
import { useDebounce } from "@/hooks/useDebounce";
import { useDashboardStats, useInvalidateDashboard } from "@/hooks/queries";
import { DashboardStatsSkeleton } from "@/components/ui/skeleton-loaders";

// Memoized stat card - matching admin layout with mobile/desktop variants
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
    {/* Mobile/Tablet layout */}
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

const StaffDashboard = () => {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, staffUser, isLoading: staffLoading, permissions } = useStaffAuth();
  const { invalidateMembers, invalidatePayments } = useInvalidateDashboard();
  
  const canViewMembers = useStaffPermission("can_view_members");
  const canManageMembers = useStaffPermission("can_manage_members");
  const canAccessPayments = useStaffPermission("can_access_payments");
  
  const canSeeMembers = canViewMembers || canManageMembers;
  const canRecordPayments = canManageMembers;
  const showTrainerFilter = permissions?.member_access_type !== "assigned";
  
  const [searchInput, setSearchInput] = useState("");
  const searchQuery = useDebounce(searchInput, 300);
  
  const [dailyPassSearchInput, setDailyPassSearchInput] = useState("");
  const dailyPassSearchQuery = useDebounce(dailyPassSearchInput, 300);
  
  const [dailyPassFilter, setDailyPassFilter] = useState("all");
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("members");
  const [memberFilter, setMemberFilter] = useState<MemberFilterValue>("all");
  const [ptFilterActive, setPtFilterActive] = useState(false);
  const [trainerFilter, setTrainerFilter] = useState<string | null>(null);
  const [timeSlotFilter, setTimeSlotFilter] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "join_date" | "end_date">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!staffLoading && !isStaffLoggedIn) {
      navigate("/admin/login");
    }
  }, [staffLoading, isStaffLoggedIn, navigate]);

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

  const handleMemberSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
    invalidateMembers();
  }, [invalidateMembers]);

  const handlePaymentSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
    invalidatePayments();
  }, [invalidatePayments]);

  const handleMemberFilterChange = useCallback((value: MemberFilterValue) => {
    setMemberFilter(value);
    setPtFilterActive(false);
  }, []);

  const filterCounts = useMemo(() => ({
    all: displayStats.totalMembers,
    active: displayStats.activeMembers,
    expiring_soon: displayStats.expiringSoon,
    expired: displayStats.expiredMembers,
    inactive: displayStats.inactiveMembers,
    with_pt: displayStats.withPT,
  }), [displayStats]);

  if (staffLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isStaffLoggedIn) {
    return null;
  }

  return (
    <Fragment>
      <div className="space-y-3 md:space-y-6 max-w-7xl mx-auto">
        {/* Stats Grid */}
        {canSeeMembers && (
          <>
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
                {(canAccessPayments || canRecordPayments) && (
                  <StatCard 
                    value={`₹${displayStats.monthlyRevenue.toLocaleString("en-IN")}`} 
                    label="This Month" 
                    icon={CreditCardIcon}
                    colorClass="text-accent"
                    bgClass="bg-accent/10"
                    iconClass="text-accent"
                    index={3}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* Tabs for Members & Payments */}
        {canSeeMembers && (
          <Card className="border-0 shadow-sm">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <CardHeader className="pb-2 lg:pb-4 border-b px-2 lg:px-6 pt-2 lg:pt-6">
                <div className="flex flex-col gap-2 lg:gap-4">
                  {/* Desktop: Tabs + Search + Actions in one row */}
                  <div className="hidden lg:flex flex-row items-center gap-3">
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
                      {canAccessPayments && (
                        <TabsTrigger 
                          value="payments" 
                          className="gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-foreground data-[state=active]:font-semibold transition-all"
                        >
                          <CreditCardIcon className="w-4 h-4" />
                          <span>Payments</span>
                        </TabsTrigger>
                      )}
                    </TabsList>
                    
                    {/* Search Bar - Desktop */}
                    {(activeTab === "members" || activeTab === "daily_pass") && (
                      <div className="flex-1 max-w-md">
                        <SearchInput
                          placeholder="Search by name or phone..."
                          value={activeTab === "members" ? searchInput : dailyPassSearchInput}
                          onChange={(e) => activeTab === "members" ? setSearchInput(e.target.value) : setDailyPassSearchInput(e.target.value)}
                          onClear={() => activeTab === "members" ? setSearchInput("") : setDailyPassSearchInput("")}
                          isSearching={
                            activeTab === "members"
                              ? searchInput !== searchQuery
                              : dailyPassSearchInput !== dailyPassSearchQuery
                          }
                        />
                      </div>
                    )}
                    
                    {/* Action Buttons - Desktop */}
                    <div className="flex items-center gap-2 flex-wrap ml-auto">
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
                              <RadioGroupItem value="name" id="staff-sort-name" />
                              <Label htmlFor="staff-sort-name" className="cursor-pointer flex-1 text-sm">Name</Label>
                            </div>
                            <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                              <RadioGroupItem value="join_date" id="staff-sort-join" />
                              <Label htmlFor="staff-sort-join" className="cursor-pointer flex-1 text-sm">Join Date</Label>
                            </div>
                            <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                              <RadioGroupItem value="end_date" id="staff-sort-expiry" />
                              <Label htmlFor="staff-sort-expiry" className="cursor-pointer flex-1 text-sm">Expiry Date</Label>
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
                      <TabsTrigger 
                        value="daily_pass" 
                        className="flex-1 text-xs md:text-sm leading-tight px-2 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:font-semibold transition-all duration-200 gap-1.5"
                      >
                        <ClockIcon className="w-3.5 h-3.5 hidden md:inline" />
                        Daily Passes
                      </TabsTrigger>
                      {canAccessPayments && (
                        <TabsTrigger 
                          value="payments" 
                          className="flex-1 text-xs md:text-sm leading-tight px-2 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:font-semibold transition-all duration-200 gap-1.5"
                        >
                          <CreditCardIcon className="w-3.5 h-3.5 hidden md:inline" />
                          Payments
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>
                  
                  {/* Search Bar - Mobile/Tablet */}
                  {(activeTab === "members" || activeTab === "daily_pass") && (
                    <div className="flex items-center gap-1.5 lg:hidden">
                      <div className="flex-1">
                        <SearchInput
                          placeholder="Search by name or phone..."
                          value={activeTab === "members" ? searchInput : dailyPassSearchInput}
                          onChange={(e) => activeTab === "members" ? setSearchInput(e.target.value) : setDailyPassSearchInput(e.target.value)}
                          onClear={() => activeTab === "members" ? setSearchInput("") : setDailyPassSearchInput("")}
                          isSearching={
                            activeTab === "members"
                              ? searchInput !== searchQuery
                              : dailyPassSearchInput !== dailyPassSearchQuery
                          }
                        />
                      </div>
                      {/* Tablet-only inline action buttons */}
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
                                <RadioGroupItem value="name" id="staff-sort-name-tablet" />
                                <Label htmlFor="staff-sort-name-tablet" className="cursor-pointer flex-1 text-sm">Name</Label>
                              </div>
                              <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                                <RadioGroupItem value="join_date" id="staff-sort-join-tablet" />
                                <Label htmlFor="staff-sort-join-tablet" className="cursor-pointer flex-1 text-sm">Join Date</Label>
                              </div>
                              <div className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                                <RadioGroupItem value="end_date" id="staff-sort-expiry-tablet" />
                                <Label htmlFor="staff-sort-expiry-tablet" className="cursor-pointer flex-1 text-sm">Expiry Date</Label>
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
                  {/* Mobile: Filter + Action Buttons Row */}
                  <div className="md:hidden flex items-center gap-2">
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
                      {showTrainerFilter && (
                        <TrainerFilterDropdown
                          value={trainerFilter}
                          onChange={(v) => { setTrainerFilter(v); setTimeSlotFilter(null); }}
                          compact={true}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
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
                              <RadioGroupItem value="name" id="staff-sort-name-mobile" />
                              <Label htmlFor="staff-sort-name-mobile" className="cursor-pointer flex-1 text-sm">Name</Label>
                            </div>
                            <div className="flex items-center space-x-2 px-2.5 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                              <RadioGroupItem value="join_date" id="staff-sort-join-mobile" />
                              <Label htmlFor="staff-sort-join-mobile" className="cursor-pointer flex-1 text-sm">Join Date</Label>
                            </div>
                            <div className="flex items-center space-x-2 px-2.5 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                              <RadioGroupItem value="end_date" id="staff-sort-expiry-mobile" />
                              <Label htmlFor="staff-sort-expiry-mobile" className="cursor-pointer flex-1 text-sm">Expiry Date</Label>
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
                    {showTrainerFilter && (
                      <TrainerFilterDropdown
                        value={trainerFilter}
                        onChange={(v) => { setTrainerFilter(v); setTimeSlotFilter(null); }}
                      />
                    )}
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

                {canAccessPayments && (
                  <TabsContent value="payments" className="mt-0">
                    <PaymentHistory refreshKey={refreshKey} />
                  </TabsContent>
                )}
              </CardContent>
            </Tabs>
          </Card>
        )}

        {/* No Access Message */}
        {!canSeeMembers && !canAccessPayments && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <UsersIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Limited Access
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                You don't have permission to view member data. Please contact your administrator
                if you believe this is an error.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Payment-only access */}
        {!canSeeMembers && canAccessPayments && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Payment History</h3>
              </div>
            </CardHeader>
            <PaymentHistory refreshKey={refreshKey} />
          </Card>
        )}
      </div>

      {canManageMembers && (
        <AddMemberDialog
          open={isAddMemberOpen}
          onOpenChange={setIsAddMemberOpen}
          onSuccess={handleMemberSuccess}
        />
      )}
    </Fragment>
  );
};

export default StaffDashboard;
