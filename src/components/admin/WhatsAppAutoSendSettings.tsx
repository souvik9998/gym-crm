import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useBranch } from "@/contexts/BranchContext";
import { WHATSAPP_AUTO_SEND_DEFAULTS, type WhatsAppAutoSendType } from "@/utils/whatsappAutoSend";
import { Cog6ToothIcon, ClockIcon } from "@heroicons/react/24/outline";
import { TimePicker12h } from "@/components/ui/time-picker-12h";

interface MessageTypeConfig {
  key: WhatsAppAutoSendType;
  label: string;
  description: string;
  hasDaySelector?: "before" | "after";
}

const PRESET_DAYS = [1, 2, 3, 5, 7, 10, 15];

const MESSAGE_TYPES: MessageTypeConfig[] = [
  { key: "new_registration", label: "New Member Registration", description: "Send welcome message after a new member registers" },
  { key: "renewal", label: "Member Renewal", description: "Send confirmation after membership renewal" },
  { key: "daily_pass", label: "Daily Pass", description: "Send confirmation after daily pass purchase" },
  { key: "pt_extension", label: "PT Extension", description: "Send confirmation after personal training extension" },
  { key: "expiring_2days", label: "Expiring Soon Reminder", description: "Send reminder before membership expires", hasDaySelector: "before" },
  { key: "expiring_today", label: "Expiring Today", description: "Send reminder on the day membership expires" },
  { key: "expired_reminder", label: "Expired Reminder", description: "Send reminder after membership has expired", hasDaySelector: "after" },
  { key: "payment_details", label: "Payment Receipt", description: "Send payment receipt after successful payment" },
  { key: "admin_add_member", label: "Admin Add Member", description: "Send message when admin adds a member manually" },
];

const DEFAULT_EXPIRING_DAYS = 2;
const DEFAULT_EXPIRED_DAYS = 7;

