import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
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

interface UserActivityLog {
  id: string;
  activity_type: string;
  description: string;
  member_id: string | null;
  daily_pass_user_id: string | null;
  subscription_id: string | null;
  pt_subscription_id: string | null;
  payment_id: string | null;
  trainer_id: string | null;
  amount: number | null;
  payment_mode: string | null;
  package_name: string | null;
  duration_months: number | null;
  duration_days: number | null;
  member_name: string | null;
  member_phone: string | null;
  trainer_name: string | null;
  start_date: string | null;
  end_date: string | null;
  metadata: any;
  created_at: string;
  branch_id: string | null;
}

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
  const [logs, setLogs] = useState<UserActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const handleViewActivity = (activity: UserActivityLog) => {
    setSelectedActivity(activity);
    setIsDetailOpen(true);
  };

  useEffect(() => {
    if (currentBranch?.id) {
      fetchLogs();
      fetchStats();
    }
  }, [refreshKey, currentBranch?.id]);

  const fetchLogs = async () => {
    if (!currentBranch?.id) return;
    
    setIsLoading(true);
    try {
      let query = supabase
        .from("user_activity_logs")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .order("created_at", { ascending: false })
        .limit(500);

      if (typeFilter !== "all") {
        query = query.eq("activity_type", typeFilter);
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom + "T00:00:00Z");
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo + "T23:59:59Z");
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs((data as UserActivityLog[]) || []);
    } catch (error: any) {
      console.error("Error fetching user activity logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

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

  useEffect(() => {
    fetchLogs();
  }, [typeFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filteredLogs = logs.filter((log) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.description.toLowerCase().includes(query) ||
        log.activity_type.toLowerCase().includes(query) ||
        (log.member_name && log.member_name.toLowerCase().includes(query)) ||
        (log.member_phone && log.member_phone.includes(query))
      );
    }
    return true;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "registration":
        return <UserPlus className="w-4 h-4" />;
      case "renewal":
        return <RefreshCw className="w-4 h-4" />;
      case "pt_subscription":
      case "pt_extension":
        return <Dumbbell className="w-4 h-4" />;
      case "daily_pass":
        return <Calendar className="w-4 h-4" />;
      default:
        return <Calendar className="w-4 h-4" />;
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

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return null;
  };

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

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>User Activity Logs</CardTitle>
              <CardDescription>Track all user activities - registrations, renewals, PT subscriptions, daily passes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, phone, description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Activity Type" />
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
                  onDateChange={(from, to) => {
                    setDateFrom(from);
                    setDateTo(to);
                  }}
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
                      <TableHead>Type</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No user activity logs found
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
                          <TableCell>{getTypeBadge(log.activity_type)}</TableCell>
                          <TableCell>
                            {log.member_name ? (
                              <div>
                                <p className="text-sm font-medium">{log.member_name}</p>
                                {log.member_phone && (
                                  <p className="text-xs text-muted-foreground">{log.member_phone}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs">
                              <p className="text-sm truncate">{log.description}</p>
                              {log.package_name && (
                                <p className="text-xs text-muted-foreground">{log.package_name}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {log.amount ? (
                              <span className="text-sm font-medium text-success">
                                ₹{Number(log.amount).toLocaleString("en-IN")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
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

      {/* Activity Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedActivity && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    {getTypeIcon(selectedActivity.activity_type)}
                  </div>
                  <div>
                    <p className="text-lg font-semibold">Activity Details</p>
                    <p className="text-sm font-normal text-muted-foreground capitalize">
                      {selectedActivity.activity_type.replace(/_/g, " ")}
                    </p>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 mt-4">
                {/* Amount if present */}
                {selectedActivity.amount && (
                  <div className="text-center py-4 rounded-lg bg-success/10">
                    <p className="text-sm text-muted-foreground mb-1">Amount</p>
                    <p className="text-3xl font-bold text-success">
                      ₹{Number(selectedActivity.amount).toLocaleString("en-IN")}
                    </p>
                  </div>
                )}

                {/* Timing Details */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Timing Details
                  </h4>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Created</span>
                      <span className="text-sm font-medium">
                        {new Date(selectedActivity.created_at).toLocaleString("en-IN", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {getRelativeTime(new Date(selectedActivity.created_at)) && (
                      <Badge variant="outline" className="text-xs">
                        {getRelativeTime(new Date(selectedActivity.created_at))}
                      </Badge>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Description */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Description
                  </h4>
                  <p className="text-sm text-foreground bg-muted/30 rounded-lg p-4">
                    {selectedActivity.description}
                  </p>
                </div>

                {/* Member Details */}
                {(selectedActivity.member_name || selectedActivity.member_phone) && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Member Details
                    </h4>
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                      {selectedActivity.member_name && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Name</span>
                          <span className="text-sm font-medium">{selectedActivity.member_name}</span>
                        </div>
                      )}
                      {selectedActivity.member_phone && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" /> Phone
                          </span>
                          <span className="text-sm font-medium">{selectedActivity.member_phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Package & Subscription Details */}
                {(selectedActivity.package_name || selectedActivity.duration_months || selectedActivity.duration_days || selectedActivity.start_date || selectedActivity.end_date) && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Package Details
                    </h4>
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                      {selectedActivity.package_name && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Package</span>
                          <span className="text-sm font-medium">{selectedActivity.package_name}</span>
                        </div>
                      )}
                      {selectedActivity.duration_months && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Duration</span>
                          <span className="text-sm font-medium">{selectedActivity.duration_months} month(s)</span>
                        </div>
                      )}
                      {selectedActivity.duration_days && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Duration</span>
                          <span className="text-sm font-medium">{selectedActivity.duration_days} day(s)</span>
                        </div>
                      )}
                      {selectedActivity.start_date && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Start Date</span>
                          <span className="text-sm font-medium">
                            {format(parseISO(selectedActivity.start_date), "MMM d, yyyy")}
                          </span>
                        </div>
                      )}
                      {selectedActivity.end_date && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">End Date</span>
                          <span className="text-sm font-medium">
                            {format(parseISO(selectedActivity.end_date), "MMM d, yyyy")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Details */}
                {(selectedActivity.payment_mode || selectedActivity.trainer_name) && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Additional Details
                    </h4>
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                      {selectedActivity.payment_mode && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Payment Mode</span>
                          <Badge variant="outline" className="capitalize">
                            {selectedActivity.payment_mode}
                          </Badge>
                        </div>
                      )}
                      {selectedActivity.trainer_name && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Dumbbell className="w-3 h-3" /> Trainer
                          </span>
                          <span className="text-sm font-medium">{selectedActivity.trainer_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedActivity.metadata && Object.keys(selectedActivity.metadata).length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-foreground">Additional Metadata</h4>
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                      {Object.entries(selectedActivity.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-sm text-muted-foreground capitalize">
                            {key.replace(/_/g, " ")}
                          </span>
                          <span className="text-sm font-medium">
                            {typeof value === "object" ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserActivityLogsTab;
