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
  Search,
  Filter,
  X,
  Users,
  IndianRupee,
  Package,
  Dumbbell,
  Settings,
  MessageCircle,
  Calendar,
  TrendingUp,
  Eye,
  Download,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ActivityDetailDialog from "./ActivityDetailDialog";
import { exportToExcel } from "@/utils/exportToExcel";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { toast } from "@/components/ui/sonner";
import { useInfiniteAdminLogsQuery, type AdminActivityLog } from "@/hooks/queries";
import { TableSkeleton, InfiniteScrollSkeleton } from "@/components/ui/skeleton-loaders";

interface ActivityStats {
  totalActivities: number;
  activitiesToday: number;
  activitiesThisWeek: number;
  activitiesThisMonth: number;
  byCategory: Record<string, number>;
}

interface AdminActivityLogsTabProps {
  refreshKey: number;
}

const AdminActivityLogsTab = ({ refreshKey }: AdminActivityLogsTabProps) => {
  const { currentBranch } = useBranch();
  const isCompact = useIsTabletOrBelow();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState<ActivityStats>({
    totalActivities: 0,
    activitiesToday: 0,
    activitiesThisWeek: 0,
    activitiesThisMonth: 0,
    byCategory: {},
  });
  const [activeSubTab, setActiveSubTab] = useState("logs");
  const [selectedActivity, setSelectedActivity] = useState<AdminActivityLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Create filters object for the query
  const filters = useMemo(() => ({
    categoryFilter: categoryFilter !== "all" ? categoryFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [categoryFilter, dateFrom, dateTo]);

  // Use infinite query for paginated data
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteAdminLogsQuery(filters);

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

  // Fetch stats separately (not paginated)
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
        .from("admin_activity_logs")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .not("admin_user_id", "is", null)
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
        byCategory: {},
      };

      allLogs?.forEach((log: AdminActivityLog) => {
        const createdAt = new Date(log.created_at);
        if (createdAt >= today) statsData.activitiesToday++;
        if (createdAt >= weekAgo) statsData.activitiesThisWeek++;
        if (createdAt >= monthAgo) statsData.activitiesThisMonth++;
        statsData.byCategory[log.activity_category] = 
          (statsData.byCategory[log.activity_category] || 0) + 1;
      });

      setStats(statsData);
    } catch (error: any) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleViewActivity = (activity: AdminActivityLog) => {
    setSelectedActivity(activity);
    setIsDetailOpen(true);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return allLogs;
    const query = searchQuery.toLowerCase();
    return allLogs.filter((log) => (
      log.description.toLowerCase().includes(query) ||
      log.activity_type.toLowerCase().includes(query) ||
      (log.entity_name && log.entity_name.toLowerCase().includes(query))
    ));
  }, [allLogs, searchQuery]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "members": return <Users className="w-4 h-4" />;
      case "payments": return <IndianRupee className="w-4 h-4" />;
      case "packages": return <Package className="w-4 h-4" />;
      case "trainers": return <Dumbbell className="w-4 h-4" />;
      case "staff": return <Users className="w-4 h-4" />;
      case "settings": return <Settings className="w-4 h-4" />;
      case "whatsapp": return <MessageCircle className="w-4 h-4" />;
      case "subscriptions": return <Calendar className="w-4 h-4" />;
      default: return <TrendingUp className="w-4 h-4" />;
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      members: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      payments: "bg-green-500/10 text-green-500 border-green-500/20",
      packages: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      trainers: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      staff: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
      settings: "bg-gray-500/10 text-gray-500 border-gray-500/20",
      whatsapp: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      subscriptions: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    };
    return (
      <Badge className={colors[category] || "bg-muted text-muted-foreground"}>
        <span className="flex items-center gap-1">
          {getCategoryIcon(category)}
          {category.charAt(0).toUpperCase() + category.slice(1)}
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

  const formatDescription = (description: string) => {
    return description.replace(/^Soft deleted /i, "Deleted ");
  };

  const isDeleteActivity = (activityType: string) => {
    return activityType.includes("deleted") || activityType.includes("delete");
  };

  const handleExport = () => {
    try {
      const exportData = filteredLogs.map((log) => ({
        Date: formatDateTime(log.created_at),
        Category: log.activity_category,
        Type: log.activity_type,
        Description: log.description,
        "Entity Type": log.entity_type || "-",
        "Entity Name": log.entity_name || "-",
        "Entity ID": log.entity_id || "-",
      }));

      exportToExcel(exportData, "admin_activity_logs");
      toast.success("Export successful", {
        description: `Exported ${exportData.length} activity log(s) to Excel`,
      });
    } catch (error: any) {
      toast.error("Export failed", {
        description: error.message || "Failed to export activity logs",
      });
    }
  };

  const hasActiveFilters = searchQuery || categoryFilter !== "all" || dateFrom || dateTo;
  const isDataConfirmedEmpty = !isLoading && !isFetching && data !== undefined && filteredLogs.length === 0;

  if (showLoading) {
    return <TableSkeleton rows={8} columns={5} />;
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
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
              <CardTitle>Activities by Category</CardTitle>
              <CardDescription>Distribution of admin activities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(stats.byCategory).map(([category, count]) => (
                  <div key={category} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    {getCategoryIcon(category)}
                    <div>
                      <p className="text-sm font-medium capitalize">{category}</p>
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
              <CardTitle className="text-base lg:text-xl">Activity Logs</CardTitle>
              <CardDescription className="text-xs lg:text-sm">Track all admin panel activities ({totalCount} total)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 lg:space-y-4 p-3 lg:p-6 pt-0">
              {/* Filters - search on one line, buttons on next for mobile/tablet */}
              <div className="space-y-2 lg:space-y-0 lg:flex lg:flex-wrap lg:gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search activities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-9 lg:h-12 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2 lg:gap-3">
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-auto min-w-[130px] lg:w-[180px] h-9 lg:h-12 text-xs lg:text-sm">
                      <Filter className="w-3.5 h-3.5 lg:w-4 lg:h-4 mr-1 lg:mr-2" />
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="members">Members</SelectItem>
                      <SelectItem value="payments">Payments</SelectItem>
                      <SelectItem value="packages">Packages</SelectItem>
                      <SelectItem value="trainers">Trainers</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="settings">Settings</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="subscriptions">Subscriptions</SelectItem>
                    </SelectContent>
                  </Select>
                  <DateRangePicker
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateChange={(from, to) => {
                      setDateFrom(from);
                      setDateTo(to);
                    }}
                  />
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleExport} 
                    className="gap-1.5 h-9 text-xs lg:text-sm"
                  >
                    <Download className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                    <span className="hidden sm:inline">Export Data</span>
                    <span className="sm:hidden">Export</span>
                  </Button>
                </div>
              </div>

              {/* Mobile/Tablet: Card list */}
              {isCompact ? (
                <div className="space-y-2">
                  {isDataConfirmedEmpty ? (
                    <p className="text-center py-8 text-muted-foreground text-sm">No activity logs found</p>
                  ) : (
                    <>
                      {filteredLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 rounded-lg border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleViewActivity(log)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0 space-y-1">
                              <p className={`text-sm font-medium leading-tight ${isDeleteActivity(log.activity_type) ? "text-red-500" : ""}`}>
                                {formatDescription(log.description)}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {getCategoryBadge(log.activity_category)}
                                {log.entity_name && (
                                  <Badge variant="outline" className="text-[10px]">{log.entity_name}</Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground">{formatDateTime(log.created_at)}</p>
                            </div>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={(e) => { e.stopPropagation(); handleViewActivity(log); }}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {hasNextPage && (
                        <div ref={loadMoreRef}>
                          {isFetchingNextPage && <InfiniteScrollSkeleton />}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                /* Desktop: Table */
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Activity</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead className="w-[80px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isDataConfirmedEmpty ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No activity logs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {filteredLogs.map((log) => (
                            <TableRow 
                              key={log.id} 
                              className="cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleViewActivity(log)}
                            >
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {formatDateTime(log.created_at)}
                              </TableCell>
                              <TableCell>{getCategoryBadge(log.activity_category)}</TableCell>
                              <TableCell>
                                <div className="max-w-md">
                                  <p className={`text-sm font-medium ${isDeleteActivity(log.activity_type) ? "text-red-500" : ""}`}>
                                    {formatDescription(log.description)}
                                  </p>
                                  <p className={`text-xs ${isDeleteActivity(log.activity_type) ? "text-red-400" : "text-muted-foreground"}`}>
                                    {log.activity_type.replace(/_/g, " ")}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                {log.entity_name && (
                                  <Badge variant="outline" className="text-xs">
                                    {log.entity_name}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewActivity(log);
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {hasNextPage && (
                            <TableRow ref={loadMoreRef}>
                              <TableCell colSpan={5} className="p-0">
                                {isFetchingNextPage && <InfiniteScrollSkeleton />}
                              </TableCell>
                            </TableRow>
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

      <ActivityDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        activity={selectedActivity}
      />
    </div>
  );
};

export default AdminActivityLogsTab;
