import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { TableSkeleton } from "@/components/ui/skeleton-loaders";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import {
  CalendarClock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Send,
  Eye,
  Hourglass,
  Sparkles,
  Phone,
  ChevronRight,
  Activity,
} from "lucide-react";

interface Recipient {
  memberId?: string;
  name?: string;
  phone?: string;
  type?: string;
  status?: string;
  error?: string | null;
  sentAt?: string;
  expiryDate?: string;
}

interface SchedulerRun {
  id: string;
  branch_id: string | null;
  job_name: string;
  trigger_source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  total_attempted: number;
  total_sent: number;
  total_failed: number;
  expiring_soon_count: number;
  expiring_today_count: number;
  expired_count: number;
  recipients: Recipient[];
  metadata: Record<string, unknown>;
  error_message: string | null;
}

interface Props {
  refreshKey: number;
}

const formatDateTime = (s: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTime = (s: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (ms: number | null) => {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}m ${r}s`;
};

const jobLabel = (job: string) => {
  switch (job) {
    case "daily-whatsapp-job":
      return "Daily Job (Today + Expired)";
    case "qstash-expiring-soon":
      return "GymKloud · Expiring Soon";
    case "qstash-expired":
      return "GymKloud · Expired";
    default:
      return job;
  }
};

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "completed") {
    return (
      <Badge className="bg-success/10 text-success border-success/20 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Completed
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge className="bg-warning/10 text-warning border-warning/20 gap-1">
        <AlertTriangle className="w-3 h-3" /> Partial
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
        <XCircle className="w-3 h-3" /> Failed
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
};

const TriggerBadge = ({ source }: { source: string }) => {
  if (source === "manual") {
    return (
      <Badge variant="outline" className="gap-1 bg-accent/5 text-accent border-accent/20">
        <Sparkles className="w-3 h-3" /> Manual
      </Badge>
    );
  }
  if (source === "qstash") {
    return (
      <Badge variant="outline" className="gap-1">
        <Activity className="w-3 h-3" /> GymKloud
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <CalendarClock className="w-3 h-3" /> Cron
    </Badge>
  );
};

const TypePill = ({ type }: { type?: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    expiring_2days: { label: "Expiring Soon", cls: "bg-warning/10 text-warning border-warning/20" },
    expiring_today: { label: "Expiring Today", cls: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
    expired_reminder: { label: "Expired", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  };
  const v = map[type || ""] || { label: type || "—", cls: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={`text-[10px] ${v.cls}`}>{v.label}</Badge>;
};

const SchedulerRunsTab = ({ refreshKey }: Props) => {
  const { currentBranch } = useBranch();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [selected, setSelected] = useState<SchedulerRun | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-scheduler-runs", currentBranch?.id, refreshKey],
    enabled: !!currentBranch?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<SchedulerRun[]> => {
      const { data, error } = await supabase
        .from("whatsapp_scheduler_runs" as never)
        .select("*")
        .eq("branch_id", currentBranch!.id)
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as SchedulerRun[]) || [];
    },
  });

  useEffect(() => {
    if (refreshKey > 0) refetch();
  }, [refreshKey, refetch]);

  const runs = data || [];

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (jobFilter !== "all" && r.job_name !== jobFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const inRecips = (r.recipients || []).some(
          (rc) =>
            (rc.name || "").toLowerCase().includes(q) ||
            (rc.phone || "").toLowerCase().includes(q),
        );
        if (!inRecips && !jobLabel(r.job_name).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [runs, statusFilter, jobFilter, search]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRuns = runs.filter((r) => new Date(r.started_at) >= today);
    return {
      total: runs.length,
      todayRuns: todayRuns.length,
      sentToday: todayRuns.reduce((a, r) => a + (r.total_sent || 0), 0),
      failedToday: todayRuns.reduce((a, r) => a + (r.total_failed || 0), 0),
    };
  }, [runs]);

  if (isLoading) return <TableSkeleton rows={6} columns={5} />;

  return (
    <div className="space-y-4 lg:space-y-6 animate-fade-in">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <Card className="overflow-hidden hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="p-3 lg:p-6 pb-1 lg:pb-3">
            <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> Total Runs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
            <div className="text-xl lg:text-3xl font-bold text-accent">
              <AnimatedCounter value={stats.total} duration={700} />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">Last 100 runs</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="p-3 lg:p-6 pb-1 lg:pb-3">
            <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Hourglass className="w-3.5 h-3.5" /> Runs Today
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
            <div className="text-xl lg:text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats.todayRuns} duration={700} />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">Scheduler executions</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="p-3 lg:p-6 pb-1 lg:pb-3">
            <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Sent Today
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
            <div className="text-xl lg:text-3xl font-bold text-success">
              <AnimatedCounter value={stats.sentToday} duration={800} />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">Messages delivered</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="p-3 lg:p-6 pb-1 lg:pb-3">
            <CardTitle className="text-xs lg:text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Failed Today
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
            <div className="text-xl lg:text-3xl font-bold text-destructive">
              <AnimatedCounter value={stats.failedToday} duration={700} />
            </div>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">Sends failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Runs list */}
      <Card>
        <CardHeader className="p-3 lg:p-6 pb-2">
          <CardTitle className="text-base lg:text-xl flex items-center gap-2">
            <CalendarClock className="w-4 h-4 lg:w-5 lg:h-5 text-accent" />
            Scheduler Runs
          </CardTitle>
          <CardDescription className="text-xs lg:text-sm">
            Daily 9 AM IST runs and on-demand triggers ({filtered.length} shown)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3 lg:p-6 pt-0">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 lg:w-4 lg:h-4 text-muted-foreground" />
              <Input
                placeholder="Search recipient or job..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 lg:pl-10 h-8 lg:h-10 text-xs lg:text-sm"
              />
            </div>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-auto min-w-[140px] h-8 lg:h-10 text-xs lg:text-sm">
                <SelectValue placeholder="Job" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="daily-whatsapp-job">Daily Job</SelectItem>
                <SelectItem value="qstash-expiring-soon">QStash · Expiring Soon</SelectItem>
                <SelectItem value="qstash-expired">QStash · Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-auto min-w-[110px] h-8 lg:h-10 text-xs lg:text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground animate-fade-in">
              <CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No scheduler runs yet.</p>
              <p className="text-xs mt-1">Runs appear here automatically every day at 9 AM IST.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs">When</TableHead>
                      <TableHead className="text-xs">Job</TableHead>
                      <TableHead className="text-xs">Trigger</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-center">Sent</TableHead>
                      <TableHead className="text-xs text-center">Failed</TableHead>
                      <TableHead className="text-xs">Duration</TableHead>
                      <TableHead className="text-xs w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r, i) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors animate-fade-in"
                        style={{ animationDelay: `${Math.min(i * 25, 200)}ms` }}
                        onClick={() => setSelected(r)}
                      >
                        <TableCell className="text-xs">
                          <div className="font-medium">{formatDateTime(r.started_at)}</div>
                        </TableCell>
                        <TableCell className="text-xs">{jobLabel(r.job_name)}</TableCell>
                        <TableCell><TriggerBadge source={r.trigger_source} /></TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-center text-xs font-semibold text-success">
                          {r.total_sent}
                        </TableCell>
                        <TableCell className="text-center text-xs font-semibold text-destructive">
                          {r.total_failed}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDuration(r.duration_ms)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map((r, i) => (
                  <div
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border rounded-lg p-3 bg-card hover:bg-muted/30 active:scale-[0.99] transition-all animate-fade-in cursor-pointer"
                    style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{jobLabel(r.job_name)}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDateTime(r.started_at)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                      <TriggerBadge source={r.trigger_source} />
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-success font-semibold">✓ {r.total_sent} sent</span>
                      <span className="text-destructive font-semibold">✗ {r.total_failed} failed</span>
                      <span className="text-muted-foreground ml-auto">{formatDuration(r.duration_ms)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-accent" />
                  {jobLabel(selected.job_name)}
                </DialogTitle>
                <DialogDescription>
                  Started {formatDateTime(selected.started_at)} · Finished {formatTime(selected.finished_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 my-3">
                <div className="border rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Attempted</p>
                  <p className="text-xl font-bold">{selected.total_attempted}</p>
                </div>
                <div className="border rounded-lg p-2.5 text-center bg-success/5 border-success/20">
                  <p className="text-[10px] text-success uppercase tracking-wide">Sent</p>
                  <p className="text-xl font-bold text-success">{selected.total_sent}</p>
                </div>
                <div className="border rounded-lg p-2.5 text-center bg-destructive/5 border-destructive/20">
                  <p className="text-[10px] text-destructive uppercase tracking-wide">Failed</p>
                  <p className="text-xl font-bold text-destructive">{selected.total_failed}</p>
                </div>
                <div className="border rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Duration</p>
                  <p className="text-xl font-bold">{formatDuration(selected.duration_ms)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="outline" className="text-[11px]">
                  Soon: {selected.expiring_soon_count}
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  Today: {selected.expiring_today_count}
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  Expired: {selected.expired_count}
                </Badge>
                <TriggerBadge source={selected.trigger_source} />
                <StatusBadge status={selected.status} />
              </div>

              {selected.error_message && (
                <div className="mb-3 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-xs text-destructive">
                  {selected.error_message}
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Recipients ({(selected.recipients || []).length})
                </h4>
                {(selected.recipients || []).length === 0 ? (
                  <div className="text-xs text-muted-foreground italic p-3 border rounded-md bg-muted/20">
                    No recipients in this run.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                    {selected.recipients.map((rc, idx) => (
                      <div
                        key={`${rc.memberId || idx}-${idx}`}
                        className="flex items-center gap-2 p-2 border rounded-md text-xs hover:bg-muted/30 transition-colors animate-fade-in"
                        style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}
                      >
                        <div
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            rc.status === "sent" ? "bg-success" : "bg-destructive"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{rc.name || "Unknown"}</p>
                          {rc.phone && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5" /> {rc.phone}
                            </p>
                          )}
                          {rc.error && (
                            <p className="text-[11px] text-destructive truncate" title={rc.error}>
                              {rc.error}
                            </p>
                          )}
                        </div>
                        <TypePill type={rc.type} />
                        {rc.status === "sent" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        )}
                      </div>
                    ))}
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

export default SchedulerRunsTab;
