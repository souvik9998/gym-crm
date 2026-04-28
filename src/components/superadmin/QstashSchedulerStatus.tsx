import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { ArrowPathIcon, ClockIcon, BoltIcon, TrashIcon, BuildingStorefrontIcon, PowerIcon } from "@heroicons/react/24/outline";
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

interface BranchSettings {
  branch_id: string;
  whatsapp_enabled: boolean;
  whatsapp_auto_send: Record<string, unknown> | null;
  reminder_time: string | null;
}

interface QstashSchedulerStatusProps {
  tenantId: string;
  branches: BranchInfo[];
}

export const QstashSchedulerStatus = ({ tenantId, branches }: QstashSchedulerStatusProps) => {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [settingsByBranch, setSettingsByBranch] = useState<Map<string, BranchSettings>>(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [perBranchBusy, setPerBranchBusy] = useState<Record<string, "upsert" | "delete" | null>>({});
  const [schedulerEnabled, setSchedulerEnabled] = useState<boolean>(true);
  const [togglingScheduler, setTogglingScheduler] = useState(false);

  const branchIds = branches.map((b) => b.id);

  const fetchData = async () => {
    setLoading(true);

    // Tenant-level scheduler flag (defaults to true if no row exists)
    const { data: tmc } = await supabase
      .from("tenant_messaging_config")
      .select("qstash_scheduler_enabled")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    setSchedulerEnabled(tmc?.qstash_scheduler_enabled !== false);

    if (branchIds.length === 0) {
      setRows([]);
      setSettingsByBranch(new Map());
      setLoading(false);
      return;
    }

    const [schedulesRes, settingsRes] = await Promise.all([
      supabase.from("qstash_schedules").select("*").in("branch_id", branchIds),
      supabase
        .from("gym_settings")
        .select("branch_id, whatsapp_enabled, whatsapp_auto_send, reminder_time")
        .in("branch_id", branchIds),
    ]);

    if (schedulesRes.error) console.warn("schedules fetch failed:", schedulesRes.error);
    setRows(schedulesRes.data || []);

    const map = new Map<string, BranchSettings>();
    for (const s of (settingsRes.data || []) as BranchSettings[]) {
      map.set(s.branch_id, s);
    }
    setSettingsByBranch(map);
    setLoading(false);
  };

  const handleToggleScheduler = async (next: boolean) => {
    setTogglingScheduler(true);
    const previous = schedulerEnabled;
    setSchedulerEnabled(next); // optimistic

    const { error } = await supabase
      .from("tenant_messaging_config")
      .upsert(
        { tenant_id: tenantId, qstash_scheduler_enabled: next },
        { onConflict: "tenant_id" },
      );

    if (error) {
      setSchedulerEnabled(previous);
      toast.error("Failed to update scheduler toggle");
      setTogglingScheduler(false);
      return;
    }

    // Re-sync to immediately wipe (or restore) all branch schedules
    try {
      await supabase.functions.invoke("qstash-schedule-manager?action=sync-tenant", {
        body: { tenantId },
      });
      toast.success(
        next
          ? "Auto reminders enabled — schedules created for all eligible branches"
          : "Auto reminders disabled — all schedules removed",
      );
    } catch (err) {
      toast.error("Saved, but re-sync failed. Use 'Re-sync tenant' to retry.");
    }
    await fetchData();
    setTogglingScheduler(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, branches.length]);

  const handleSyncTenant = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke(
        "qstash-schedule-manager?action=sync-tenant",
        { body: { tenantId } },
      );
      if (error) throw error;
      toast.success("All branch schedules re-synced with QStash");
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to sync";
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handleBranchAction = async (branchId: string, action: "upsert" | "delete") => {
    setPerBranchBusy((p) => ({ ...p, [branchId]: action }));
    try {
      const { error } = await supabase.functions.invoke(
        `qstash-schedule-manager?action=${action}`,
        { body: { branchId } },
      );
      if (error) throw error;
      toast.success(action === "upsert" ? "Branch schedules created/refreshed" : "Branch schedules removed");
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : `${action} failed`;
      toast.error(msg);
    } finally {
      setPerBranchBusy((p) => ({ ...p, [branchId]: null }));
    }
  };

  // Group schedules by branch
  const byBranch = new Map<string, ScheduleRow[]>();
  for (const r of rows) {
    const list = byBranch.get(r.branch_id) || [];
    list.push(r);
    byBranch.set(r.branch_id, list);
  }

  const totalSchedules = rows.length;
  const branchesWithSchedules = byBranch.size;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex-1">
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-primary" />
            WhatsApp Reminder Scheduler (Branch-wise)
          </CardTitle>
          <CardDescription className="mt-1.5 space-y-1">
            <span className="block">
              Each branch gets its own pair of QStash schedules — one for <strong>Expiring Soon</strong> and one for{" "}
              <strong>Expired</strong> reminders. The exact send time is controlled by each branch's
              <strong> Daily Reminder Time</strong> in their WhatsApp settings (defaults to 09:00 IST).
            </span>
            <span className="block text-xs">
              {branchesWithSchedules} of {branches.length} branches active · {totalSchedules} schedules registered
            </span>
          </CardDescription>
        </div>
        <Button onClick={handleSyncTenant} disabled={syncing || branches.length === 0 || !schedulerEnabled} variant="outline" size="sm">
          <ArrowPathIcon className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Re-sync tenant"}
        </Button>
      </CardHeader>
      <CardContent>
        {/* Tenant-wide kill switch */}
        <div
          className={`mb-4 p-3 lg:p-4 rounded-lg border transition-all ${
            schedulerEnabled
              ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/10"
              : "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/10"
          }`}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <PowerIcon
                className={`w-5 h-5 mt-0.5 shrink-0 ${
                  schedulerEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                }`}
              />
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-semibold">Automated WhatsApp Reminders</p>
                <p className="text-[11px] lg:text-xs text-muted-foreground">
                  {schedulerEnabled
                    ? "Daily QStash schedules will run for every branch in this tenant that has WhatsApp + reminder toggles enabled."
                    : "All QStash schedules for this tenant are paused. Members will not receive any automated expiry reminders until you turn this back on."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant={schedulerEnabled ? "default" : "secondary"}
                className={`text-[10px] ${schedulerEnabled ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
              >
                {schedulerEnabled ? "ON" : "OFF"}
              </Badge>
              <Switch
                checked={schedulerEnabled}
                disabled={togglingScheduler}
                onCheckedChange={handleToggleScheduler}
                aria-label="Toggle automated WhatsApp scheduler"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : branches.length === 0 ? (
          <div className="p-6 text-center bg-muted/20 rounded-md border border-dashed">
            <BuildingStorefrontIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No branches yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Once this tenant creates a branch and enables WhatsApp, schedules will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {branches.map((branch) => {
              const list = byBranch.get(branch.id) || [];
              const hasSoon = list.some((r) => r.kind === "expiring_soon");
              const hasExpired = list.some((r) => r.kind === "expired");
              const lastSynced = list[0]?.last_synced_at;
              const settings = settingsByBranch.get(branch.id);
              const waEnabled = settings?.whatsapp_enabled === true;
              const prefs = (settings?.whatsapp_auto_send as Record<string, unknown>) || {};
              const wantsExpSoon = prefs.expiring_2days !== false;
              const wantsExpired = prefs.expired_reminder === true;
              const wantsAny = waEnabled && (wantsExpSoon || wantsExpired);
              const busy = perBranchBusy[branch.id];

              return (
                <div
                  key={branch.id}
                  className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 p-3 rounded-md border bg-muted/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <BuildingStorefrontIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium truncate">{branch.name}</p>
                      {!waEnabled && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300">
                          WhatsApp OFF
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 ml-6">
                      {wantsAny ? (
                        <>
                          Sends:{" "}
                          {wantsExpSoon && (
                            <span>
                              Expiring (
                              {(prefs.expiring_days_before as number) ?? 2}d before)
                            </span>
                          )}
                          {wantsExpSoon && wantsExpired && " · "}
                          {wantsExpired && (
                            <span>
                              Expired ({(prefs.expired_days_after as number) ?? 7}d after)
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="italic">No reminders enabled in branch settings</span>
                      )}
                      {lastSynced && (
                        <>
                          {" · "}synced {formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={hasSoon ? "default" : "secondary"}
                      className={`text-[10px] ${hasSoon ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                    >
                      Expiring Soon: {hasSoon ? "ON" : "off"}
                    </Badge>
                    <Badge
                      variant={hasExpired ? "default" : "secondary"}
                      className={`text-[10px] ${hasExpired ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                    >
                      Expired: {hasExpired ? "ON" : "off"}
                    </Badge>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!!busy || !wantsAny}
                      onClick={() => handleBranchAction(branch.id, "upsert")}
                      title={wantsAny ? "Create or refresh this branch's schedules" : "Enable WhatsApp + a reminder toggle in branch settings first"}
                    >
                      <BoltIcon className="w-3 h-3 mr-1" />
                      {busy === "upsert" ? "Syncing..." : "Sync"}
                    </Button>
                    {(hasSoon || hasExpired) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-destructive hover:text-destructive"
                        disabled={!!busy}
                        onClick={() => handleBranchAction(branch.id, "delete")}
                      >
                        <TrashIcon className="w-3 h-3 mr-1" />
                        {busy === "delete" ? "..." : "Remove"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 p-3 rounded-md bg-primary/5 border border-primary/20">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">How it scales:</strong> Each new branch a tenant creates gets its own
            isolated pair of schedules the moment a reminder toggle is turned ON in that branch's WhatsApp settings.
            Schedules are tagged with the branch ID, so different gyms, branches, and reminder types never overlap.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
