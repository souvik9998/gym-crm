import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartBarIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { getEdgeFunctionUrl, getEdgeFunctionHeaders } from "@/lib/supabaseConfig";
import { getAuthToken } from "@/api/authenticatedFetch";

interface ReportSchedule {
  id: string;
  is_enabled: boolean;
  frequency: string;
  report_email: string | null;
  send_whatsapp: boolean;
  whatsapp_phone: string | null;
  include_payments: boolean;
  include_memberships: boolean;
  include_attendance: boolean;
  include_trainers: boolean;
  include_branch_analysis: boolean;
  report_format: string;
  last_sent_at: string | null;
  next_run_at: string | null;
}

const REPORT_FORMATS = [
  { value: "excel", label: "Excel Report", icon: "📊", description: "Detailed spreadsheet with all data" },
  { value: "pdf", label: "PDF Report", icon: "📄", description: "Professional formatted PDF summary" },
  { value: "dashboard_link", label: "Dashboard Link", icon: "🔗", description: "Link to visual analytics dashboard" },
  { value: "whatsapp_summary", label: "WhatsApp Summary", icon: "💬", description: "Quick summary with report link via WhatsApp" },
];

export function AutomatedReportsSettings() {
  const { currentBranch } = useBranch();
  const [schedule, setSchedule] = useState<ReportSchedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);

  // Form state
  const [isEnabled, setIsEnabled] = useState(false);
  const [frequency, setFrequency] = useState("weekly");
  const [reportEmail, setReportEmail] = useState("");
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [includePayments, setIncludePayments] = useState(true);
  const [includeMemberships, setIncludeMemberships] = useState(true);
  const [includeAttendance, setIncludeAttendance] = useState(true);
  const [includeTrainers, setIncludeTrainers] = useState(true);
  const [includeBranchAnalysis, setIncludeBranchAnalysis] = useState(true);
  const [reportFormat, setReportFormat] = useState("excel");

  const fetchSchedule = useCallback(async () => {
    if (!currentBranch?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("report_schedules")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setSchedule(data as ReportSchedule);
        setIsEnabled(data.is_enabled);
        setFrequency(data.frequency);
        setReportEmail(data.report_email || "");
        setSendWhatsapp(data.send_whatsapp);
        setWhatsappPhone(data.whatsapp_phone || "");
        setIncludePayments(data.include_payments);
        setIncludeMemberships(data.include_memberships);
        setIncludeAttendance(data.include_attendance);
        setIncludeTrainers(data.include_trainers);
        setIncludeBranchAnalysis(data.include_branch_analysis);
        setReportFormat(data.report_format || "excel");
      }
    } catch (e) {
      console.error("Error fetching report schedule:", e);
    } finally {
      setIsLoading(false);
    }
  }, [currentBranch?.id]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  function calculateNextRun(freq: string): string {
    const next = new Date();
    next.setUTCHours(3, 30, 0, 0); // 9 AM IST
    switch (freq) {
      case "daily": next.setDate(next.getDate() + 1); break;
      case "weekly": next.setDate(next.getDate() + 7); break;
      case "monthly": next.setMonth(next.getMonth() + 1); break;
    }
    return next.toISOString();
  }

  const handleSave = async () => {
    if (!currentBranch?.id) return;
    if (isEnabled && !reportEmail) {
      toast.error("Please enter an email address to receive reports");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        branch_id: currentBranch.id,
        is_enabled: isEnabled,
        frequency,
        report_email: reportEmail || null,
        send_whatsapp: sendWhatsapp,
        whatsapp_phone: whatsappPhone || null,
        include_payments: includePayments,
        include_memberships: includeMemberships,
        include_attendance: includeAttendance,
        include_trainers: includeTrainers,
        include_branch_analysis: includeBranchAnalysis,
        report_format: reportFormat,
        next_run_at: isEnabled ? calculateNextRun(frequency) : null,
        updated_at: new Date().toISOString(),
      };

      if (schedule?.id) {
        const { error } = await supabase
          .from("report_schedules")
          .update(payload)
          .eq("id", schedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("report_schedules")
          .insert(payload);
        if (error) throw error;
      }

      toast.success("Report settings saved");
      fetchSchedule();
    } catch (e: any) {
      toast.error("Error saving settings", { description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendNow = async () => {
    if (!currentBranch?.id || !reportEmail) {
      toast.error("Please save settings with a valid email first");
      return;
    }
    setIsSendingNow(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(getEdgeFunctionUrl("generate-report"), {
        method: "POST",
        headers: getEdgeFunctionHeaders(token),
        body: JSON.stringify({
          branchId: currentBranch.id,
          frequency,
          reportEmail,
          sendWhatsapp,
          whatsappPhone: whatsappPhone || undefined,
          includePayments,
          includeMemberships,
          includeAttendance,
          includeTrainers,
          includeBranchAnalysis,
          reportFormat,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to generate report");

      if (result.emailSent) {
        toast.success("Report sent to your email!");
      } else {
        toast.warning("Report generated but email delivery failed. Check your email configuration.");
      }
    } catch (e: any) {
      toast.error("Error generating report", { description: e.message });
    } finally {
      setIsSendingNow(false);
    }
  };

  const hasChanges = schedule
    ? isEnabled !== schedule.is_enabled ||
      frequency !== schedule.frequency ||
      reportEmail !== (schedule.report_email || "") ||
      sendWhatsapp !== schedule.send_whatsapp ||
      whatsappPhone !== (schedule.whatsapp_phone || "") ||
      includePayments !== schedule.include_payments ||
      includeMemberships !== schedule.include_memberships ||
      includeAttendance !== schedule.include_attendance ||
      includeTrainers !== schedule.include_trainers ||
      includeBranchAnalysis !== schedule.include_branch_analysis ||
      reportFormat !== (schedule.report_format || "excel")
    : isEnabled || reportEmail;

  if (isLoading) {
    return (
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-muted animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-40 bg-muted rounded animate-pulse" />
              <div className="h-3 w-56 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border border-border/40 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <ChartBarIcon className="w-4 h-4 lg:w-5 lg:h-5" />
          </div>
          <div>
            <CardTitle className="text-base lg:text-xl">Automated Reports</CardTitle>
            <CardDescription className="text-xs lg:text-sm">
              Get periodic business reports delivered to your email
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 lg:space-y-5 p-4 lg:p-6 pt-0 lg:pt-0">
        {/* Enable toggle */}
        <div className="flex items-center justify-between p-3 lg:p-4 bg-muted/20 border border-border/40 rounded-xl transition-all duration-300 hover:shadow-sm hover:border-border/60">
          <div className="space-y-0.5 lg:space-y-1">
            <p className="font-semibold text-sm lg:text-base">Enable Reports</p>
            <p className="text-[10px] lg:text-sm text-muted-foreground">
              {isEnabled ? "Reports will be sent automatically" : "Reports are currently disabled"}
            </p>
          </div>
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
        </div>

        {/* Configuration - only show when enabled */}
        <div className={`space-y-4 transition-all duration-300 ${isEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {/* Frequency */}
          <div className="space-y-1.5 lg:space-y-2">
            <Label className="text-xs lg:text-sm font-medium">Report Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-10 lg:h-11 rounded-lg border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily (every morning)</SelectItem>
                <SelectItem value="weekly">Weekly (every Monday)</SelectItem>
                <SelectItem value="monthly">Monthly (1st of each month)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Email */}
          <div className="space-y-1.5 lg:space-y-2">
            <Label className="text-xs lg:text-sm font-medium flex items-center gap-1.5">
              <EnvelopeIcon className="w-3.5 h-3.5" />
              Report Email *
            </Label>
            <Input
              type="email"
              value={reportEmail}
              onChange={(e) => setReportEmail(e.target.value)}
              placeholder="owner@yourgym.com"
              className="h-10 lg:h-11 rounded-lg border-border/50 focus:border-primary/40 transition-colors"
            />
          </div>

          {/* WhatsApp notification */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/20 border border-border/40 rounded-xl">
              <div className="space-y-0.5">
                <p className="font-medium text-sm">WhatsApp Notification</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">Get notified on WhatsApp when a report is sent</p>
              </div>
              <Switch checked={sendWhatsapp} onCheckedChange={setSendWhatsapp} />
            </div>
            {sendWhatsapp && (
              <Input
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="10-digit phone number"
                maxLength={10}
                className="h-10 lg:h-11 rounded-lg border-border/50 focus:border-primary/40 transition-colors"
              />
            )}
          </div>

          {/* Report sections */}
          <div className="space-y-2">
            <Label className="text-xs lg:text-sm font-medium">Report Sections</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: "Payments & Revenue", checked: includePayments, onChange: setIncludePayments },
                { label: "Memberships", checked: includeMemberships, onChange: setIncludeMemberships },
                { label: "Attendance", checked: includeAttendance, onChange: setIncludeAttendance },
                { label: "Trainer Activity", checked: includeTrainers, onChange: setIncludeTrainers },
                { label: "Branch Analysis", checked: includeBranchAnalysis, onChange: setIncludeBranchAnalysis },
              ].map((section) => (
                <div
                  key={section.label}
                  className="flex items-center justify-between p-2.5 lg:p-3 bg-card border border-border/40 rounded-lg hover:border-border/60 transition-colors"
                >
                  <span className="text-xs lg:text-sm">{section.label}</span>
                  <Switch checked={section.checked} onCheckedChange={section.onChange} />
                </div>
              ))}
            </div>
          </div>

          {/* Last sent info */}
          {schedule?.last_sent_at && (
            <p className="text-[10px] lg:text-xs text-muted-foreground">
              Last report sent: {new Date(schedule.last_sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="flex-1 h-10 lg:h-11 text-sm rounded-xl active:scale-[0.98] transition-all duration-200"
          >
            {isSaving ? <><ButtonSpinner /> Saving...</> : "Save Report Settings"}
          </Button>
          <Button
            variant="outline"
            onClick={handleSendNow}
            disabled={isSendingNow || !reportEmail || !isEnabled}
            className="h-10 lg:h-11 text-sm rounded-xl active:scale-[0.98] transition-all duration-200"
          >
            {isSendingNow ? <><ButtonSpinner /> Generating...</> : "Send Report Now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
