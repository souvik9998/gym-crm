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
  AlertTriangle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ActivityDetailDialog from "./ActivityDetailDialog";
import { exportToExcel } from "@/utils/exportToExcel";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { toast } from "@/components/ui/sonner";

interface StaffActivityLog {
  id: string;
  admin_user_id: string | null;
  activity_category: string;
  activity_type: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  old_value: any;
  new_value: any;
  metadata: any;
  created_at: string;
  branch_id: string | null;
}

interface StaffLoginAttempt {
  id: string;
  phone: string;
  success: boolean;
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface StaffActivityStats {
  totalActivities: number;
  activitiesToday: number;
  membersAdded: number;
  membersUpdated: number;
  paymentsRecorded: number;
  loginLogout: number;
  loginAttempts: number;
  failedLogins: number;
  ledgerEntries: number;
  settingsChanges: number;
}

interface StaffActivityLogsTabProps {
  refreshKey: number;
}

const StaffActivityLogsTab = ({ refreshKey }: StaffActivityLogsTabProps) => {
  const { currentBranch } = useBranch();
  const [logs, setLogs] = useState<StaffActivityLog[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<StaffLoginAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState<StaffActivityStats>({
    totalActivities: 0,
    activitiesToday: 0,
    membersAdded: 0,
    membersUpdated: 0,
    paymentsRecorded: 0,
    loginLogout: 0,
    loginAttempts: 0,
    failedLogins: 0,
    ledgerEntries: 0,
    settingsChanges: 0,
  });
  const [activeSubTab, setActiveSubTab] = useState("logs");
  const [selectedActivity, setSelectedActivity] = useState<StaffActivityLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleViewActivity = (activity: StaffActivityLog) => {
    setSelectedActivity(activity);
    setIsDetailOpen(true);
  };

  useEffect(() => {
    if (currentBranch?.id) {
      fetchData();
    }
  }, [refreshKey, currentBranch?.id]);

  const fetchData = async () => {
    if (!currentBranch?.id) return;
    
    setIsLoading(true);
    try {
      // Fetch staff activity logs - actions performed BY staff (admin_user_id = NULL)
      // This includes: login/logout, member actions, payment actions when done by staff
      const { data: activityData, error: activityError } = await supabase
        .from("admin_activity_logs")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .is("admin_user_id", null) // Only show actions performed by staff, not admin
        .order("created_at", { ascending: false })
        .limit(500);

      if (activityError) throw activityError;
      setLogs((activityData as StaffActivityLog[]) || []);

      // Fetch login attempts
      const { data: loginData, error: loginError } = await supabase
        .from("staff_login_attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (loginError) throw loginError;
      setLoginAttempts((loginData as StaffLoginAttempt[]) || []);

      // Calculate stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const statsData: StaffActivityStats = {
        totalActivities: activityData?.length || 0,
        activitiesToday: 0,
        membersAdded: 0,
        membersUpdated: 0,
        paymentsRecorded: 0,
        loginLogout: 0,
        loginAttempts: loginData?.length || 0,
        failedLogins: loginData?.filter((l: StaffLoginAttempt) => !l.success).length || 0,
        ledgerEntries: 0,
        settingsChanges: 0,
      };

      activityData?.forEach((log: StaffActivityLog) => {
        const createdAt = new Date(log.created_at);
        if (createdAt >= today) statsData.activitiesToday++;
        
        if (log.activity_type === "member_added") statsData.membersAdded++;
        if (log.activity_type === "member_updated" || log.activity_type === "member_deleted") statsData.membersUpdated++;
        if (log.activity_type === "cash_payment_added" || log.activity_type === "online_payment_received") 
          statsData.paymentsRecorded++;
        if (log.activity_type === "staff_logged_in" || log.activity_type === "staff_logged_out") 
          statsData.loginLogout++;
        // Ledger activities
        if (["expense_added", "expense_deleted", "income_added", "ledger_entry_added", "ledger_entry_deleted"].includes(log.activity_type)) 
          statsData.ledgerEntries++;
        // Settings activities
        if (["gym_info_updated", "whatsapp_toggled", "package_updated", "package_added", "package_deleted", "branch_updated"].includes(log.activity_type)) 
          statsData.settingsChanges++;
      });

      setStats(statsData);
    } catch (error: any) {
      console.error("Error fetching staff activity logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentBranch?.id) {
      fetchFilteredLogs();
    }
  }, [typeFilter, dateFrom, dateTo]);

  const fetchFilteredLogs = async () => {
    if (!currentBranch?.id) return;
    
    try {
      let query = supabase
        .from("admin_activity_logs")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .is("admin_user_id", null) // Only show actions performed by staff, not admin
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
      setLogs((data as StaffActivityLog[]) || []);
    } catch (error: any) {
      console.error("Error fetching filtered logs:", error);
    }
  };

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
        (log.entity_name && log.entity_name.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const filteredLoginAttempts = loginAttempts.filter((attempt) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return attempt.phone.toLowerCase().includes(query);
    }
    return true;
  });

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case "staff_added":
        return <UserPlus className="w-4 h-4 text-green-500" />;
      case "staff_deleted":
        return <UserMinus className="w-4 h-4 text-red-500" />;
      case "staff_updated":
        return <RefreshCw className="w-4 h-4 text-blue-500" />;
      case "staff_toggled":
        return <RefreshCw className="w-4 h-4 text-amber-500" />;
      case "staff_password_set":
      case "staff_password_updated":
      case "staff_password_changed":
        return <Key className="w-4 h-4 text-purple-500" />;
      case "staff_permissions_updated":
        return <ShieldCheck className="w-4 h-4 text-indigo-500" />;
      case "staff_logged_in":
        return <LogIn className="w-4 h-4 text-green-500" />;
      case "staff_logged_out":
        return <LogOut className="w-4 h-4 text-orange-500" />;
      case "member_added":
      case "member_updated":
      case "member_viewed":
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case "member_deleted":
        return <UserMinus className="w-4 h-4 text-red-500" />;
      case "subscription_created":
      case "subscription_renewed":
      case "subscription_extended":
        return <RefreshCw className="w-4 h-4 text-green-500" />;
      case "cash_payment_added":
      case "online_payment_received":
        return <RefreshCw className="w-4 h-4 text-emerald-500" />;
      // Ledger activities
      case "expense_added":
      case "expense_deleted":
      case "ledger_entry_added":
      case "ledger_entry_deleted":
      case "income_added":
        return <RefreshCw className="w-4 h-4 text-amber-500" />;
      // Settings activities
      case "gym_info_updated":
      case "whatsapp_toggled":
      case "package_updated":
      case "package_added":
      case "package_deleted":
      case "branch_updated":
        return <ShieldCheck className="w-4 h-4 text-purple-500" />;
      default:
        return <RefreshCw className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getActivityBadge = (activityType: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      staff_added: { label: "Added", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      staff_deleted: { label: "Deleted", color: "bg-red-500/10 text-red-500 border-red-500/20" },
      staff_updated: { label: "Updated", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      staff_toggled: { label: "Status Changed", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
      staff_password_set: { label: "Password Set", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
      staff_password_updated: { label: "Password Updated", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
      staff_password_changed: { label: "Password Changed", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
      staff_permissions_updated: { label: "Permissions", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
      staff_logged_in: { label: "Logged In", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      staff_logged_out: { label: "Logged Out", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
      member_added: { label: "Member Added", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      member_updated: { label: "Member Updated", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      member_deleted: { label: "Member Deleted", color: "bg-red-500/10 text-red-500 border-red-500/20" },
      member_viewed: { label: "Member Viewed", color: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
      subscription_created: { label: "Subscription", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      subscription_renewed: { label: "Renewed", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      subscription_extended: { label: "Extended", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      cash_payment_added: { label: "Payment", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
      online_payment_received: { label: "Payment", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
      // Ledger activities
      expense_added: { label: "Expense Added", color: "bg-red-500/10 text-red-500 border-red-500/20" },
      expense_deleted: { label: "Expense Deleted", color: "bg-red-500/10 text-red-500 border-red-500/20" },
      income_added: { label: "Income Added", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      ledger_entry_added: { label: "Ledger Entry", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
      ledger_entry_deleted: { label: "Entry Deleted", color: "bg-red-500/10 text-red-500 border-red-500/20" },
      // Settings activities
      gym_info_updated: { label: "Settings Updated", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
      whatsapp_toggled: { label: "WhatsApp Toggle", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      package_updated: { label: "Package Updated", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      package_added: { label: "Package Added", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      package_deleted: { label: "Package Deleted", color: "bg-red-500/10 text-red-500 border-red-500/20" },
      branch_updated: { label: "Branch Updated", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
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

  const handleExport = () => {
    try {
      const exportData = filteredLogs.map((log) => ({
        Date: formatDateTime(log.created_at),
        Type: log.activity_type.replace(/_/g, " "),
        Description: log.description,
        "Staff Name": log.entity_name || "-",
        "Staff ID": log.entity_id || "-",
        "Old Value": log.old_value ? JSON.stringify(log.old_value) : "-",
        "New Value": log.new_value ? JSON.stringify(log.new_value) : "-",
      }));

      exportToExcel(exportData, "staff_activity_logs");
      toast.success("Export successful", {
        description: `Exported ${exportData.length} staff activity log(s) to Excel`,
      });
    } catch (error: any) {
      toast.error("Export failed", {
        description: error.message || "Failed to export staff activity logs",
      });
    }
  };

  const hasActiveFilters = searchQuery || typeFilter !== "all" || dateFrom || dateTo;

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
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
          <TabsTrigger value="logins">Login Attempts</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Activities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-accent">{stats.totalActivities}</div>
                <p className="text-xs text-muted-foreground mt-1">All staff activities</p>
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
                <CardTitle className="text-sm font-medium text-muted-foreground">Login Attempts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.loginAttempts}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.failedLogins > 0 && (
                    <span className="text-destructive">{stats.failedLogins} failed</span>
                  )}
                  {stats.failedLogins === 0 && "All successful"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Payments Recorded</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stats.paymentsRecorded}</div>
                <p className="text-xs text-muted-foreground mt-1">By staff members</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Activity Breakdown</CardTitle>
              <CardDescription>Staff performed activities summary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10">
                  <UserPlus className="w-5 h-5 text-success" />
                  <div>
                    <p className="text-sm font-medium">Members Added</p>
                    <p className="text-lg font-bold">{stats.membersAdded}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10">
                  <RefreshCw className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Members Updated</p>
                    <p className="text-lg font-bold">{stats.membersUpdated}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/10">
                  <Key className="w-5 h-5 text-accent" />
                  <div>
                    <p className="text-sm font-medium">Payments</p>
                    <p className="text-lg font-bold">{stats.paymentsRecorded}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/10">
                  <LogIn className="w-5 h-5 text-warning" />
                  <div>
                    <p className="text-sm font-medium">Login/Logout</p>
                    <p className="text-lg font-bold">{stats.loginLogout}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10">
                  <RefreshCw className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium">Ledger Entries</p>
                    <p className="text-lg font-bold">{stats.ledgerEntries}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10">
                  <ShieldCheck className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">Settings Changes</p>
                    <p className="text-lg font-bold">{stats.settingsChanges}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Staff Activity Logs</CardTitle>
              <CardDescription>Track activities performed by staff members (excluding admin actions)</CardDescription>
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
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Activity Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="staff_logged_in">Staff Logged In</SelectItem>
                    <SelectItem value="staff_logged_out">Staff Logged Out</SelectItem>
                    <SelectItem value="member_added">Member Added</SelectItem>
                    <SelectItem value="member_updated">Member Updated</SelectItem>
                    <SelectItem value="member_deleted">Member Deleted</SelectItem>
                    <SelectItem value="subscription_created">Subscription Created</SelectItem>
                    <SelectItem value="subscription_renewed">Subscription Renewed</SelectItem>
                    <SelectItem value="cash_payment_added">Payment Added</SelectItem>
                    <SelectItem value="expense_added">Expense Added</SelectItem>
                    <SelectItem value="expense_deleted">Expense Deleted</SelectItem>
                    <SelectItem value="gym_info_updated">Settings Updated</SelectItem>
                    <SelectItem value="whatsapp_toggled">WhatsApp Toggle</SelectItem>
                    <SelectItem value="package_updated">Package Updated</SelectItem>
                    <SelectItem value="branch_updated">Branch Updated</SelectItem>
                    <SelectItem value="staff_added">Staff Added</SelectItem>
                    <SelectItem value="staff_updated">Staff Updated</SelectItem>
                    <SelectItem value="staff_toggled">Status Changed</SelectItem>
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
                  Export
                </Button>
              </div>

              {/* Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No staff activity logs found
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
                          <TableCell>{getActivityBadge(log.activity_type)}</TableCell>
                          <TableCell>
                            <div className="max-w-md">
                              <p className="text-sm font-medium">{log.description}</p>
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

        <TabsContent value="logins" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Staff Login Attempts</CardTitle>
              <CardDescription>Monitor all staff login activity and security events</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="flex gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Login Attempts Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLoginAttempts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No login attempts found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLoginAttempts.map((attempt) => (
                        <TableRow key={attempt.id}>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(attempt.created_at)}
                          </TableCell>
                          <TableCell className="font-medium">{attempt.phone}</TableCell>
                          <TableCell>
                            {attempt.success ? (
                              <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                                <LogIn className="w-3 h-3 mr-1" />
                                Success
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {attempt.failure_reason ? (
                              <span className="text-sm text-destructive">{attempt.failure_reason}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {attempt.ip_address || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <p className="text-xs text-muted-foreground text-right">
                Showing {filteredLoginAttempts.length} of {loginAttempts.length} login attempts
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

export default StaffActivityLogsTab;
