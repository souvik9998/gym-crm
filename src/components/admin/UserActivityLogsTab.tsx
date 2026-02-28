import { useEffect, useMemo, useState } from "react";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { useInView } from "react-intersection-observer";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  Filter,
  X,
  UserPlus,
  RefreshCw,
  Dumbbell,
  Calendar,
  Eye,
  Download,
  Clock,
  IndianRupee,
  User,
  Phone,
  CreditCard,
  Package,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportToExcel } from "@/utils/exportToExcel";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { toast } from "@/components/ui/sonner";
import { format, parseISO } from "date-fns";
import { useInfiniteUserLogsQuery, type UserActivityLog } from "@/hooks/queries";
import { TableSkeleton, InfiniteScrollSkeleton } from "@/components/ui/skeleton-loaders";

interface ActivityStats {
  totalActivities: number;
  activitiesToday: number;
  activitiesThisWeek: number;
  activitiesThisMonth: number;
  byType: Record<string, number>;
}

interface UserActivityLogsTabProps {
  refreshKey: number;
}

const UserActivityLogsTab = ({ refreshKey }: UserActivityLogsTabProps) => {
  const { currentBranch } = useBranch();
  const isCompact = useIsTabletOrBelow();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState<ActivityStats>({
    totalActivities: 0,
    activitiesToday: 0,
    activitiesThisWeek: 0,
    activitiesThisMonth: 0,
    byType: {},
  });
  const [activeSubTab, setActiveSubTab] = useState("logs");
  const [selectedActivity, setSelectedActivity] = useState<UserActivityLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Create filters object for the query
  const filters = useMemo(() => ({
    typeFilter: typeFilter !== "all" ? typeFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [typeFilter, dateFrom, dateTo]);

  // Use infinite query for paginated data
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteUserLogsQuery(filters);

  // Flatten all pages into single array
  const allLogs = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.data);
  }, [data]);

  const totalCount = data?.pages[0]?.totalCount || 0;
  const showLoading = isLoading || (isFetching && !data) || data === undefined;

  // Intersection observer for infinite scroll
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Fetch stats separately
  useEffect(() => {
    if (currentBranch?.id) {
      fetchStats();
    }
  }, [refreshKey, currentBranch?.id]);

  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  const fetchStats = async () => {
    if (!currentBranch?.id) return;
    
    try {
      const { data: allLogs, error } = await supabase
        .from("user_activity_logs")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      const statsData: ActivityStats = {
        totalActivities: allLogs?.length || 0,
        activitiesToday: 0,
        activitiesThisWeek: 0,
        activitiesThisMonth: 0,
        byType: {},
      };

      allLogs?.forEach((log: UserActivityLog) => {
        const createdAt = new Date(log.created_at);
        if (createdAt >= today) statsData.activitiesToday++;
        if (createdAt >= weekAgo) statsData.activitiesThisWeek++;
        if (createdAt >= monthAgo) statsData.activitiesThisMonth++;
        statsData.byType[log.activity_type] = 
          (statsData.byType[log.activity_type] || 0) + 1;
      });

      setStats(statsData);
    } catch (error: any) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleViewActivity = (activity: UserActivityLog) => {
    setSelectedActivity(activity);
    setIsDetailOpen(true);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return allLogs;
    const query = searchQuery.toLowerCase();
    return allLogs.filter((log) => (
      log.description.toLowerCase().includes(query) ||
      log.activity_type.toLowerCase().includes(query) ||
      (log.member_name && log.member_name.toLowerCase().includes(query)) ||
      (log.member_phone && log.member_phone.includes(query))
    ));
  }, [allLogs, searchQuery]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "registration": return <UserPlus className="w-4 h-4" />;
      case "renewal": return <RefreshCw className="w-4 h-4" />;
      case "pt_subscription":
      case "pt_extension": return <Dumbbell className="w-4 h-4" />;
      case "daily_pass": return <Calendar className="w-4 h-4" />;
      default: return <Calendar className="w-4 h-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      registration: "bg-green-500/10 text-green-500 border-green-500/20",
      renewal: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      pt_subscription: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      pt_extension: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      daily_pass: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    };
    const labels: Record<string, string> = {
      registration: "Registration",
      renewal: "Renewal",
      pt_subscription: "PT Subscription",
      pt_extension: "PT Extension",
      daily_pass: "Daily Pass",
    };
    return (
      <Badge className={colors[type] || "bg-muted text-muted-foreground"}>
        <span className="flex items-center gap-1">
          {getTypeIcon(type)}
          {labels[type] || type}
        </span>
      </Badge>
    );
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleExport = () => {
    try {
      const exportData = filteredLogs.map((log) => ({
        Date: formatDateTime(log.created_at),
        Type: log.activity_type.replace(/_/g, " "),
        Description: log.description,
        "Member Name": log.member_name || "-",
        "Member Phone": log.member_phone || "-",
        Amount: log.amount ? `₹${log.amount}` : "-",
        "Payment Mode": log.payment_mode || "-",
        Package: log.package_name || "-",
        Trainer: log.trainer_name || "-",
        "Start Date": log.start_date || "-",
        "End Date": log.end_date || "-",
      }));

      exportToExcel(exportData, "user_activity_logs");
      toast.success("Export successful", {
        description: `Exported ${exportData.length} activity log(s) to Excel`,
      });
    } catch (error: any) {
      toast.error("Export failed", {
        description: error.message || "Failed to export activity logs",
      });
    }
  };

  const hasActiveFilters = searchQuery || typeFilter !== "all" || dateFrom || dateTo;
  const isDataConfirmedEmpty = !isLoading && !isFetching && data !== undefined && filteredLogs.length === 0;

  if (showLoading) {
    return <TableSkeleton rows={8} columns={6} />;
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-[240px] lg:max-w-xs grid-cols-2 h-8 lg:h-10">
          <TabsTrigger value="stats" className="text-xs lg:text-sm py-1 lg:py-1.5">Statistics</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs lg:text-sm py-1 lg:py-1.5">Activity Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <Card>
              <CardHeader className="p-3 lg:pb-3 lg:p-6 pb-1">
                <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground">Total Activities</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
                <div className="text-xl lg:text-3xl font-bold text-accent">{stats.totalActivities}</div>
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">All time</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 lg:pb-3 lg:p-6 pb-1">
                <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground">Today</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
                <div className="text-xl lg:text-3xl font-bold text-foreground">{stats.activitiesToday}</div>
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">Activities today</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 lg:pb-3 lg:p-6 pb-1">
                <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground">This Week</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
                <div className="text-xl lg:text-3xl font-bold text-foreground">{stats.activitiesThisWeek}</div>
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">Last 7 days</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 lg:pb-3 lg:p-6 pb-1">
                <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground">This Month</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
                <div className="text-xl lg:text-3xl font-bold text-foreground">{stats.activitiesThisMonth}</div>
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">Last 30 days</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Activities by Type</CardTitle>
              <CardDescription>Distribution of user activities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.entries(stats.byType).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    {getTypeIcon(type)}
                    <div>
                      <p className="text-sm font-medium capitalize">{type.replace(/_/g, " ")}</p>
                      <p className="text-lg font-bold">{count}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4 lg:mt-6">
          <Card>
            <CardHeader className="p-3 lg:p-6 pb-2 lg:pb-2">
              <CardTitle className="text-base lg:text-xl">User Activity Logs</CardTitle>
              <CardDescription className="text-xs lg:text-sm">Track all user activities ({totalCount} total)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 lg:space-y-4 p-3 lg:p-6 pt-0">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-1.5 lg:gap-3">
                <div className="relative flex-1 min-w-[140px] lg:min-w-[200px]">
                  <Search className="absolute left-2.5 lg:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 lg:w-4 lg:h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 lg:pl-10 h-8 lg:h-12 text-xs lg:text-sm"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-auto min-w-[80px] lg:w-[180px] h-8 lg:h-12 text-[11px] lg:text-sm">
                    <Filter className="w-3 h-3 lg:w-4 lg:h-4 mr-0.5 lg:mr-1" />
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="registration">Registration</SelectItem>
                    <SelectItem value="renewal">Renewal</SelectItem>
                    <SelectItem value="pt_subscription">PT Subscription</SelectItem>
                    <SelectItem value="pt_extension">PT Extension</SelectItem>
                    <SelectItem value="daily_pass">Daily Pass</SelectItem>
                  </SelectContent>
                </Select>
                <DateRangePicker
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onDateChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
                />
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 lg:px-3">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleExport} className="gap-1 h-8 text-[11px] lg:text-sm px-2 lg:px-3">
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </div>

              {/* Mobile/Tablet: Card list */}
              {isCompact ? (
                <div className="space-y-2">
                  {isDataConfirmedEmpty ? (
                    <p className="text-center py-8 text-muted-foreground text-sm">No user activity logs found</p>
                  ) : (
                    <>
                      {filteredLogs.map((log) => (
                        <div key={log.id} className="p-3 rounded-lg border bg-card cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleViewActivity(log)}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getTypeBadge(log.activity_type)}
                                {log.amount && (
                                  <span className="text-xs font-medium text-success flex items-center gap-0.5">
                                    <IndianRupee className="w-3 h-3" />₹{log.amount}
                                  </span>
                                )}
                              </div>
                              {log.member_name && (
                                <p className="text-sm font-medium">{log.member_name}
                                  {log.member_phone && <span className="text-xs text-muted-foreground ml-1">{log.member_phone}</span>}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground line-clamp-1">{log.description}</p>
                              <p className="text-[11px] text-muted-foreground">{formatDateTime(log.created_at)}</p>
                            </div>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={(e) => { e.stopPropagation(); handleViewActivity(log); }}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {hasNextPage && (
                        <div ref={loadMoreRef}>{isFetchingNextPage && <InfiniteScrollSkeleton />}</div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead className="w-[80px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isDataConfirmedEmpty ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No user activity logs found</TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {filteredLogs.map((log) => (
                            <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleViewActivity(log)}>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(log.created_at)}</TableCell>
                              <TableCell>{getTypeBadge(log.activity_type)}</TableCell>
                              <TableCell>
                                {log.member_name ? (
                                  <div>
                                    <p className="text-sm font-medium">{log.member_name}</p>
                                    {log.member_phone && <p className="text-xs text-muted-foreground">{log.member_phone}</p>}
                                  </div>
                                ) : <span className="text-muted-foreground">-</span>}
                              </TableCell>
                              <TableCell>
                                <div className="max-w-xs">
                                  {log.package_name && (
                                    <div className="flex items-center gap-1 text-sm"><Package className="w-3 h-3 text-muted-foreground" /><span>{log.package_name}</span></div>
                                  )}
                                  {log.trainer_name && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Dumbbell className="w-3 h-3" /><span>{log.trainer_name}</span></div>
                                  )}
                                  {!log.package_name && !log.trainer_name && <span className="text-muted-foreground text-sm">{log.description}</span>}
                                </div>
                              </TableCell>
                              <TableCell>
                                {log.amount ? (
                                  <div className="flex items-center gap-1"><IndianRupee className="w-3 h-3 text-success" /><span className="font-medium text-success">{log.amount}</span></div>
                                ) : <span className="text-muted-foreground">-</span>}
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleViewActivity(log); }}><Eye className="w-4 h-4" /></Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {hasNextPage && (
                            <TableRow ref={loadMoreRef}><TableCell colSpan={6} className="p-0">{isFetchingNextPage && <InfiniteScrollSkeleton />}</TableCell></TableRow>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Activity Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity Details</DialogTitle>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getTypeBadge(selectedActivity.activity_type)}
              </div>
              
              <Separator />
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Time</p>
                    <p className="text-sm font-medium">{formatDateTime(selectedActivity.created_at)}</p>
                  </div>
                </div>

                {selectedActivity.member_name && (
                  <div className="flex items-start gap-3">
                    <User className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Member</p>
                      <p className="text-sm font-medium">{selectedActivity.member_name}</p>
                      {selectedActivity.member_phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {selectedActivity.member_phone}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {selectedActivity.package_name && (
                  <div className="flex items-start gap-3">
                    <Package className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Package</p>
                      <p className="text-sm font-medium">{selectedActivity.package_name}</p>
                    </div>
                  </div>
                )}

                {selectedActivity.trainer_name && (
                  <div className="flex items-start gap-3">
                    <Dumbbell className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Trainer</p>
                      <p className="text-sm font-medium">{selectedActivity.trainer_name}</p>
                    </div>
                  </div>
                )}

                {selectedActivity.amount && (
                  <div className="flex items-start gap-3">
                    <IndianRupee className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <p className="text-sm font-medium text-success">₹{selectedActivity.amount}</p>
                      {selectedActivity.payment_mode && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <CreditCard className="w-3 h-3" />
                          {selectedActivity.payment_mode}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {(selectedActivity.start_date || selectedActivity.end_date) && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-sm font-medium">
                        {selectedActivity.start_date && format(parseISO(selectedActivity.start_date), "dd MMM yyyy")}
                        {selectedActivity.start_date && selectedActivity.end_date && " - "}
                        {selectedActivity.end_date && format(parseISO(selectedActivity.end_date), "dd MMM yyyy")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserActivityLogsTab;
