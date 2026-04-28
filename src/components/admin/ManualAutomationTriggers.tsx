import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { getEdgeFunctionUrl, getEdgeFunctionHeaders } from "@/lib/supabaseConfig";
import { getAuthToken } from "@/api/authenticatedFetch";
import { useBranch } from "@/contexts/BranchContext";
import { BoltIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

type RunResult = {
  label: string;
  ok: boolean;
  attempted: number;
  sent: number;
  failed: number;
  skipped?: boolean;
  error?: string;
  ranAt: string;
};

export function ManualAutomationTriggers() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const { currentBranch } = useBranch();

  const pushResult = (r: RunResult) => setResults((prev) => [r, ...prev].slice(0, 6));

  const callEdge = async (fn: string, payload: Record<string, unknown>) => {
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(getEdgeFunctionUrl(fn), {
      method: "POST",
      headers: getEdgeFunctionHeaders(token),
      body: JSON.stringify(payload),
    });
    let body: any = null;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }
    return { ok: res.ok, status: res.status, body };
  };

  const handleSendReminders = async () => {
    if (!currentBranch?.id) {
      toast.error("No branch selected");
      return;
    }
    setIsRunning(true);
    const ranAt = new Date().toISOString();

    try {
      // Fire all three reminder paths sequentially.
      // 1+2: QStash-equivalent paths (expiring_soon + expired)
      // 3: daily-whatsapp-job (expiring_today + admin summary)
      const [expSoon, expired, today] = await Promise.all([
        callEdge("qstash-expiry-reminders", {
          branchId: currentBranch.id, kind: "expiring_soon", manual: true,
        }),
        callEdge("qstash-expiry-reminders", {
          branchId: currentBranch.id, kind: "expired", manual: true,
        }),
        callEdge("daily-whatsapp-job", { manual: true, branchId: currentBranch.id }),
      ]);

      const calls = [
        { label: "Expiring Soon", res: expSoon },
        { label: "Expired", res: expired },
        { label: "Expiring Today", res: today },
      ];

      let totalAttempted = 0, totalSent = 0, totalFailed = 0;
      const errors: string[] = [];

      for (const c of calls) {
        const b: any = c.res.body || {};
        const attempted = Number(b.attempted ?? b.notificationsSent ?? 0) + Number(b.failed ?? 0);
        const sent = Number(b.sent ?? b.notificationsSent ?? 0);
        const failed = Number(b.failed ?? 0);
        const skipped = b.skipped === true || typeof b.skipped === "string";
        totalAttempted += attempted;
        totalSent += sent;
        totalFailed += failed;
        if (!c.res.ok) errors.push(`${c.label}: ${b.error || `HTTP ${c.res.status}`}`);
        pushResult({
          label: `${c.label} — ${currentBranch.name}`,
          ok: c.res.ok, attempted, sent, failed, skipped,
          error: c.res.ok ? undefined : (b.error || `HTTP ${c.res.status}`),
          ranAt,
        });
      }

      if (errors.length > 0) {
        toast.error("Some reminders failed", { description: errors.join(" · ") });
      } else if (totalSent === 0 && totalAttempted === 0) {
        toast.info("No members matched the reminder criteria today");
      } else {
        toast.success(`Reminders sent: ${totalSent}`, {
          description: totalFailed > 0 ? `${totalFailed} failed` : "All delivered",
        });
      }
    } catch (e: any) {
      toast.error("Failed to run", { description: e?.message || String(e) });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="border border-border/40 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <PaperAirplaneIcon className="w-4 h-4 lg:w-5 lg:h-5" />
          </div>
          <div>
            <CardTitle className="text-base lg:text-xl">Send Reminders Now</CardTitle>
            <CardDescription className="text-xs lg:text-sm">
              Manually trigger the same daily reminder pipeline (expiring soon + today + expired) for <strong>{currentBranch?.name || "this branch"}</strong>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 lg:p-6 pt-0 lg:pt-0">
        <div className="flex items-center justify-between p-3 lg:p-4 bg-muted/20 border border-border/40 rounded-xl">
          <div className="space-y-0.5 flex-1 mr-3">
            <p className="text-xs lg:text-sm font-medium flex items-center gap-2">
              <BoltIcon className="w-3.5 h-3.5 text-orange-500" />
              Run reminder pipeline
            </p>
            <p className="text-[10px] lg:text-xs text-muted-foreground">
              Honors your WhatsApp auto-send settings. Duplicate-safe — members already reminded today will be skipped.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendReminders}
            disabled={isRunning}
            className="h-8 lg:h-9 text-xs lg:text-sm rounded-lg active:scale-[0.97] transition-all"
          >
            {isRunning ? <><ButtonSpinner /> Sending...</> : "▶ Send Reminders"}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-2 mt-2">
            <p className="text-xs font-medium text-muted-foreground">Recent Runs</p>
            {results.map((r, i) => (
              <div key={i} className="p-3 bg-muted/30 border border-border/40 rounded-lg space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium truncate">{r.label}</p>
                  <Badge
                    variant={r.ok ? "default" : "destructive"}
                    className={`text-[10px] ${r.ok ? (r.skipped ? "bg-muted text-muted-foreground" : "bg-emerald-600") : ""}`}
                  >
                    {!r.ok ? "Failed" : r.skipped ? "Skipped" : "Success"}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">{new Date(r.ranAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}</p>
                {r.ok ? (
                  !r.skipped && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <Badge variant="secondary" className="text-[10px]">Sent: {r.sent}</Badge>
                      {r.failed > 0 && <Badge variant="destructive" className="text-[10px]">Failed: {r.failed}</Badge>}
                      {r.attempted === 0 && <Badge variant="secondary" className="text-[10px]">No matches</Badge>}
                    </div>
                  )
                ) : (
                  <p className="text-[10px] text-destructive">{r.error}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground italic">
          💡 Reminders run automatically every day at 9:00 AM IST via Upstash QStash. Use this button to test or replay manually.
        </p>
      </CardContent>
    </Card>
  );
}
