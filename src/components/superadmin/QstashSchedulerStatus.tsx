import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { ArrowPathIcon, ClockIcon } from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "date-fns";

interface ScheduleRow {
  id: string;
  branch_id: string;
  kind: string;
  schedule_id: string;
  cron_expression: string;
  last_synced_at: string;
}

interface BranchInfo {
  id: string;
  name: string;
}

interface QstashSchedulerStatusProps {
  tenantId: string;
  branches: BranchInfo[];
}

export const QstashSchedulerStatus = ({ tenantId, branches }: QstashSchedulerStatusProps) => {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    const branchIds = branches.map((b) => b.id);
    if (branchIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("qstash_schedules")
      .select("*")
      .in("branch_id", branchIds);
    if (error) {
      console.warn("Failed to fetch qstash schedules:", error);
    }
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, branches.length]);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke(
        "qstash-schedule-manager?action=sync-tenant",
        { body: { tenantId } },
      );
      if (error) throw error;
      toast.success("Reminder schedules re-synced with Upstash QStash");
      await fetchRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to sync";
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const byBranch = new Map<string, ScheduleRow[]>();
  for (const r of rows) {
    const list = byBranch.get(r.branch_id) || [];
    list.push(r);
    byBranch.set(r.branch_id, list);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-primary" />
            Reminder Scheduler (Upstash QStash)
          </CardTitle>
          <CardDescription>
            Daily expiry-reminder schedules for each branch. Runs at 09:00 IST. Toggle "Expiring Soon"
            or "Expired Reminder" inside a branch's WhatsApp settings to add/remove its schedule.
          </CardDescription>
        </div>
        <Button onClick={handleSyncAll} disabled={syncing} variant="outline" size="sm">
          <ArrowPathIcon className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Re-sync all"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No branches in this tenant.</p>
        ) : (
          <div className="space-y-2">
            {branches.map((branch) => {
              const list = byBranch.get(branch.id) || [];
              const hasSoon = list.some((r) => r.kind === "expiring_soon");
              const hasExpired = list.some((r) => r.kind === "expired");
              const lastSynced = list[0]?.last_synced_at;
              return (
                <div
                  key={branch.id}
                  className="flex items-center justify-between p-3 rounded-md border bg-muted/20"
                >
                  <div>
                    <p className="text-sm font-medium">{branch.name}</p>
                    {lastSynced && (
                      <p className="text-xs text-muted-foreground">
                        Last synced {formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={hasSoon ? "default" : "secondary"} className="text-[10px]">
                      Expiring Soon: {hasSoon ? "ON" : "off"}
                    </Badge>
                    <Badge variant={hasExpired ? "default" : "secondary"} className="text-[10px]">
                      Expired: {hasExpired ? "ON" : "off"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
