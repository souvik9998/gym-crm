import { useEffect, useState, useCallback, useMemo, memo, Fragment } from "react";
// StaffDashboard - v2
import { useNavigate } from "react-router-dom";
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
  BarsArrowDownIcon,
  BarsArrowUpIcon,
} from "@heroicons/react/24/outline";
import { MembersTable } from "@/components/admin/MembersTable";
import { PaymentHistory } from "@/components/admin/PaymentHistory";
import DailyPassTable from "@/components/admin/DailyPassTable";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { AddPaymentDialog } from "@/components/admin/AddPaymentDialog";
import { MemberFilter, type MemberFilterValue } from "@/components/admin/MemberFilter";
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
  <Card className="hover-lift border-0 shadow-sm">
    <CardContent className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
        <div className={`p-3 ${bgClass} rounded-xl`}>
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
  const { isStaffLoggedIn, staffUser, isLoading: staffLoading } = useStaffAuth();
  const { invalidateMembers, invalidatePayments } = useInvalidateDashboard();
  
  // STRICT Permission checks based on policy:
  const canViewMembers = useStaffPermission("can_view_members");
  const canManageMembers = useStaffPermission("can_manage_members");
  const canAccessPayments = useStaffPermission("can_access_payments");
  
  const canSeeMembers = canViewMembers || canManageMembers;
  const canRecordPayments = canManageMembers;
  
  // Search with debouncing
  const [searchInput, setSearchInput] = useState("");
  const searchQuery = useDebounce(searchInput, 300);
  
  const [dailyPassSearchInput, setDailyPassSearchInput] = useState("");
  const dailyPassSearchQuery = useDebounce(dailyPassSearchInput, 300);
  
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

  // Redirect if not staff logged in
  useEffect(() => {
    if (!staffLoading && !isStaffLoggedIn) {
      navigate("/admin/login");
    }
  }, [staffLoading, isStaffLoggedIn, navigate]);

  // Dashboard stats with React Query caching - using the new hook
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

  // Memoized filter change handler
  const handleMemberFilterChange = useCallback((value: MemberFilterValue) => {
    setMemberFilter(value);
    if (value === "all" && ptFilterActive) {
      setPtFilterActive(false);
    }
  }, [ptFilterActive]);

  // Memoized counts object
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
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Stats Grid - Only show if can see members */}
        {canSeeMembers && (
          <>
            {statsLoading && !stats ? (
              <DashboardStatsSkeleton />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
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
                {/* Revenue stat - only if can access payments OR can manage members */}
                {(canAccessPayments || canRecordPayments) && (
                  <StatCard 
                    value={`₹${displayStats.monthlyRevenue.toLocaleString("en-IN")}`} 
                    label="This Month" 
                    icon={CreditCardIcon}
                    colorClass="text-accent"
                    bgClass="bg-accent/10"
                    iconClass="text-accent"
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
              <CardHeader className="pb-4 border-b">
                <div className="flex flex-col gap-4">
                  {/* Top Row - Tabs and Actions */}
                  <div className="flex items-center justify-between gap-3">
                    {/* Tabs */}
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
                        <span className="hidden sm:inline">Daily Passes</span>
                      </TabsTrigger>
                      {canAccessPayments && (
                        <TabsTrigger 
                          value="payments" 
                          className="gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                          <CreditCardIcon className="w-4 h-4" />
                          <span className="hidden sm:inline">Payments</span>
                        </TabsTrigger>
                      )}
                    </TabsList>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* Sort Button */}
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

                      {/* Cash Payment Button - Only for staff with can_manage_members */}
                      {canRecordPayments && (
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => setIsAddPaymentOpen(true)} 
                          className="h-9 w-9 border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                          title="Record Cash Payment"
                        >
                          <CreditCardIcon className="w-4 h-4" />
                        </Button>
                      )}

                      {/* Add Member Button */}
                      {canManageMembers && (
                        <Button
                          variant="accent"
                          size="sm"
                          className="gap-1.5 h-9"
                          onClick={() => setIsAddMemberOpen(true)}
                        >
                          <PlusIcon className="w-4 h-4" />
                          <span className="hidden sm:inline">Add Member</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Second Row - Filters and Search */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    {/* Filter Section */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                      {activeTab === "members" && (
                        <MemberFilter
                          value={memberFilter}
                          onChange={handleMemberFilterChange}
                          counts={filterCounts}
                        />
                      )}
                    </div>

                    {/* Search */}
                    <div className="relative w-full sm:w-64">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder={activeTab === "daily_pass" ? "Search passes..." : "Search members..."}
                        className="pl-9 h-9 text-sm bg-background"
                        value={activeTab === "daily_pass" ? dailyPassSearchInput : searchInput}
                        onChange={(e) => {
                          if (activeTab === "daily_pass") {
                            setDailyPassSearchInput(e.target.value);
                          } else {
                            setSearchInput(e.target.value);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>

              <TabsContent value="members" className="p-0 m-0">
                <MembersTable
                  searchQuery={searchQuery}
                  filterValue={memberFilter}
                  ptFilterActive={ptFilterActive}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  refreshKey={refreshKey}
                />
              </TabsContent>

              <TabsContent value="daily_pass" className="p-0 m-0">
                <DailyPassTable
                  searchQuery={dailyPassSearchQuery}
                  filterValue={dailyPassFilter}
                  refreshKey={refreshKey}
                />
              </TabsContent>

              {canAccessPayments && (
                <TabsContent value="payments" className="p-0 m-0">
                  <PaymentHistory refreshKey={refreshKey} />
                </TabsContent>
              )}
            </Tabs>
          </Card>
        )}

        {/* No Access Message - show if user can't see members AND can't access payments */}
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

        {/* Payment-only access: show just payment history */}
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

      {/* Dialogs - Only canManageMembers can add members */}
      {canManageMembers && (
        <AddMemberDialog
          open={isAddMemberOpen}
          onOpenChange={setIsAddMemberOpen}
          onSuccess={handleMemberSuccess}
        />
      )}
      {/* Only canRecordPayments (= canManageMembers) can record cash payments */}
      {canRecordPayments && (
        <AddPaymentDialog
          open={isAddPaymentOpen}
          onOpenChange={setIsAddPaymentOpen}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </Fragment>
  );
};

export default StaffDashboard;
