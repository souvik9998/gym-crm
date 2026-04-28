import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import {
  ArrowPathIcon,
  ClockIcon,
  BuildingOffice2Icon,
  BuildingStorefrontIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "date-fns";

interface TenantRow {
  id: string;
  name: string;
}

interface BranchRow {
  id: string;
  name: string;
  tenant_id: string;
}

interface SettingsRow {
  branch_id: string;
  whatsapp_enabled: boolean;
  whatsapp_auto_send: Record<string, unknown> | null;
}

interface ScheduleRow {
  branch_id: string;
  kind: string;
  last_synced_at: string;
}

interface TenantBlock {
  tenant: TenantRow;
  branches: Array<{
    branch: BranchRow;
    waEnabled: boolean;
    wantsExpSoon: boolean;
    wantsExpired: boolean;
    hasSoonSchedule: boolean;
    hasExpiredSchedule: boolean;
    lastSynced: string | null;
  }>;
}

export const PlatformQstashOverview = () => {
  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<TenantBlock[]>([]);
  const [search, setSearch] = useState("");
  const [busyTenant, setBusyTenant] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [tenantsRes, branchesRes] = await Promise.all([
      supabase.from("tenants").select("id, name").eq("is_active", true).order("name"),
      supabase
        .from("branches")
        .select("id, name, tenant_id")
        .eq("is_active", true)
        .is("deleted_at", null),
    ]);

    const tenants = (tenantsRes.data || []) as TenantRow[];
    const branches = (branchesRes.data || []) as BranchRow[];
    const branchIds = branches.map((b) => b.id);

    let settings: SettingsRow[] = [];
    let schedules: ScheduleRow[] = [];
    if (branchIds.length > 0) {
      const [sRes, qRes] = await Promise.all([
        supabase
          .from("gym_settings")
          .select("branch_id, whatsapp_enabled, whatsapp_auto_send")
          .in("branch_id", branchIds),
        supabase
          .from("qstash_schedules")
          .select("branch_id, kind, last_synced_at")
          .in("branch_id", branchIds),
      ]);
      settings = (sRes.data || []) as SettingsRow[];
      schedules = (qRes.data || []) as ScheduleRow[];
    }

    const settingsMap = new Map(settings.map((s) => [s.branch_id, s]));
    const schedMap = new Map<string, ScheduleRow[]>();
    for (const r of schedules) {
      const list = schedMap.get(r.branch_id) || [];
      list.push(r);
      schedMap.set(r.branch_id, list);
    }

    const out: TenantBlock[] = tenants.map((t) => {
      const tBranches = branches
        .filter((b) => b.tenant_id === t.id)
        .map((b) => {
          const s = settingsMap.get(b.id);
          const prefs = (s?.whatsapp_auto_send as Record<string, unknown>) || {};
          const list = schedMap.get(b.id) || [];
          return {
            branch: b,
            waEnabled: s?.whatsapp_enabled === true,
            wantsExpSoon: prefs.expiring_2days !== false,
            wantsExpired: prefs.expired_reminder === true,
            hasSoonSchedule: list.some((x) => x.kind === "expiring_soon"),
            hasExpiredSchedule: list.some((x) => x.kind === "expired"),
            lastSynced: list[0]?.last_synced_at || null,
          };
        });
      return { tenant: t, branches: tBranches };
    });

    setBlocks(out);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleSyncTenant = async (tenantId: string) => {
    setBusyTenant(tenantId);
    try {
      const { error } = await supabase.functions.invoke(
        "qstash-schedule-manager?action=sync-tenant",
        { body: { tenantId } },
      );
      if (error) throw error;
      toast.success("Tenant schedules synced");
      await fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusyTenant(null);
    }
  };

  const handleSyncAllTenants = async () => {
    setBulkSyncing(true);
    let success = 0;
    let failed = 0;
    try {
      for (const block of blocks) {
        try {
          const { error } = await supabase.functions.invoke(
            "qstash-schedule-manager?action=sync-tenant",
            { body: { tenantId: block.tenant.id } },
          );
          if (error) throw error;
          success++;
        } catch {
          failed++;
        }
      }
      if (failed === 0) toast.success(`Synced ${success} tenants`);
      else toast.warning(`Synced ${success} · ${failed} failed`);
      await fetchAll();
    } finally {
      setBulkSyncing(false);
    }
  };

  const filtered = blocks.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.tenant.name.toLowerCase().includes(q) ||
      b.branches.some((br) => br.branch.name.toLowerCase().includes(q))
    );
  });

  const totals = blocks.reduce(
    (acc, b) => {
      for (const br of b.branches) {
        acc.branches++;
        if (br.hasSoonSchedule) acc.soon++;
        if (br.hasExpiredSchedule) acc.expired++;
        if (br.waEnabled && (br.wantsExpSoon || br.wantsExpired)) acc.expected++;
      }
      return acc;
    },
    { branches: 0, soon: 0, expired: 0, expected: 0 },
  );

  const driftCount = blocks.reduce((acc, b) => {
    for (const br of b.branches) {
      const wantsAny = br.waEnabled && (br.wantsExpSoon || br.wantsExpired);
      const hasAny = br.hasSoonSchedule || br.hasExpiredSchedule;
      if (wantsAny !== hasAny) acc++;
      if (br.waEnabled && br.wantsExpSoon && !br.hasSoonSchedule) acc++;
      if (br.waEnabled && br.wantsExpired && !br.hasExpiredSchedule) acc++;
    }
    return acc;
  }, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-primary" />
              Platform Reminder Scheduler — All Tenants
            </CardTitle>
            <CardDescription className="mt-1.5">
              Branch-wise WhatsApp reminder schedules across every tenant. Each branch with a reminder toggle ON gets
              its own pair of QStash schedules firing daily at <strong>09:00 IST</strong>.
            </CardDescription>
          </div>
          <Button onClick={handleSyncAllTenants} disabled={bulkSyncing || blocks.length === 0} variant="default" size="sm">
            <ArrowPathIcon className={`w-4 h-4 mr-2 ${bulkSyncing ? "animate-spin" : ""}`} />
            {bulkSyncing ? "Syncing all..." : "Sync all tenants"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          <StatPill label="Tenants" value={blocks.length} />
          <StatPill label="Active branches" value={totals.branches} />
          <StatPill label="Schedules live" value={totals.soon + totals.expired} />
          <StatPill
            label="Drift"
            value={driftCount}
            tone={driftCount > 0 ? "warn" : "ok"}
            hint={driftCount > 0 ? "Re-sync needed" : "All in sync"}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tenant or branch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No tenants match.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((block) => {
              const enabledCount = block.branches.filter(
                (br) => br.waEnabled && (br.wantsExpSoon || br.wantsExpired),
              ).length;
              const liveCount = block.branches.filter(
                (br) => br.hasSoonSchedule || br.hasExpiredSchedule,
              ).length;
              return (
                <div key={block.tenant.id} className="border rounded-md overflow-hidden">
                  {/* Tenant header */}
                  <div className="flex items-center justify-between gap-3 p-3 bg-muted/30 border-b">
                    <div className="flex items-center gap-2 min-w-0">
                      <BuildingOffice2Icon className="w-4 h-4 text-primary shrink-0" />
                      <p className="text-sm font-semibold truncate">{block.tenant.name}</p>
                      <Badge variant="secondary" className="text-[10px]">
                        {liveCount}/{enabledCount} branches scheduled
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => handleSyncTenant(block.tenant.id)}
                      disabled={busyTenant === block.tenant.id}
                    >
                      <ArrowPathIcon
                        className={`w-3 h-3 mr-1 ${busyTenant === block.tenant.id ? "animate-spin" : ""}`}
                      />
                      {busyTenant === block.tenant.id ? "Syncing..." : "Sync tenant"}
                    </Button>
                  </div>

                  {/* Branches */}
                  {block.branches.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground italic">No active branches</p>
                  ) : (
                    <div className="divide-y">
                      {block.branches.map((br) => {
                        const wantsAny = br.waEnabled && (br.wantsExpSoon || br.wantsExpired);
                        return (
                          <div
                            key={br.branch.id}
                            className="flex items-center justify-between gap-3 p-2.5 px-3"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <BuildingStorefrontIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <p className="text-xs font-medium truncate">{br.branch.name}</p>
                              {!br.waEnabled && (
                                <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-700 dark:text-amber-300">
                                  WA off
                                </Badge>
                              )}
                              {wantsAny && br.lastSynced && (
                                <span className="text-[10px] text-muted-foreground hidden lg:inline">
                                  · {formatDistanceToNow(new Date(br.lastSynced), { addSuffix: true })}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <KindBadge label="Soon" wanted={br.wantsExpSoon && br.waEnabled} live={br.hasSoonSchedule} />
                              <KindBadge label="Expired" wanted={br.wantsExpired && br.waEnabled} live={br.hasExpiredSchedule} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
          <p className="text-[11px] text-muted-foreground leading-relaxed flex gap-2">
            <CheckCircleIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">Onboarding a new gym?</strong> Create the tenant + branches as usual,
              then in each branch's WhatsApp settings turn on "Expiring Soon" and/or "Expired Reminder". A schedule is
              created automatically. Use "Sync tenant" here only if a branch shows drift.
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

function StatPill({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "ok" | "warn";
  hint?: string;
}) {
  const toneCls =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "ok"
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-foreground";
  return (
    <div className="p-2.5 rounded-md bg-muted/30 border">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-semibold ${toneCls}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function KindBadge({ label, wanted, live }: { label: string; wanted: boolean; live: boolean }) {
  if (!wanted && !live) {
    return (
      <Badge variant="outline" className="text-[9px] text-muted-foreground">
        {label}: —
      </Badge>
    );
  }
  if (wanted && live) {
    return <Badge className="text-[9px] bg-emerald-600 hover:bg-emerald-600">{label}: ON</Badge>;
  }
  if (wanted && !live) {
    return (
      <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-700 dark:text-amber-300">
        {label}: drift
      </Badge>
    );
  }
  // live but not wanted (stale)
  return (
    <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-700 dark:text-amber-300">
      {label}: stale
    </Badge>
  );
}
