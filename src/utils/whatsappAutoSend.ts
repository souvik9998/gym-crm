import { supabase } from "@/integrations/supabase/client";

export type WhatsAppAutoSendType =
  | "new_registration"
  | "renewal"
  | "daily_pass"
  | "pt_extension"
  | "expiring_2days"
  | "expiring_today"
  | "expired_reminder"
  | "payment_details"
  | "admin_add_member";

const DEFAULTS: Record<WhatsAppAutoSendType, boolean> = {
  new_registration: true,
  renewal: true,
  daily_pass: true,
  pt_extension: true,
  expiring_2days: true,
  expiring_today: true,
  expired_reminder: false,
  payment_details: false,
  admin_add_member: true,
};

export async function getWhatsAppAutoSendPreference(
  branchId: string | undefined | null,
  type: WhatsAppAutoSendType
): Promise<boolean> {
  if (!branchId) return DEFAULTS[type];

  try {
    const { data } = await supabase
      .from("gym_settings")
      .select("whatsapp_auto_send")
      .eq("branch_id", branchId)
      .maybeSingle();

    if (!data?.whatsapp_auto_send) return DEFAULTS[type];

    const prefs = data.whatsapp_auto_send as Record<string, boolean>;
    return prefs[type] ?? DEFAULTS[type];
  } catch {
    return DEFAULTS[type];
  }
}

export { DEFAULTS as WHATSAPP_AUTO_SEND_DEFAULTS };
