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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { exportToExcel } from "@/utils/exportToExcel";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useInfiniteWhatsAppLogsQuery, type WhatsAppLog } from "@/hooks/queries";
import { TableSkeleton, InfiniteScrollSkeleton } from "@/components/ui/skeleton-loaders";

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
  const { currentBranch } = useBranch();
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
  const [selectedMessage, setSelectedMessage] = useState<WhatsAppLog | null>(null);

  // Create filters object for the query
  const filters = useMemo(() => ({
    typeFilter: typeFilter !== "all" ? typeFilter : undefined,
    statusFilter: statusFilter !== "all" ? statusFilter : undefined,
    manualFilter: manualFilter !== "all" ? manualFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [typeFilter, statusFilter, manualFilter, dateFrom, dateTo]);

  // Use infinite query for paginated data
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteWhatsAppLogsQuery(filters);

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
        .from("whatsapp_notifications")
        .select("*")
        .eq("branch_id", currentBranch.id)
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

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setManualFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return allLogs;
    const query = searchQuery.toLowerCase();
    return allLogs.filter((log) => {
      const name = (log.recipient_name || log.member?.name || log.daily_pass_user?.name || "").toLowerCase();
      const phone = (log.recipient_phone || log.member?.phone || log.daily_pass_user?.phone || "").toLowerCase();
      return name.includes(query) || phone.includes(query);
    });
  }, [allLogs, searchQuery]);

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
  const isDataConfirmedEmpty = !isLoading && !isFetching && data !== undefined && filteredLogs.length === 0;

  if (showLoading) {
    return <TableSkeleton rows={8} columns={6} />;
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
              <CardDescription>Track all WhatsApp communications ({totalCount} total)</CardDescription>
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
                    <SelectItem value="payment_details">Payment Details</SelectItem>
                    <SelectItem value="new_registration">New Registration</SelectItem>
                    <SelectItem value="renewal">Renewal</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
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
                      <TableHead>Recipient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isDataConfirmedEmpty ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No WhatsApp logs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {filteredLogs.map((log) => (
                          <TableRow 
                            key={log.id} 
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setSelectedMessage(log)}
                          >
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatDateTime(log.sent_at)}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">
                                  {log.recipient_name || log.member?.name || log.daily_pass_user?.name || "-"}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {log.recipient_phone || log.member?.phone || log.daily_pass_user?.phone || "-"}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {getTypeLabel(log.notification_type)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={log.is_manual ? "secondary" : "outline"} className="text-xs">
                                {log.is_manual ? "Manual" : "Auto"}
                              </Badge>
                            </TableCell>
                            <TableCell>{getStatusBadge(log.status)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMessage(log);
                                }}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        
                        {/* Infinite scroll sentinel */}
                        {hasNextPage && (
                          <TableRow ref={loadMoreRef}>
                            <TableCell colSpan={6} className="p-0">
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

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Message Details
            </DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Recipient</p>
                  <p className="text-sm font-medium">
                    {selectedMessage.recipient_name || selectedMessage.member?.name || selectedMessage.daily_pass_user?.name || "-"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedMessage.recipient_phone || selectedMessage.member?.phone || selectedMessage.daily_pass_user?.phone || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sent At</p>
                  <p className="text-sm font-medium">{formatDateTime(selectedMessage.sent_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant="outline" className="mt-1">
                    {getTypeLabel(selectedMessage.notification_type)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedMessage.status)}</div>
                </div>
              </div>
              
              {selectedMessage.message_content && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Message Content</p>
                  <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">
                    {selectedMessage.message_content}
                  </div>
                </div>
              )}
              
              {selectedMessage.error_message && (
                <div>
                  <p className="text-xs text-destructive mb-1">Error Message</p>
                  <p className="text-sm text-destructive">{selectedMessage.error_message}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WhatsAppLogsTab;
