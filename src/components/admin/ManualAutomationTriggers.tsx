import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { getEdgeFunctionUrl, getEdgeFunctionHeaders } from "@/lib/supabaseConfig";
import { getAuthToken } from "@/api/authenticatedFetch";
import { BoltIcon } from "@heroicons/react/24/outline";

export function ManualAutomationTriggers() {
  const [isRunningExpiry, setIsRunningExpiry] = useState(false);
  const [lastExpiryResult, setLastExpiryResult] = useState<any>(null);

  const handleRunExpiryReminder = async () => {
    setIsRunningExpiry(true);
    setLastExpiryResult(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(getEdgeFunctionUrl("daily-whatsapp-job"), {
        method: "POST",
        headers: getEdgeFunctionHeaders(token),
        body: JSON.stringify({ manual: true }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to run");

      setLastExpiryResult(result);
      
      if (result.skipped) {
        toast.info("Job already ran today", { description: "The daily expiry reminder was already executed." });
      } else {
        toast.success("Expiry reminders sent!", {
          description: `${result.notificationsSent} sent, ${result.failed} failed`,
        });
      }
    } catch (e: any) {
      toast.error("Failed to run automation", { description: e.message });
    } finally {
      setIsRunningExpiry(false);
    }
  };

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
              Test and manually trigger automated messaging jobs
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 lg:p-6 pt-0 lg:pt-0">
        {/* Expiry Reminder Trigger */}
        <div className="flex items-center justify-between p-3 lg:p-4 bg-muted/20 border border-border/40 rounded-xl">
          <div className="space-y-0.5 flex-1 mr-3">
            <p className="text-xs lg:text-sm font-medium">Expiry Reminder Job</p>
            <p className="text-[10px] lg:text-xs text-muted-foreground">
              Sends reminders to members with expiring/expired memberships
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

        {/* Last run result */}
        {lastExpiryResult && !lastExpiryResult.skipped && (
          <div className="p-3 bg-muted/30 border border-border/40 rounded-lg space-y-1.5 animate-fade-in">
            <p className="text-xs font-medium text-muted-foreground">Last Run Result</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                Expiring Soon: {lastExpiryResult.expiringSoon}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                Expiring Today: {lastExpiryResult.expiringToday}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                Expired: {lastExpiryResult.expiredReminders}
              </Badge>
              <Badge variant="default" className="text-[10px] bg-emerald-600">
                Sent: {lastExpiryResult.notificationsSent}
              </Badge>
              {lastExpiryResult.failed > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  Failed: {lastExpiryResult.failed}
                </Badge>
              )}
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground italic">
          💡 These jobs run automatically every day at 9:00 AM IST. Use manual triggers only for testing.
        </p>
      </CardContent>
    </Card>
  );
}
