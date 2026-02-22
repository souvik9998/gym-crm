import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { useBranch } from "@/contexts/BranchContext";
import { WHATSAPP_AUTO_SEND_DEFAULTS, type WhatsAppAutoSendType } from "@/utils/whatsappAutoSend";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

interface MessageTypeConfig {
  key: WhatsAppAutoSendType;
  label: string;
  description: string;
}

const MESSAGE_TYPES: MessageTypeConfig[] = [
  { key: "new_registration", label: "New Member Registration", description: "Send welcome message after a new member registers" },
  { key: "renewal", label: "Member Renewal", description: "Send confirmation after membership renewal" },
  { key: "daily_pass", label: "Daily Pass", description: "Send confirmation after daily pass purchase" },
  { key: "pt_extension", label: "PT Extension", description: "Send confirmation after personal training extension" },
  { key: "expiring_2days", label: "Expiring Soon (2 Days)", description: "Daily reminder for memberships expiring in 2 days" },
  { key: "expiring_today", label: "Expiring Today", description: "Daily reminder for memberships expiring today" },
  { key: "expired_reminder", label: "Expired Reminder", description: "Send reminder to members with expired memberships" },
  { key: "payment_details", label: "Payment Receipt", description: "Send payment receipt after successful payment" },
  { key: "admin_add_member", label: "Admin Add Member", description: "Send message when admin adds a member manually" },
];

export const WhatsAppAutoSendSettings = () => {
  const { currentBranch } = useBranch();
  const [preferences, setPreferences] = useState<Record<string, boolean>>(
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
          ...(data.whatsapp_auto_send as Record<string, boolean>),
        });
      }
    }
  };

  const handleToggle = async (key: WhatsAppAutoSendType, checked: boolean) => {
    if (!settingsId || !currentBranch?.id) return;

    setTogglingKey(key);
    const updated = { ...preferences, [key]: checked };

    const { error } = await supabase
      .from("gym_settings")
      .update({ whatsapp_auto_send: updated })
      .eq("id", settingsId)
      .eq("branch_id", currentBranch.id);

    if (error) {
      toast.error("Failed to update preference");
    } else {
      setPreferences(updated);
    }
    setTogglingKey(null);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cog6ToothIcon className="w-5 h-5 text-primary" />
          Auto-Send Preferences
        </CardTitle>
        <CardDescription>
          Choose which WhatsApp messages are sent automatically. Disabled messages can still be sent manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {MESSAGE_TYPES.map((type) => (
          <div
            key={type.key}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="space-y-0.5 flex-1 mr-4">
              <p className="text-sm font-medium">{type.label}</p>
              <p className="text-xs text-muted-foreground">{type.description}</p>
            </div>
            <Switch
              checked={preferences[type.key] ?? WHATSAPP_AUTO_SEND_DEFAULTS[type.key]}
              disabled={togglingKey === type.key}
              onCheckedChange={(checked) => handleToggle(type.key, checked)}
            />
          </div>
        ))}

        {/* Promotional - always manual */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="space-y-0.5 flex-1 mr-4">
            <p className="text-sm font-medium text-muted-foreground">Promotional</p>
            <p className="text-xs text-muted-foreground">Promotional messages can only be sent manually</p>
          </div>
          <Badge variant="secondary" className="text-xs">Manual Only</Badge>
        </div>
      </CardContent>
    </Card>
  );
};
