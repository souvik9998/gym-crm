import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { getEdgeFunctionUrl, getEdgeFunctionHeaders } from "@/lib/supabaseConfig";
import { getAuthToken } from "@/api/authenticatedFetch";
import { useBranch } from "@/contexts/BranchContext";
import { BoltIcon, BeakerIcon, ChartBarIcon } from "@heroicons/react/24/outline";

type RunResult = {
  label: string;
  ok: boolean;
  status: number;
  body: any;
  ranAt: string;
};

export function ManualAutomationTriggers() {
  const [isRunningExpiry, setIsRunningExpiry] = useState(false);
  const [isRunningReports, setIsRunningReports] = useState(false);
  const [isRunningTest, setIsRunningTest] = useState(false);
  // Pipeline state removed — per-branch only
  const [results, setResults] = useState<RunResult[]>([]);
  const { currentBranch } = useBranch();

  const pushResult = (r: RunResult) => setResults((prev) => [r, ...prev].slice(0, 6));

  const callEdge = async (fn: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: any }> => {
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(getEdgeFunctionUrl(fn), {
      method: "POST",
      headers: getEdgeFunctionHeaders(token),
      body: JSON.stringify(payload),
    });
    let body: any = null;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  };

  const handleRunExpiryReminder = async () => {
    if (!currentBranch?.id) {
      toast.error("No branch selected");
      return;
    }
    setIsRunningExpiry(true);
    try {
      const result = await callEdge("daily-whatsapp-job", { manual: true, branchId: currentBranch.id });
      pushResult({ label: `Expiry reminders (${currentBranch.name})`, ok: result.ok, status: result.status, body: result.body, ranAt: new Date().toISOString() });
      if (!result.ok) {
        toast.error("Expiry job failed", { description: result.body?.error || `HTTP ${result.status}` });
      } else if (result.body?.skipped) {
        toast.info("Already ran today");
      } else {
        toast.success("Expiry reminders sent", {
          description: `${result.body?.notificationsSent ?? 0} sent / ${result.body?.failed ?? 0} failed`,
        });
      }
    } catch (e: any) {
      toast.error("Failed to run", { description: e.message });
    } finally {
      setIsRunningExpiry(false);
    }
  };

  const handleRunReports = async () => {
    if (!currentBranch?.id) {
      toast.error("No branch selected");
      return;
    }
    setIsRunningReports(true);
    try {
      const result = await callEdge("scheduled-reports", { force: true, branchId: currentBranch.id });
      pushResult({ label: `Scheduled reports (${currentBranch.name})`, ok: result.ok, status: result.status, body: result.body, ranAt: new Date().toISOString() });
      if (!result.ok) {
        toast.error("Reports job failed", { description: result.body?.error || `HTTP ${result.status}` });
      } else {
        toast.success("Reports run complete", {
          description: `Processed: ${result.body?.processed ?? 0}, errors: ${result.body?.errors ?? 0}`,
        });
      }
    } catch (e: any) {
      toast.error("Failed to run", { description: e.message });
    } finally {
      setIsRunningReports(false);
    }
  };

  const handleTestWhatsApp = async () => {
    setIsRunningTest(true);
    try {
      const result = await callEdge("daily-whatsapp-job", { test_mode: true });
      pushResult({ label: "Test WhatsApp (admin number)", ok: result.ok, status: result.status, body: result.body, ranAt: new Date().toISOString() });
      if (result.ok) {
        toast.success("Test WhatsApp sent", { description: `Periskope status: ${result.body?.periskope_status}` });
      } else {
        toast.error("Test WhatsApp failed", { description: result.body?.error || `HTTP ${result.status}` });
      }
    } catch (e: any) {
      toast.error("Failed to test", { description: e.message });
    } finally {
      setIsRunningTest(false);
    }
  };

  // Removed: handleRunFullPipeline — automation is per-branch only


  return (
    <Card className="border border-border/40 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <BoltIcon className="w-4 h-4 lg:w-5 lg:h-5" />
          </div>
          <div>
            <CardTitle className="text-base lg:text-xl">Manual Automation Triggers</CardTitle>
            <CardDescription className="text-xs lg:text-sm">
              Test & manually trigger automation jobs for <strong>{currentBranch?.name || "current branch"}</strong>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 lg:p-6 pt-0 lg:pt-0">
        {/* Per-branch only — global pipeline removed */}


        {/* Per-branch Expiry Reminder */}
        <div className="flex items-center justify-between p-3 lg:p-4 bg-muted/20 border border-border/40 rounded-xl">
          <div className="space-y-0.5 flex-1 mr-3">
            <p className="text-xs lg:text-sm font-medium flex items-center gap-2">
              <BoltIcon className="w-3.5 h-3.5 text-orange-500" />
              Expiry Reminder Job (this branch)
            </p>
            <p className="text-[10px] lg:text-xs text-muted-foreground">
              Sends expiring-soon / today / expired reminders for {currentBranch?.name || "this branch"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunExpiryReminder}
            disabled={isRunningExpiry}
            className="h-8 lg:h-9 text-xs lg:text-sm rounded-lg active:scale-[0.97] transition-all"
          >
            {isRunningExpiry ? <><ButtonSpinner /> Running...</> : "▶ Run Now"}
          </Button>
        </div>

        {/* Per-branch Reports */}
        <div className="flex items-center justify-between p-3 lg:p-4 bg-muted/20 border border-border/40 rounded-xl">
          <div className="space-y-0.5 flex-1 mr-3">
            <p className="text-xs lg:text-sm font-medium flex items-center gap-2">
              <ChartBarIcon className="w-3.5 h-3.5 text-blue-500" />
              Scheduled Reports (this branch)
            </p>
            <p className="text-[10px] lg:text-xs text-muted-foreground">
              Force-runs the configured automated report for {currentBranch?.name || "this branch"} now
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunReports}
            disabled={isRunningReports}
            className="h-8 lg:h-9 text-xs lg:text-sm rounded-lg active:scale-[0.97] transition-all"
          >
            {isRunningReports ? <><ButtonSpinner /> Running...</> : "▶ Run Now"}
          </Button>
        </div>

        {/* Test WhatsApp */}
        <div className="flex items-center justify-between p-3 lg:p-4 bg-emerald-500/5 border border-emerald-500/30 rounded-xl">
          <div className="space-y-0.5 flex-1 mr-3">
            <p className="text-xs lg:text-sm font-medium flex items-center gap-2">
              <BeakerIcon className="w-3.5 h-3.5 text-emerald-600" />
              Send Test WhatsApp Message
            </p>
            <p className="text-[10px] lg:text-xs text-muted-foreground">
              Sends a single message to the configured admin number — confirms WhatsApp delivery is working
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestWhatsApp}
            disabled={isRunningTest}
            className="h-8 lg:h-9 text-xs lg:text-sm rounded-lg active:scale-[0.97] transition-all"
          >
            {isRunningTest ? <><ButtonSpinner /> Sending...</> : "▶ Send Test"}
          </Button>
        </div>

        {/* Recent results panel — friendly summary only */}
        {results.length > 0 && (
          <div className="space-y-2 mt-2">
            <p className="text-xs font-medium text-muted-foreground">Recent Runs</p>
            {results.map((r, i) => {
              const b: any = (r.body && typeof r.body === "object") ? r.body : {};
              const sent = b.notificationsSent ?? b.processed ?? (r.ok && b.test_mode ? 1 : 0);
              const failed = b.failed ?? b.errors ?? 0;
              const skipped = b.skipped === true;

              return (
                <div key={i} className="p-3 bg-muted/30 border border-border/40 rounded-lg space-y-1.5 animate-fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium truncate">{r.label}</p>
                    <Badge
                      variant={r.ok ? "default" : "destructive"}
                      className={`text-[10px] ${r.ok ? (skipped ? "bg-muted text-muted-foreground" : "bg-emerald-600") : ""}`}
                    >
                      {!r.ok ? "Failed" : skipped ? "Already ran today" : "Success"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{new Date(r.ranAt).toLocaleString()}</p>
                  {r.ok ? (
                    !skipped && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <Badge variant="secondary" className="text-[10px]">Sent: {sent}</Badge>
                        {failed > 0 && (
                          <Badge variant="destructive" className="text-[10px]">Failed: {failed}</Badge>
                        )}
                        {typeof b.branchesProcessed === "number" && (
                          <Badge variant="secondary" className="text-[10px]">Branches: {b.branchesProcessed}</Badge>
                        )}
                      </div>
                    )
                  ) : (
                    <p className="text-[10px] text-destructive">{b.error || `Request failed (${r.status})`}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground italic">
          💡 The cron pipeline runs automatically every day at 9:00 AM IST. Use these triggers for testing & ad-hoc runs.
        </p>
      </CardContent>
    </Card>
  );
}
