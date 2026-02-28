import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useBranch } from "@/contexts/BranchContext";
import { WHATSAPP_AUTO_SEND_DEFAULTS, type WhatsAppAutoSendType } from "@/utils/whatsappAutoSend";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

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

  useEffect(() => {
    if (currentBranch?.id) {
      fetchPreferences();
    }
  }, [currentBranch?.id]);

  const fetchPreferences = async () => {
    if (!currentBranch?.id) return;

    const { data } = await supabase
      .from("gym_settings")
      .select("id, whatsapp_auto_send")
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

  const handleToggle = async (key: WhatsAppAutoSendType, checked: boolean) => {
    setTogglingKey(key);
    await updatePreferences({ ...preferences, [key]: checked });
    setTogglingKey(null);
  };

  const handleDaysChange = async (field: string, value: string) => {
    const days = Number(value);
    const updated = { ...preferences, [field]: days };
    await updatePreferences(updated);
    toast.success(`Updated to ${days} day${days > 1 ? "s" : ""}`);
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
        {MESSAGE_TYPES.map((type) => (
          <div
            key={type.key}
            className="flex items-center justify-between p-2 lg:p-3 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="space-y-0.5 flex-1 mr-3 lg:mr-4">
              <p className="text-xs lg:text-sm font-medium">{type.label}</p>
              <p className="text-[10px] lg:text-xs text-muted-foreground">{type.description}</p>
              {type.hasDaySelector && preferences[type.key] && (
                <div className="flex items-center gap-1.5 lg:gap-2 mt-1.5 lg:mt-2">
                  <span className="text-[10px] lg:text-xs text-muted-foreground">
                    Send
                  </span>
                  <Select
                    value={String(
                      type.hasDaySelector === "before"
                        ? preferences.expiring_days_before ?? DEFAULT_EXPIRING_DAYS
                        : preferences.expired_days_after ?? DEFAULT_EXPIRED_DAYS
                    )}
                    onValueChange={(val) =>
                      handleDaysChange(
                        type.hasDaySelector === "before" ? "expiring_days_before" : "expired_days_after",
                        val
                      )
                    }
                  >
                    <SelectTrigger className="h-6 lg:h-7 w-14 lg:w-16 text-[10px] lg:text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESET_DAYS.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] lg:text-xs text-muted-foreground">
                    {type.hasDaySelector === "before" ? "days before expiry" : "days after expiry"}
                  </span>
                </div>
              )}
            </div>
            <Switch
              checked={!whatsappEnabled ? false : (preferences[type.key] ?? WHATSAPP_AUTO_SEND_DEFAULTS[type.key])}
              disabled={!whatsappEnabled || togglingKey === type.key}
              onCheckedChange={(checked) => handleToggle(type.key, checked)}
            />
          </div>
        ))}

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
