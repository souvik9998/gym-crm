import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Clock,
  Search,
  Filter,
  X,
  Calendar,
  TrendingUp,
  Users,
  Send,
  User,
  Phone,
  RefreshCw,
  BarChart3,
  LogOut,
  Settings,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

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
  admin_user?: { email?: string } | null;
}

interface WhatsAppStats {
  totalMessages: number;
  sentMessages: number;
  failedMessages: number;
  manualMessages: number;
  automatedMessages: number;
  messagesByType: Record<string, number>;
  messagesByStatus: Record<string, number>;
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
}

const WhatsAppLogs = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [stats, setStats] = useState<WhatsAppStats>({
    totalMessages: 0,
    sentMessages: 0,
    failedMessages: 0,
    manualMessages: 0,
    automatedMessages: 0,
    messagesByType: {},
    messagesByStatus: {},
    messagesToday: 0,
    messagesThisWeek: 0,
    messagesThisMonth: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [manualFilter, setManualFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeTab, setActiveTab] = useState("logs");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/admin/login");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/admin/login");
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchLogs();
      fetchStats();
    }
  }, [user]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      // Build query - fetch without joins first to avoid relationship errors
      let query = supabase
        .from("whatsapp_notifications")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(1000);

      // Apply filters
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

      // Fetch daily pass user data if table exists
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
          console.warn("Error fetching daily pass users (table might not exist):", e);
        }
      }

      // Process logs with fetched data
      const processedLogs = data.map((log) => ({
        ...log,
        member: log.member_id ? membersMap[log.member_id] || null : null,
        daily_pass_user: log.daily_pass_user_id ? dailyPassUsersMap[log.daily_pass_user_id] || null : null,
        admin_user: null, // Can't query auth.users directly
      }));

      setLogs(processedLogs as WhatsAppLog[]);
    } catch (error: any) {
      console.error("Error fetching WhatsApp logs:", error);
      toast({
        title: "Error fetching logs",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      // Fetch all logs for statistics (without joins to avoid relationship errors)
      const { data: allLogs, error } = await supabase
        .from("whatsapp_notifications")
        .select("*")
        .order("sent_at", { ascending: false });

      if (error) {
        console.error("Error fetching stats:", error);
        // Don't throw - set default stats instead
        setStats({
          totalMessages: 0,
          sentMessages: 0,
          failedMessages: 0,
          manualMessages: 0,
          automatedMessages: 0,
          messagesByType: {},
          messagesByStatus: {},
          messagesToday: 0,
          messagesThisWeek: 0,
          messagesThisMonth: 0,
        });
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      const stats: WhatsAppStats = {
        totalMessages: allLogs?.length || 0,
        sentMessages: allLogs?.filter((l) => l.status === "sent").length || 0,
        failedMessages: allLogs?.filter((l) => l.status === "failed").length || 0,
        manualMessages: allLogs?.filter((l) => l.is_manual).length || 0,
        automatedMessages: allLogs?.filter((l) => !l.is_manual).length || 0,
        messagesByType: {},
        messagesByStatus: {},
        messagesToday: 0,
        messagesThisWeek: 0,
        messagesThisMonth: 0,
      };

      // Calculate stats
      allLogs?.forEach((log) => {
        // By type
        stats.messagesByType[log.notification_type] =
          (stats.messagesByType[log.notification_type] || 0) + 1;

        // By status
        stats.messagesByStatus[log.status] =
          (stats.messagesByStatus[log.status] || 0) + 1;

        // By date
        const sentAt = new Date(log.sent_at);
        if (sentAt >= today) {
          stats.messagesToday++;
        }
        if (sentAt >= weekAgo) {
          stats.messagesThisWeek++;
        }
        if (sentAt >= monthAgo) {
          stats.messagesThisMonth++;
        }
      });

      setStats(stats);
    } catch (error: any) {
      console.error("Error fetching stats:", error);
      // Set default stats on error to prevent crashes
      setStats({
        totalMessages: 0,
        sentMessages: 0,
        failedMessages: 0,
        manualMessages: 0,
        automatedMessages: 0,
        messagesByType: {},
        messagesByStatus: {},
        messagesToday: 0,
        messagesThisWeek: 0,
        messagesThisMonth: 0,
      });
    }
  };

  const handleRefresh = () => {
    fetchLogs();
    fetchStats();
    toast({ title: "Data refreshed" });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

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
      const message = (log.message_content || "").toLowerCase();

      if (!name.includes(query) && !phone.includes(query) && !message.includes(query)) {
        return false;
      }
    }
    return true;
  });

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
    };
    return labels[type] || type;
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

  const hasActiveFilters =
    searchQuery || typeFilter !== "all" || statusFilter !== "all" || manualFilter !== "all" || dateFrom || dateTo;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/dashboard")}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow overflow-hidden">
                <img
                  src="/logo.jpg"
                  alt="Icon"
                  className="w-full h-full object-cover rounded-xl"
                />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">WhatsApp Logs</h1>
                <p className="text-xs text-muted-foreground">Track all WhatsApp communications</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/analytics")}
                title="Analytics"
              >
                <BarChart3 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/settings")}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleRefresh}
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleSignOut}
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="stats">
              <TrendingUp className="w-4 h-4 mr-2" />
              Statistics
            </TabsTrigger>
            <TabsTrigger value="logs">
              <MessageSquare className="w-4 h-4 mr-2" />
              Message Logs
            </TabsTrigger>
          </TabsList>

          {/* Statistics Tab */}
          <TabsContent value="stats" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Messages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-accent">{stats.totalMessages}</div>
                  <p className="text-xs text-muted-foreground mt-1">All time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-success">
                    {stats.totalMessages > 0
                      ? Math.round((stats.sentMessages / stats.totalMessages) * 100)
                      : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.sentMessages} sent / {stats.failedMessages} failed
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Manual Messages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-primary">{stats.manualMessages}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.automatedMessages} automated
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-accent">{stats.messagesThisMonth}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.messagesThisWeek} this week, {stats.messagesToday} today
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Messages by Type */}
            <Card>
              <CardHeader>
                <CardTitle>Messages by Type</CardTitle>
                <CardDescription>Distribution of message types</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(stats.messagesByType)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{getTypeLabel(type)}</Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-32 bg-muted rounded-full h-2">
                            <div
                              className="bg-accent h-2 rounded-full"
                              style={{
                                width: `${(count / stats.totalMessages) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium w-12 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Messages by Status */}
            <Card>
              <CardHeader>
                <CardTitle>Messages by Status</CardTitle>
                <CardDescription>Success and failure breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-success" />
                      <span className="font-medium">Sent</span>
                    </div>
                    <span className="text-2xl font-bold text-success">{stats.sentMessages}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-destructive" />
                      <span className="font-medium">Failed</span>
                    </div>
                    <span className="text-2xl font-bold text-destructive">{stats.failedMessages}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-6 mt-6">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, phone, or message..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="promotional">Promotional</SelectItem>
                        <SelectItem value="expiry_reminder">Expiry Reminder</SelectItem>
                        <SelectItem value="expired_reminder">Expired Reminder</SelectItem>
                        <SelectItem value="payment_details">Payment Details</SelectItem>
                        <SelectItem value="renewal">Renewal</SelectItem>
                        <SelectItem value="pt_extension">PT Extension</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Source</label>
                    <Select value={manualFilter} onValueChange={setManualFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="automated">Automated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">From Date</label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">To Date</label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>

                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="gap-2">
                    <X className="w-4 h-4" />
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Apply Filters Button */}
            <Button onClick={fetchLogs} className="w-full md:w-auto gap-2">
              <Filter className="w-4 h-4" />
              Apply Filters
            </Button>

            {/* Results Summary */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {filteredLogs.length} of {logs.length} messages
              </span>
            </div>

            {/* Logs Table */}
            {filteredLogs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {hasActiveFilters ? "No messages found matching your filters" : "No WhatsApp messages logged yet"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Message Preview</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => {
                        const recipientName =
                          log.recipient_name || log.member?.name || log.daily_pass_user?.name || "Unknown";
                        const recipientPhone =
                          log.recipient_phone || log.member?.phone || log.daily_pass_user?.phone || "-";

                        return (
                          <TableRow key={log.id}>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                {formatDateTime(log.sent_at)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{recipientName}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {recipientPhone}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{getTypeLabel(log.notification_type)}</Badge>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(log.status)}
                              {log.error_message && (
                                <div className="text-xs text-destructive mt-1 max-w-xs truncate">
                                  {log.error_message}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {log.is_manual ? (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                  <User className="w-3 h-3 mr-1" />
                                  Manual
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-muted/50 border-muted">
                                  <Send className="w-3 h-3 mr-1" />
                                  Automated
                                </Badge>
                              )}
                              {log.is_manual && log.admin_user_id && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Admin ID: {log.admin_user_id.substring(0, 8)}...
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="max-w-md">
                                {log.message_content ? (
                                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                                    {log.message_content.length > 200 
                                      ? log.message_content.substring(0, 200) + "..."
                                      : log.message_content}
                                  </p>
                                ) : (
                                  <p className="text-sm text-muted-foreground italic">
                                    No message content available
                                  </p>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default WhatsAppLogs;