const format12h = (hhmm: string): string => {
  const [hStr, mStr] = (hhmm || "09:00").split(":");
  const h = Number(hStr);
  const m = Number(mStr) || 0;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

interface WhatsAppAutoSendSettingsProps {
  whatsappEnabled?: boolean;
}

export const WhatsAppAutoSendSettings = ({ whatsappEnabled = true }: WhatsAppAutoSendSettingsProps) => {
  const { currentBranch } = useBranch();
  const [preferences, setPreferences] = useState<Record<string, any>>(
    { ...WHATSAPP_AUTO_SEND_DEFAULTS }
  );
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState<string>("09:00");
  const [savedReminderTime, setSavedReminderTime] = useState<string>("09:00");
  const [savingTime, setSavingTime] = useState(false);

  useEffect(() => {
    if (currentBranch?.id) {
      fetchPreferences();
    }
  }, [currentBranch?.id]);

  const fetchPreferences = async () => {
    if (!currentBranch?.id) return;

    const { data } = await supabase
      .from("gym_settings")
      .select("id, whatsapp_auto_send, reminder_time")
      .eq("branch_id", currentBranch.id)
      .maybeSingle();

    if (data) {
      setSettingsId(data.id);
      if (data.whatsapp_auto_send) {
        setPreferences({
          ...WHATSAPP_AUTO_SEND_DEFAULTS,
          expiring_days_before: DEFAULT_EXPIRING_DAYS,
          expired_days_after: DEFAULT_EXPIRED_DAYS,
          ...(data.whatsapp_auto_send as Record<string, any>),
        });
      }
      // reminder_time comes back as "HH:MM:SS"; trim to "HH:MM" for the input
      const t = (data.reminder_time as string | null) || "09:00:00";
      const hhmm = t.slice(0, 5);
      setReminderTime(hhmm);
      setSavedReminderTime(hhmm);
    }
  };

  const updatePreferences = async (updated: Record<string, any>) => {
    if (!settingsId || !currentBranch?.id) return false;

    const { error } = await supabase
      .from("gym_settings")
      .update({ whatsapp_auto_send: updated })
      .eq("id", settingsId)
      .eq("branch_id", currentBranch.id);

    if (error) {
      toast.error("Failed to update preference");
      return false;
    }
    setPreferences(updated);
    return true;
  };

  const syncQstashSchedules = async (updatedPrefs: Record<string, any>) => {
    if (!currentBranch?.id) return;
    const wantsExpiring = updatedPrefs.expiring_2days !== false;
    const wantsExpired = updatedPrefs.expired_reminder === true;
    const action = wantsExpiring || wantsExpired ? "upsert" : "delete";

    try {
      const { error } = await supabase.functions.invoke(
        `qstash-schedule-manager?action=${action}`,
        { body: { branchId: currentBranch.id } },
      );
      if (error) {
        console.warn("[qstash-sync] failed:", error);
      }
    } catch (err) {
      // Non-fatal — preferences are saved; scheduler can be re-synced from Super Admin
      console.warn("[qstash-sync] threw:", err);
    }
  };

  const handleToggle = async (key: WhatsAppAutoSendType, checked: boolean) => {
    setTogglingKey(key);
    const updated = { ...preferences, [key]: checked };
    const ok = await updatePreferences(updated);
    if (ok && (key === "expiring_2days" || key === "expired_reminder")) {
      await syncQstashSchedules(updated);
    }
    setTogglingKey(null);
  };

  const handleDaysChange = async (field: string, value: string) => {
    const days = Number(value);
    const updated = { ...preferences, [field]: days };
    const ok = await updatePreferences(updated);
    if (ok) {
      // Day-count change doesn't alter the cron, but re-sync ensures the schedule
      // body and last_synced_at stay current.
      await syncQstashSchedules(updated);
      toast.success(`Updated to ${days} day${days > 1 ? "s" : ""}`);
    }
  };

  const handleSaveReminderTime = async () => {
    if (!settingsId || !currentBranch?.id) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
      toast.error("Please enter a valid time (HH:MM, 24-hour).");
      return;
    }
    setSavingTime(true);
    const { error } = await supabase
      .from("gym_settings")
      .update({ reminder_time: `${reminderTime}:00` })
      .eq("id", settingsId)
      .eq("branch_id", currentBranch.id);

    if (error) {
      toast.error("Failed to update reminder time");
      setSavingTime(false);
      return;
    }
    setSavedReminderTime(reminderTime);
    // Re-sync QStash schedule with the new cron
    await syncQstashSchedules(preferences);
    toast.success(`Daily reminders will now be sent at ${reminderTime} IST`);
    setSavingTime(false);
  };

  return (
    <Card className={cn("border-0 shadow-sm", !whatsappEnabled && "opacity-60")}>
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <CardTitle className="flex items-center gap-2 text-base lg:text-xl">
          <Cog6ToothIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
          Auto-Send Preferences
        </CardTitle>
        <CardDescription className="text-xs lg:text-sm">
          {whatsappEnabled
            ? "Choose which WhatsApp messages are sent automatically. Disabled messages can still be sent manually."
            : "WhatsApp messaging is disabled. Enable the main WhatsApp toggle above to configure auto-send preferences."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 p-4 lg:p-6 pt-0 lg:pt-0">
        {/* Daily reminder time picker — branch-specific */}
        <div className="mb-3 p-3 lg:p-4 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent transition-all">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <ClockIcon className="w-4 h-4 lg:w-5 lg:h-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs lg:text-sm font-medium">Daily Reminder Time (IST)</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">
                  Set the time of day all expiry reminders go out for this branch.
                  Each branch can pick its own time.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-[150px]">
                <TimePicker12h
                  value={reminderTime}
                  onChange={(v) => setReminderTime(v)}
                  disabled={!whatsappEnabled || savingTime}
                  size="sm"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveReminderTime}
                disabled={!whatsappEnabled || savingTime || reminderTime === savedReminderTime}
                className="h-9 text-xs"
              >
                {savingTime ? "Saving..." : reminderTime === savedReminderTime ? "Saved" : "Save"}
              </Button>
            </div>
          </div>
          {reminderTime !== savedReminderTime && (
            <p className="text-[10px] lg:text-xs text-amber-600 dark:text-amber-400 mt-2 ml-6 animate-fade-in">
              Unsaved change — click Save to apply this schedule.
            </p>
          )}
          {reminderTime === savedReminderTime && whatsappEnabled && (
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-2 ml-6">
              ✓ Reminders are sent daily at <strong>{format12h(savedReminderTime)} IST</strong>.
            </p>
          )}
        </div>

        {MESSAGE_TYPES.map((type) => {
          const isEnabled = preferences[type.key] ?? WHATSAPP_AUTO_SEND_DEFAULTS[type.key];
          const showDaySelector = type.hasDaySelector && isEnabled;
          const dayValue =
            type.hasDaySelector === "before"
              ? preferences.expiring_days_before ?? DEFAULT_EXPIRING_DAYS
              : preferences.expired_days_after ?? DEFAULT_EXPIRED_DAYS;

          return (
            <div
              key={type.key}
              className="flex flex-col gap-2 p-2 lg:p-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 flex-1">
                  <p className="text-xs lg:text-sm font-medium">{type.label}</p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">{type.description}</p>
                </div>
                <Switch
                  checked={!whatsappEnabled ? false : isEnabled}
                  disabled={!whatsappEnabled || togglingKey === type.key}
                  onCheckedChange={(checked) => handleToggle(type.key, checked)}
                />
              </div>

              {showDaySelector && (
                <div className="ml-0 mt-1 p-2.5 lg:p-3 rounded-md bg-primary/5 border border-primary/15">
                  <p className="text-[10px] lg:text-xs font-medium text-foreground/80 mb-2">
                    {type.hasDaySelector === "before"
                      ? "How many days BEFORE expiry should we send this reminder?"
                      : "How many days AFTER expiry should we send this reminder?"}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={String(dayValue)}
                      onValueChange={(val) =>
                        handleDaysChange(
                          type.hasDaySelector === "before" ? "expiring_days_before" : "expired_days_after",
                          val
                        )
                      }
                    >
                      <SelectTrigger className="h-8 lg:h-9 w-24 text-xs lg:text-sm font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRESET_DAYS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} {d === 1 ? "day" : "days"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[11px] lg:text-xs text-muted-foreground">
                      {type.hasDaySelector === "before"
                        ? `→ Sent ${dayValue} day${dayValue > 1 ? "s" : ""} before the membership expires`
                        : `→ Sent ${dayValue} day${dayValue > 1 ? "s" : ""} after the membership expires`}
                    </span>
                  </div>
                  <p className="text-[10px] lg:text-[11px] text-muted-foreground mt-2 italic">
                    ✓ Each member receives this reminder only once per membership cycle.
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {/* Promotional - always manual */}
        <div className="flex items-center justify-between p-2 lg:p-3 rounded-lg bg-muted/30">
          <div className="space-y-0.5 flex-1 mr-3 lg:mr-4">
            <p className="text-xs lg:text-sm font-medium text-muted-foreground">Promotional</p>
            <p className="text-[10px] lg:text-xs text-muted-foreground">Promotional messages can only be sent manually</p>
          </div>
          <Badge variant="secondary" className="text-[10px] lg:text-xs">Manual Only</Badge>
        </div>
      </CardContent>
    </Card>
  );
};
