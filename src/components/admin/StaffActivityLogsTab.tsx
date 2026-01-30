import { useEffect, useMemo, useState } from "react";
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
  Eye,
  Download,
  UserPlus,
  UserMinus,
  Key,
  ShieldCheck,
  RefreshCw,
  LogIn,
  LogOut,
  Send,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ActivityDetailDialog from "./ActivityDetailDialog";
import { exportToExcel } from "@/utils/exportToExcel";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { toast } from "@/components/ui/sonner";
import { useInfiniteStaffLogsQuery, type StaffActivityLog } from "@/hooks/queries";
import { TableSkeleton, InfiniteScrollSkeleton } from "@/components/ui/skeleton-loaders";

interface StaffActivityStats {
  totalActivities: number;
  activitiesToday: number;
  membersAdded: number;
  membersUpdated: number;
  paymentsRecorded: number;
  loginLogout: number;
  ledgerEntries: number;
  settingsChanges: number;
  whatsappMessages: number;
}

interface Staff {
  id: string;
  full_name: string;
  phone: string;
}

interface StaffActivityLogsTabProps {
  refreshKey: number;
}

const StaffActivityLogsTab = ({ refreshKey }: StaffActivityLogsTabProps) => {
  const { currentBranch } = useBranch();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState<StaffActivityStats>({
    totalActivities: 0,
    activitiesToday: 0,
    membersAdded: 0,
    membersUpdated: 0,
    paymentsRecorded: 0,
    loginLogout: 0,
    ledgerEntries: 0,
    settingsChanges: 0,
    whatsappMessages: 0,
  });
  const [activeSubTab, setActiveSubTab] = useState("logs");
  const [selectedActivity, setSelectedActivity] = useState<StaffActivityLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Create filters object for the query
  const filters = useMemo(() => ({
    typeFilter: typeFilter !== "all" ? typeFilter : undefined,
    staffFilter: staffFilter !== "all" ? staffFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [typeFilter, staffFilter, dateFrom, dateTo]);

  // Use infinite query for paginated data
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteStaffLogsQuery(filters);

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

  // Fetch staff list and stats
  useEffect(() => {
    if (currentBranch?.id) {
      fetchStaffList();
      fetchStats();
    }
  }, [refreshKey, currentBranch?.id]);

  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  const fetchStaffList = async () => {
    if (!currentBranch?.id) return;

    try {
      const { data: assignments } = await supabase
        .from("staff_branch_assignments")
        .select("staff_id")
        .eq("branch_id", currentBranch.id);

      const staffIds = assignments?.map((a) => a.staff_id) || [];

      if (staffIds.length === 0) {
        setStaffList([]);
        return;
      }

      const { data: staffData, error } = await supabase
        .from("staff")
        .select("id, full_name, phone")
        .in("id", staffIds)
        .eq("is_active", true)
        .order("full_name");

      if (error) throw error;
      setStaffList((staffData as Staff[]) || []);
    } catch (error: any) {
      console.error("Error fetching staff list:", error);
    }
  };

  const fetchStats = async () => {
    if (!currentBranch?.id) return;
    
    try {
      const { data: activityData, error } = await supabase
        .from("admin_activity_logs")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .is("admin_user_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const statsData: StaffActivityStats = {
        totalActivities: activityData?.length || 0,
        activitiesToday: 0,
        membersAdded: 0,
        membersUpdated: 0,
        paymentsRecorded: 0,
        loginLogout: 0,
        ledgerEntries: 0,
        settingsChanges: 0,
        whatsappMessages: 0,
      };

      activityData?.forEach((log: StaffActivityLog) => {
        const createdAt = new Date(log.created_at);
        if (createdAt >= today) statsData.activitiesToday++;
        
        if (log.activity_type === "member_added") statsData.membersAdded++;
        if (["member_updated", "member_deleted", "member_moved_to_active", "member_moved_to_inactive", "member_status_changed"].includes(log.activity_type)) 
          statsData.membersUpdated++;
        if (log.activity_type === "cash_payment_added" || log.activity_type === "online_payment_received") 
          statsData.paymentsRecorded++;
        if (log.activity_type === "staff_logged_in" || log.activity_type === "staff_logged_out") 
          statsData.loginLogout++;
        if (["expense_added", "expense_deleted", "income_added", "ledger_entry_added", "ledger_entry_deleted"].includes(log.activity_type)) 
          statsData.ledgerEntries++;
        if (["gym_info_updated", "whatsapp_toggled", "package_updated", "package_added", "package_deleted", "custom_package_added", "custom_package_updated", "custom_package_deleted", "branch_updated"].includes(log.activity_type)) 
          statsData.settingsChanges++;
        if (["whatsapp_message_sent", "whatsapp_promotional_sent", "whatsapp_expiry_reminder_sent", "whatsapp_expired_reminder_sent", "whatsapp_payment_details_sent", "whatsapp_bulk_message_sent"].includes(log.activity_type)) 
          statsData.whatsappMessages++;
      });

      setStats(statsData);
    } catch (error: any) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleViewActivity = (activity: StaffActivityLog) => {
    setSelectedActivity(activity);
    setIsDetailOpen(true);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setStaffFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return allLogs;
    const query = searchQuery.toLowerCase();
    return allLogs.filter((log) => {
      const metadata = log.metadata as any;
      const staffName = metadata?.staff_name?.toLowerCase() || "";
      return (
        log.description.toLowerCase().includes(query) ||
        log.activity_type.toLowerCase().includes(query) ||
        (log.entity_name && log.entity_name.toLowerCase().includes(query)) ||
        staffName.includes(query)
      );
    });
  }, [allLogs, searchQuery]);

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case "staff_added": return <UserPlus className="w-4 h-4 text-green-500" />;
      case "staff_deleted": return <UserMinus className="w-4 h-4 text-red-500" />;
      case "staff_updated": return <RefreshCw className="w-4 h-4 text-blue-500" />;
      case "staff_password_set":
      case "staff_password_updated":
      case "staff_password_changed": return <Key className="w-4 h-4 text-purple-500" />;
      case "staff_permissions_updated": return <ShieldCheck className="w-4 h-4 text-indigo-500" />;
      case "staff_logged_in": return <LogIn className="w-4 h-4 text-green-500" />;
      case "staff_logged_out": return <LogOut className="w-4 h-4 text-orange-500" />;
      case "member_added":
      case "member_updated": return <UserPlus className="w-4 h-4 text-blue-500" />;
      case "member_deleted": return <UserMinus className="w-4 h-4 text-red-500" />;
      case "whatsapp_message_sent":
      case "whatsapp_promotional_sent": return <Send className="w-4 h-4 text-green-500" />;
      default: return <RefreshCw className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getActivityBadge = (activityType: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      staff_logged_in: { label: "Logged In", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      staff_logged_out: { label: "Logged Out", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
      member_added: { label: "Member Added", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      member_updated: { label: "Member Updated", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      member_deleted: { label: "Member Deleted", color: "bg-red-500/10 text-red-500 border-red-500/20" },
      cash_payment_added: { label: "Payment", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
      expense_added: { label: "Expense Added", color: "bg-red-500/10 text-red-500 border-red-500/20" },
      income_added: { label: "Income Added", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      gym_info_updated: { label: "Settings Updated", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
      whatsapp_message_sent: { label: "WhatsApp Sent", color: "bg-green-500/10 text-green-500 border-green-500/20" },
    };
    const config = labels[activityType] || { label: activityType.replace(/_/g, " "), color: "bg-muted text-muted-foreground" };
    return (
      <Badge className={config.color}>
        <span className="flex items-center gap-1">
          {getActivityIcon(activityType)}
          {config.label}
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
      const exportData = filteredLogs.map((log) => {
        const metadata = log.metadata as any;
        return {
          Date: formatDateTime(log.created_at),
          "Staff Name": metadata?.staff_name || "-",
          Type: log.activity_type.replace(/_/g, " "),
          Description: log.description,
          "Entity Type": log.entity_type || "-",
          "Entity Name": log.entity_name || "-",
        };
      });

      exportToExcel(exportData, "staff_activity_logs");
      toast.success("Export successful", {
        description: `Exported ${exportData.length} activity log(s) to Excel`,
      });
    } catch (error: any) {
      toast.error("Export failed", {
        description: error.message || "Failed to export activity logs",
      });
    }
  };

  const hasActiveFilters = searchQuery || typeFilter !== "all" || staffFilter !== "all" || dateFrom || dateTo;
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
                <CardTitle className="text-sm font-medium text-muted-foreground">Members Added</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.membersAdded}</div>
                <p className="text-xs text-muted-foreground mt-1">By staff</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.paymentsRecorded}</div>
                <p className="text-xs text-muted-foreground mt-1">Cash payments recorded</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ledger Entries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stats.ledgerEntries}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Settings Changes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stats.settingsChanges}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">WhatsApp Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stats.whatsappMessages}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Staff Activity Logs</CardTitle>
              <CardDescription>Track all staff activities ({totalCount} total)</CardDescription>
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
                <Select value={staffFilter} onValueChange={setStaffFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Staff Member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {staffList.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.full_name}
                      </SelectItem>
                    ))}
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
                      <TableHead>Staff</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isDataConfirmedEmpty ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No staff activity logs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {filteredLogs.map((log) => {
                          const metadata = log.metadata as any;
                          return (
                            <TableRow 
                              key={log.id} 
                              className="cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleViewActivity(log)}
                            >
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {formatDateTime(log.created_at)}
                              </TableCell>
                              <TableCell>
                                {metadata?.staff_name ? (
                                  <div>
                                    <p className="text-sm font-medium">{metadata.staff_name}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{metadata.staff_role}</p>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="max-w-md">
                                  <div className="mb-1">{getActivityBadge(log.activity_type)}</div>
                                  <p className={`text-xs ${isDeleteActivity(log.activity_type) ? "text-red-400" : "text-muted-foreground"}`}>
                                    {formatDescription(log.description)}
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
                          );
                        })}
                        
                        {/* Infinite scroll sentinel */}
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

export default StaffActivityLogsTab;
