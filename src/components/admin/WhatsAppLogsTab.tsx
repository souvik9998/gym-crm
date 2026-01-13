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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  X,
  TrendingUp,
  Users,
  Send,
  Phone,
  Download,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { exportToExcel } from "@/utils/exportToExcel";
import { AnimatedCounter } from "@/components/ui/animated-counter";

interface WhatsAppLog {
  id: string;
  member_id: string | null;
  daily_pass_user_id: string | null;
  recipient_phone: string | null;
  recipient_name: string | null;
  notification_type: string;
  message_content: string | null;
  status: string;
  error_message: string | null;
  is_manual: boolean;
  admin_user_id: string | null;
  sent_at: string;
  member?: { name: string; phone: string } | null;
  daily_pass_user?: { name: string; phone: string } | null;
}

interface WhatsAppStats {
  totalMessages: number;
  sentMessages: number;
  failedMessages: number;
  manualMessages: number;
  automatedMessages: number;
  messagesByType: Record<string, number>;
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
}

interface WhatsAppLogsTabProps {
  refreshKey: number;
}

const WhatsAppLogsTab = ({ refreshKey }: WhatsAppLogsTabProps) => {
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [manualFilter, setManualFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState<WhatsAppStats>({
    totalMessages: 0,
    sentMessages: 0,
    failedMessages: 0,
    manualMessages: 0,
    automatedMessages: 0,
    messagesByType: {},
    messagesToday: 0,
    messagesThisWeek: 0,
    messagesThisMonth: 0,
  });
  const [activeSubTab, setActiveSubTab] = useState("logs");

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [refreshKey]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("whatsapp_notifications")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(1000);

      if (typeFilter !== "all") {
        query = query.eq("notification_type", typeFilter);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (manualFilter !== "all") {
        query = query.eq("is_manual", manualFilter === "manual");
      }
      if (dateFrom) {
        query = query.gte("sent_at", dateFrom + "T00:00:00Z");
      }
      if (dateTo) {
        query = query.lte("sent_at", dateTo + "T23:59:59Z");
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        setLogs([]);
        return;
      }

      // Get unique member IDs and daily pass user IDs
      const memberIds = [...new Set(data.map((log) => log.member_id).filter(Boolean))] as string[];
      const dailyPassUserIds = [...new Set(data.map((log) => log.daily_pass_user_id).filter(Boolean))] as string[];

      // Fetch member data
      let membersMap: Record<string, { name: string; phone: string }> = {};
      if (memberIds.length > 0) {
        try {
          const { data: membersData } = await supabase
            .from("members")
            .select("id, name, phone")
            .in("id", memberIds);
          if (membersData) {
            membersMap = membersData.reduce((acc, m) => {
              acc[m.id] = { name: m.name, phone: m.phone };
              return acc;
            }, {} as Record<string, { name: string; phone: string }>);
          }
        } catch (e) {
          console.warn("Error fetching members:", e);
        }
      }

      // Fetch daily pass user data
      let dailyPassUsersMap: Record<string, { name: string; phone: string }> = {};
      if (dailyPassUserIds.length > 0) {
        try {
          const { data: dailyPassUsersData } = await supabase
            .from("daily_pass_users")
            .select("id, name, phone")
            .in("id", dailyPassUserIds);
          if (dailyPassUsersData) {
            dailyPassUsersMap = dailyPassUsersData.reduce((acc, u) => {
              acc[u.id] = { name: u.name, phone: u.phone };
              return acc;
            }, {} as Record<string, { name: string; phone: string }>);
          }
        } catch (e) {
          console.warn("Error fetching daily pass users:", e);
        }
      }

      // Process logs with fetched data
      const processedLogs = data.map((log) => ({
        ...log,
        is_manual: log.is_manual ?? false,
        daily_pass_user_id: log.daily_pass_user_id ?? null,
        recipient_phone: log.recipient_phone ?? null,
        recipient_name: log.recipient_name ?? null,
        message_content: log.message_content ?? null,
        admin_user_id: log.admin_user_id ?? null,
        member: log.member_id ? membersMap[log.member_id] || null : null,
        daily_pass_user: log.daily_pass_user_id ? dailyPassUsersMap[log.daily_pass_user_id] || null : null,
      }));

      setLogs(processedLogs as WhatsAppLog[]);
    } catch (error: any) {
      console.error("Error fetching WhatsApp logs:", error);
      toast.error("Error fetching logs", {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: allLogs, error } = await supabase
        .from("whatsapp_notifications")
        .select("*")
        .order("sent_at", { ascending: false });

      if (error) {
        console.error("Error fetching stats:", error);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      const statsData: WhatsAppStats = {
        totalMessages: allLogs?.length || 0,
        sentMessages: allLogs?.filter((l) => l.status === "sent").length || 0,
        failedMessages: allLogs?.filter((l) => l.status === "failed").length || 0,
        manualMessages: allLogs?.filter((l) => l.is_manual === true).length || 0,
        automatedMessages: allLogs?.filter((l) => l.is_manual !== true).length || 0,
        messagesByType: {},
        messagesToday: 0,
        messagesThisWeek: 0,
        messagesThisMonth: 0,
      };

      allLogs?.forEach((log) => {
        statsData.messagesByType[log.notification_type] =
          (statsData.messagesByType[log.notification_type] || 0) + 1;

        const sentAt = new Date(log.sent_at);
        if (sentAt >= today) statsData.messagesToday++;
        if (sentAt >= weekAgo) statsData.messagesThisWeek++;
        if (sentAt >= monthAgo) statsData.messagesThisMonth++;
      });

      setStats(statsData);
    } catch (error: any) {
      console.error("Error fetching stats:", error);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [typeFilter, statusFilter, manualFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setManualFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filteredLogs = logs.filter((log) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = (log.recipient_name || log.member?.name || log.daily_pass_user?.name || "").toLowerCase();
      const phone = (log.recipient_phone || log.member?.phone || log.daily_pass_user?.phone || "").toLowerCase();

      if (!name.includes(query) && !phone.includes(query)) {
        return false;
      }
    }
    return true;
  });

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
        "Sent At": formatDateTime(log.sent_at),
        "Recipient Name": log.recipient_name || log.member?.name || log.daily_pass_user?.name || "-",
        "Recipient Phone": log.recipient_phone || log.member?.phone || log.daily_pass_user?.phone || "-",
        "Notification Type": log.notification_type,
        Status: log.status,
        "Is Manual": log.is_manual ? "Yes" : "No",
        "Message Content": log.message_content || "-",
      }));

      exportToExcel(exportData, "whatsapp_logs");
      toast.success("Export successful", {
        description: `Exported ${exportData.length} WhatsApp log(s) to Excel`,
      });
    } catch (error: any) {
      toast.error("Export failed", {
        description: error.message || "Failed to export WhatsApp logs",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-success/10 text-success border-success/20">Sent</Badge>;
      case "failed":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Failed</Badge>;
      case "pending":
        return <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      promotional: "Promotional",
      expiry_reminder: "Expiry Reminder",
      expired_reminder: "Expired Reminder",
      payment_details: "Payment Details",
      renewal: "Renewal",
      pt_extension: "PT Extension",
      expiring_2days: "Expiring in 2 Days",
      expiring_today: "Expiring Today",
      manual: "Manual",
      custom: "Custom",
      new_registration: "New Registration",
      new_member: "New Member",
      daily_pass: "Daily Pass",
    };
    return labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const hasActiveFilters =
    searchQuery || typeFilter !== "all" || statusFilter !== "all" || manualFilter !== "all" || dateFrom || dateTo;

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
          <TabsTrigger value="logs">Message Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-accent">
                  <AnimatedCounter value={stats.totalMessages} duration={800} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Sent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-success">
                  <AnimatedCounter value={stats.sentMessages} duration={900} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Successfully delivered</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-destructive">
                  <AnimatedCounter value={stats.failedMessages} duration={700} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Delivery failed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">
                  <AnimatedCounter value={stats.messagesToday} duration={600} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Messages today</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Manual vs Automated</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-accent" />
                    <span className="text-sm">Manual: <AnimatedCounter value={stats.manualMessages} duration={700} /></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-muted-foreground" />
                    <span className="text-sm">Automated: <AnimatedCounter value={stats.automatedMessages} duration={700} /></span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">By Period</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6">
                  <div className="text-center">
                    <p className="text-lg font-bold"><AnimatedCounter value={stats.messagesToday} duration={600} /></p>
                    <p className="text-xs text-muted-foreground">Today</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold"><AnimatedCounter value={stats.messagesThisWeek} duration={700} /></p>
                    <p className="text-xs text-muted-foreground">This Week</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold"><AnimatedCounter value={stats.messagesThisMonth} duration={800} /></p>
                    <p className="text-xs text-muted-foreground">This Month</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Message Logs</CardTitle>
              <CardDescription>Track all WhatsApp communications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="promotional">Promotional</SelectItem>
                    <SelectItem value="expiry_reminder">Expiry Reminder</SelectItem>
                    <SelectItem value="expired_reminder">Expired Reminder</SelectItem>
                    <SelectItem value="renewal">Renewal</SelectItem>
                    <SelectItem value="pt_extension">PT Extension</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={manualFilter} onValueChange={setManualFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automated">Automated</SelectItem>
                  </SelectContent>
                </Select>
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
                  className="gap-2 hover:bg-accent/50 transition-colors font-medium"
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
                      <TableHead>Recipient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No messages found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(log.sent_at)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">
                                {log.recipient_name || log.member?.name || log.daily_pass_user?.name || "-"}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {log.recipient_phone || log.member?.phone || log.daily_pass_user?.phone || "-"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getTypeLabel(log.notification_type)}</Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell>
                            <Badge variant={log.is_manual ? "default" : "secondary"}>
                              {log.is_manual ? "Manual" : "Auto"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <p className="text-xs text-muted-foreground text-right">
                Showing {filteredLogs.length} of {logs.length} messages
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WhatsAppLogsTab;
