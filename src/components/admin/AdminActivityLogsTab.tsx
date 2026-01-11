import { useEffect, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";

interface AdminActivityLog {
  id: string;
  admin_user_id: string | null;
  activity_category: string;
  activity_type: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

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
  const { toast } = useToast();
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const handleViewActivity = (activity: AdminActivityLog) => {
    setSelectedActivity(activity);
    setIsDetailOpen(true);
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [refreshKey]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("admin_activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (categoryFilter !== "all") {
        query = query.eq("activity_category", categoryFilter);
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom + "T00:00:00Z");
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo + "T23:59:59Z");
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs((data as AdminActivityLog[]) || []);
    } catch (error: any) {
      console.error("Error fetching activity logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: allLogs, error } = await supabase
        .from("admin_activity_logs")
        .select("*")
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

  useEffect(() => {
    fetchLogs();
  }, [categoryFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filteredLogs = logs.filter((log) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.description.toLowerCase().includes(query) ||
        log.activity_type.toLowerCase().includes(query) ||
        (log.entity_name && log.entity_name.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "members":
        return <Users className="w-4 h-4" />;
      case "payments":
        return <IndianRupee className="w-4 h-4" />;
      case "packages":
        return <Package className="w-4 h-4" />;
      case "trainers":
        return <Dumbbell className="w-4 h-4" />;
      case "settings":
        return <Settings className="w-4 h-4" />;
      case "whatsapp":
        return <MessageCircle className="w-4 h-4" />;
      case "subscriptions":
        return <Calendar className="w-4 h-4" />;
      default:
        return <TrendingUp className="w-4 h-4" />;
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      members: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      payments: "bg-green-500/10 text-green-500 border-green-500/20",
      packages: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      trainers: "bg-orange-500/10 text-orange-500 border-orange-500/20",
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
      toast({
        title: "Export successful",
        description: `Exported ${exportData.length} activity log(s) to Excel`,
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Failed to export activity logs",
        variant: "destructive",
      });
    }
  };

  const hasActiveFilters = searchQuery || categoryFilter !== "all" || dateFrom || dateTo;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Activities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-accent">{stats.totalActivities}</div>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.activitiesToday}</div>
                <p className="text-xs text-muted-foreground mt-1">Activities today</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.activitiesThisWeek}</div>
                <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.activitiesThisMonth}</div>
                <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
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

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Activity Logs</CardTitle>
              <CardDescription>Track all admin panel activities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search activities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="members">Members</SelectItem>
                    <SelectItem value="payments">Payments</SelectItem>
                    <SelectItem value="packages">Packages</SelectItem>
                    <SelectItem value="trainers">Trainers</SelectItem>
                    <SelectItem value="settings">Settings</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="subscriptions">Subscriptions</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[150px]"
                  placeholder="From"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[150px]"
                  placeholder="To"
                />
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExport} 
                  className="gap-2 hover:bg-accent/50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export Data
                </Button>
              </div>

              {/* Table */}
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
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No activity logs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((log) => (
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
                              <p className="text-sm font-medium">{log.description}</p>
                              <p className="text-xs text-muted-foreground">
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
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <p className="text-xs text-muted-foreground text-right">
                Showing {filteredLogs.length} of {logs.length} activities
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Activity Detail Modal */}
      <ActivityDetailDialog
        activity={selectedActivity}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
    </div>
  );
};

export default AdminActivityLogsTab;
