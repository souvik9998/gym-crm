// Provider-agnostic WhatsApp send module.
//
// Resolves the active provider for a tenant (Periskope or Zavu), decrypts its
// credentials, sends the message in the provider's native format, and increments
// the tenant's monthly WhatsApp usage on success.
//
// All edge functions that need to send WhatsApp should call sendWhatsAppForTenant()
// instead of hitting Periskope/Zavu directly.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decrypt } from "./encryption.ts";

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

export type MessageCategory =
  | "new_registration"
  | "renewal"
  | "daily_pass"
  | "pt_extension"
  | "expiring_2days"
  | "expiring_today"
  | "expired_reminder"
  | "payment_details"
  | "admin_add_member"
  | "promotional"
  | "staff_credentials"
  | "event_confirmation"
  | "invoice_link"
  | "check_in"
  | "password_reset"
  | "daily_summary_admin";

export type ProviderName = "periskope" | "zavu" | "none";

export interface SendArgs {
  /** E.164-style digits without '+'. e.g. "919876543210". */
  toPhone: string;
  category: MessageCategory;
  /** Variables for template (Zavu) or simple substitution. Keys must match the per-category mapping below. */
  variables: Record<string, string>;
  /** Free-text message used by Periskope. Built by the caller (existing generators stay as-is). */
  fallbackText: string;
  /** Optional document/media attachment metadata for providers/templates that support media headers. */
  document?: { url: string; filename: string; mimeType?: string };
  /**
   * Optional CTA url to deliver to the user (e.g. invoice link).
   * For Zavu, this is sent as a follow-up cta_url session message after the template,
   * so the link reaches the user even when their approved template body has no link slot.
   */
  ctaUrl?: { url: string; displayText: string; text?: string };
  branchId?: string | null;
  /** Optional tenant override; otherwise resolved from branchId. */
  tenantId?: string | null;
}

export interface SendResult {
  success: boolean;
  error?: string;
  provider: ProviderName;
}

// -------------------------------------------------------------------------
// Per-category positional variable mapping (Zavu / WhatsApp templates)
// The order here determines {{1}}, {{2}}, ... in the template body.
// Surface this list in the Super Admin UI so they create matching templates.
// -------------------------------------------------------------------------

export const ZAVU_TEMPLATE_VARIABLES: Record<MessageCategory, string[]> = {
  new_registration:    ["name", "expiry_date", "branch_name"],
  renewal:             ["name", "expiry_date", "branch_name"],
  daily_pass:          ["name", "expiry_date", "branch_name"],
  pt_extension:        ["name", "expiry_date", "branch_name"],
  expiring_2days:      ["name", "expiry_date", "branch_name"],
  expiring_today:      ["name", "expiry_date", "branch_name"],
  expired_reminder:    ["name", "days_expired", "branch_name"],
  payment_details:     ["name", "amount", "payment_date", "payment_mode", "expiry_date", "branch_name"],
  admin_add_member:    ["name", "expiry_date", "branch_name"],
  promotional:         ["name", "branch_name"],
  staff_credentials:   ["name", "phone", "password", "role", "branches", "branch_name"],
  event_confirmation:  ["name", "event_title", "event_date", "branch_name"],
  // Template: gk_invoice_link_only — {{1}}=name, {{2}}=amount, {{3}}=date, {{4}}=invoice_link, {{5}}=team_name
  invoice_link:        ["name", "amount", "payment_date", "invoice_link", "branch_name"],
  check_in:            ["name", "check_in_time", "branch_name"],
  password_reset:      ["name", "reset_link", "branch_name"],
  daily_summary_admin: ["summary_text"],
};

// User-friendly metadata for the Super Admin UI
export const MESSAGE_CATEGORIES: Array<{
  key: MessageCategory;
  label: string;
  description: string;
  group: string;
}> = [
  { key: "new_registration",    group: "Member Lifecycle", label: "New Registration",   description: "Welcome message after a new member joins." },
  { key: "renewal",             group: "Member Lifecycle", label: "Membership Renewal", description: "Confirmation after a renewal payment." },
  { key: "daily_pass",          group: "Member Lifecycle", label: "Daily Pass",          description: "Daily-pass purchase confirmation." },
  { key: "pt_extension",        group: "Member Lifecycle", label: "PT Extension",        description: "Personal-training extension confirmation." },
  { key: "admin_add_member",    group: "Member Lifecycle", label: "Admin Added Member",  description: "Sent when an admin adds a member manually." },

  { key: "expiring_2days",      group: "Reminders",        label: "Expiring Soon",       description: "Reminder N days before membership expires." },
  { key: "expiring_today",      group: "Reminders",        label: "Expiring Today",      description: "Reminder on the day membership expires." },
  { key: "expired_reminder",    group: "Reminders",        label: "Expired Reminder",    description: "Follow-up after membership expired." },

  { key: "payment_details",     group: "Operational",      label: "Payment Receipt",     description: "Receipt after a successful payment." },
  { key: "invoice_link",        group: "Operational",      label: "Invoice Link",        description: "Branded invoice link share." },
  { key: "event_confirmation",  group: "Operational",      label: "Event Confirmation",  description: "Sent after event registration." },
  { key: "check_in",            group: "Operational",      label: "Check-in",            description: "Check-in confirmation (if enabled)." },

  { key: "promotional",         group: "Manual / Admin",   label: "Promotional",         description: "Promotional broadcast (manual only)." },
  { key: "staff_credentials",   group: "Manual / Admin",   label: "Staff Credentials",   description: "Login credentials sent to new staff." },
  { key: "password_reset",      group: "Manual / Admin",   label: "Password Reset",      description: "Password-reset link." },
  { key: "daily_summary_admin", group: "Manual / Admin",   label: "Daily Admin Summary", description: "Daily owner/admin summary message." },
];

// -------------------------------------------------------------------------
// Internal: tenant config cache (one per request lifecycle)
// -------------------------------------------------------------------------

interface TenantMessagingConfig {
  active_provider: ProviderName;
  periskope_api_key_encrypted: string | null;
  periskope_api_key_iv: string | null;
  periskope_phone: string | null;
  zavu_api_key_encrypted: string | null;
  zavu_api_key_iv: string | null;
  zavu_sender_id: string | null;
  zavu_templates: Record<string, string>;
}

interface ResolvedConfig {
  tenantId: string | null;
  config: TenantMessagingConfig | null;
}

const tenantByBranchCache = new Map<string, string | null>();
const configByTenantCache = new Map<string, TenantMessagingConfig | null>();

async function resolveTenantId(
  serviceClient: SupabaseClient,
  branchId: string | null | undefined,
): Promise<string | null> {
  if (!branchId) return null;
  if (tenantByBranchCache.has(branchId)) return tenantByBranchCache.get(branchId)!;
  try {
    const { data } = await serviceClient.rpc("get_tenant_from_branch", { _branch_id: branchId });
    const tId = (data as string | null) ?? null;
    tenantByBranchCache.set(branchId, tId);
    return tId;
  } catch (e) {
    console.warn("[whatsapp-provider] failed to resolve tenant from branch:", branchId, e);
    tenantByBranchCache.set(branchId, null);
    return null;
  }
}

async function loadConfig(
  serviceClient: SupabaseClient,
  tenantId: string,
): Promise<TenantMessagingConfig | null> {
  if (configByTenantCache.has(tenantId)) return configByTenantCache.get(tenantId)!;
  const { data, error } = await serviceClient
    .from("tenant_messaging_config")
    .select(
      "active_provider, periskope_api_key_encrypted, periskope_api_key_iv, periskope_phone, " +
        "zavu_api_key_encrypted, zavu_api_key_iv, zavu_sender_id, zavu_templates",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.warn("[whatsapp-provider] failed to load messaging config:", error);
    configByTenantCache.set(tenantId, null);
    return null;
  }

  const cfg = (data as TenantMessagingConfig | null) ?? null;
  configByTenantCache.set(tenantId, cfg);
  return cfg;
}

// -------------------------------------------------------------------------
// Provider senders
// -------------------------------------------------------------------------

function formatToWithPlus(toPhone: string): string {
  const digits = toPhone.replace(/\D/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

async function sendViaPeriskope(
  apiKey: string,
  fromPhone: string,
  toPhone: string,
  message: string,
): Promise<SendResult> {
  try {
    const response = await fetch("https://api.periskope.app/v1/message/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-phone": fromPhone,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: `${toPhone.replace(/\D/g, "")}@c.us`,
        message,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      return { success: false, provider: "periskope", error: `Periskope ${response.status} - ${text}` };
    }
    return { success: true, provider: "periskope" };
  } catch (err: unknown) {
    return { success: false, provider: "periskope", error: (err as Error).message };
  }
}

async function fetchZavuMessageStatus(
  apiKey: string,
  messageId: string,
): Promise<{ status?: string; errorCode?: string; errorMessage?: string } | null> {
  try {
    const res = await fetch(`https://api.zavu.dev/v1/messages/${encodeURIComponent(messageId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null) as { message?: Record<string, unknown> } | null;
    const m = body?.message as Record<string, unknown> | undefined;
    if (!m) return null;
    return {
      status: typeof m.status === "string" ? m.status : undefined,
      errorCode: typeof m.errorCode === "string" ? m.errorCode : undefined,
      errorMessage: typeof m.errorMessage === "string" ? m.errorMessage : undefined,
    };
  } catch {
    return null;
  }
}

const zavuTemplateVariableCountCache = new Map<string, number | null>();

function countTemplatePlaceholders(value: unknown): number {
  if (typeof value === "string") {
    const matches = Array.from(value.matchAll(/{{\s*(\d+|[a-zA-Z_][\w.]*)\s*}}/g));
    return matches.reduce((max, match) => {
      const token = match[1];
      const numeric = /^\d+$/.test(token) ? Number(token) : 0;
      return Math.max(max, numeric || matches.indexOf(match) + 1);
    }, 0);
  }
  if (Array.isArray(value)) {
    return value.reduce((max, item) => Math.max(max, countTemplatePlaceholders(item)), 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (max, item) => Math.max(max, countTemplatePlaceholders(item)),
      0,
    );
  }
  return 0;
}

async function getZavuTemplateVariableCount(apiKey: string, templateId: string): Promise<number | null> {
  if (zavuTemplateVariableCountCache.has(templateId)) return zavuTemplateVariableCountCache.get(templateId)!;
  try {
    const res = await fetch(`https://api.zavu.dev/v1/templates/${encodeURIComponent(templateId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      zavuTemplateVariableCountCache.set(templateId, null);
      return null;
    }
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    const template = (body?.template ?? body) as Record<string, unknown> | null;
    const variables = template?.variables;
    const count = Array.isArray(variables) && variables.length > 0
      ? variables.length
      : countTemplatePlaceholders(template);
    const normalized = count > 0 ? count : null;
    zavuTemplateVariableCountCache.set(templateId, normalized);
    return normalized;
  } catch {
    zavuTemplateVariableCountCache.set(templateId, null);
    return null;
  }
}

/**
 * Send a WhatsApp CTA URL message via Zavu (session message).
 *
 * Used to follow up an approved template send with a tappable button that
 * opens a URL (e.g. the invoice link). Works inside the 24h customer-care
 * window WhatsApp opens automatically after a template is delivered.
 */
async function sendZavuCtaUrl(
  apiKey: string,
  senderId: string | null,
  toPhone: string,
  cta: { url: string; displayText: string; text?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    if (senderId) headers["Zavu-Sender"] = senderId;

    const response = await fetch("https://api.zavu.dev/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: formatToWithPlus(toPhone),
        channel: "whatsapp",
        messageType: "cta_url",
        text: cta.text || "Tap below to view your invoice.",
        content: {
          ctaDisplayText: cta.displayText.substring(0, 20), // WhatsApp limits CTA text to 20 chars
          ctaUrl: cta.url,
        },
      }),
    });

    const rawText = await response.text();
    if (!response.ok) {
      return { ok: false, error: `Zavu cta_url ${response.status} - ${rawText.substring(0, 300)}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}

async function sendViaZavu(
  apiKey: string,
  senderId: string | null,
  toPhone: string,
  templateId: string,
  variables: Record<string, string>,
  variableOrder: string[],
  document?: { url: string; filename: string; mimeType?: string },
  ctaUrl?: { url: string; displayText: string; text?: string },
): Promise<SendResult> {
  if (document?.url) {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      if (senderId) headers["Zavu-Sender"] = senderId;

      const response = await fetch("https://api.zavu.dev/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: formatToWithPlus(toPhone),
          channel: "whatsapp",
          messageType: "document",
          text: variables.invoice_number ? `Invoice ${variables.invoice_number}` : "Invoice PDF",
          content: {
            mediaUrl: document.url,
            filename: document.filename,
            mimeType: document.mimeType || "application/pdf",
          },
        }),
      });

      const rawText = await response.text();
      if (!response.ok) {
        return { success: false, provider: "zavu", error: `Zavu ${response.status} - ${rawText.substring(0, 400)}` };
      }
      return { success: true, provider: "zavu" };
    } catch (err: unknown) {
      return { success: false, provider: "zavu", error: (err as Error).message };
    }
  }

  const templateVariableCount = await getZavuTemplateVariableCount(apiKey, templateId);
  const effectiveVariableOrder = templateVariableCount
    ? variableOrder.slice(0, templateVariableCount)
    : variableOrder;
  const templateVariables: Record<string, string> = {};
  effectiveVariableOrder.forEach((key, i) => {
    templateVariables[String(i + 1)] = variables[key] ?? "";
  });

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    if (senderId) headers["Zavu-Sender"] = senderId;

    const content: Record<string, unknown> = { templateId, templateVariables };
    if (document?.url) {
      content.mediaUrl = document.url;
      content.filename = document.filename;
      content.mimeType = document.mimeType || "application/pdf";
    }

    const response = await fetch("https://api.zavu.dev/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: formatToWithPlus(toPhone),
        channel: "whatsapp",
        messageType: "template",
        content,
      }),
    });

    const rawText = await response.text();
    if (!response.ok) {
      return { success: false, provider: "zavu", error: `Zavu ${response.status} - ${rawText.substring(0, 400)}` };
    }

    // Parse the accept response. Zavu returns 202 with { message: { id, status, errorCode?, errorMessage? } }.
    // An immediate errorCode/errorMessage or a "failed" status means the send was rejected even though HTTP was 2xx.
    let parsed: { message?: Record<string, unknown> } | null = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Non-JSON success body — treat as accepted.
      return { success: true, provider: "zavu" };
    }

    const msg = (parsed?.message ?? {}) as Record<string, unknown>;
    const initialStatus = typeof msg.status === "string" ? msg.status.toLowerCase() : "";
    const initialErrCode = typeof msg.errorCode === "string" ? msg.errorCode : "";
    const initialErrMsg = typeof msg.errorMessage === "string" ? msg.errorMessage : "";
    const messageId = typeof msg.id === "string" ? msg.id : "";

    if (initialStatus === "failed" || initialErrCode || initialErrMsg) {
      const detail = initialErrMsg || initialErrCode || `status=${initialStatus || "unknown"}`;
      return { success: false, provider: "zavu", error: `Zavu rejected: ${detail}` };
    }

    // Poll once to catch fast-fail cases (e.g. parameter-count mismatch resolved within ~1-2s).
    if (messageId) {
      // Two short polls so we catch immediate provider rejections without delaying the request too long.
      for (const delayMs of [1200, 1500]) {
        await new Promise((r) => setTimeout(r, delayMs));
        const status = await fetchZavuMessageStatus(apiKey, messageId);
        if (!status) continue;
        const s = (status.status ?? "").toLowerCase();
        if (s === "failed" || status.errorCode || status.errorMessage) {
          const detail = status.errorMessage || status.errorCode || `status=${s || "unknown"}`;
          return { success: false, provider: "zavu", error: `Zavu delivery failed: ${detail}` };
        }
        // Once we reach a non-pending state, we're done.
        if (s && s !== "queued" && s !== "sending" && s !== "pending" && s !== "accepted") {
          break;
        }
      }
    }

    // Template accepted. If the caller supplied a CTA URL (e.g. invoice link),
    // follow up with a cta_url session message so the user gets a tappable
    // button even when the approved template body has no link slot.
    // Failure of the follow-up does NOT fail the overall send.
    if (ctaUrl?.url) {
      const followUp = await sendZavuCtaUrl(apiKey, senderId, toPhone, ctaUrl);
      if (!followUp.ok) {
        console.warn("[whatsapp-provider] Zavu cta_url follow-up failed:", followUp.error);
      }
    }

    return { success: true, provider: "zavu" };
  } catch (err: unknown) {
    return { success: false, provider: "zavu", error: (err as Error).message };
  }
}

// -------------------------------------------------------------------------
// Public: resolve provider config (used by both runtime sends and verification)
// -------------------------------------------------------------------------

export async function resolveTenantMessagingConfig(
  serviceClient: SupabaseClient,
  branchId: string | null | undefined,
  tenantIdOverride?: string | null,
): Promise<ResolvedConfig> {
  const tenantId = tenantIdOverride ?? (await resolveTenantId(serviceClient, branchId));
  if (!tenantId) return { tenantId: null, config: null };
  const config = await loadConfig(serviceClient, tenantId);
  return { tenantId, config };
}

// -------------------------------------------------------------------------
// Public: main send entrypoint
// -------------------------------------------------------------------------

export async function sendWhatsAppForTenant(
  serviceClient: SupabaseClient,
  args: SendArgs,
): Promise<SendResult> {
  const { tenantId, config } = await resolveTenantMessagingConfig(
    serviceClient,
    args.branchId,
    args.tenantId,
  );

  // Fallback path — no per-tenant config yet → use global Periskope env (preserves prior behaviour).
  const envApiKey = Deno.env.get("PERISKOPE_API_KEY");
  const envFromPhone = Deno.env.get("PERISKOPE_PHONE");
  const encryptionKey = Deno.env.get("RAZORPAY_ENCRYPTION_KEY");

  const provider: ProviderName = config?.active_provider ?? "periskope";

  let result: SendResult;

  if (provider === "none") {
    result = { success: false, provider: "none", error: "Messaging disabled for this tenant" };
  } else if (provider === "zavu") {
    if (!config?.zavu_api_key_encrypted || !config?.zavu_api_key_iv || !encryptionKey) {
      result = { success: false, provider: "zavu", error: "Zavu credentials not configured" };
    } else {
      const templateId = (config.zavu_templates ?? {})[args.category];
      if (!templateId) {
        result = {
          success: false,
          provider: "zavu",
          error: `zavu_template_not_configured:${args.category}`,
        };
      } else {
        try {
          const apiKey = await decrypt(
            config.zavu_api_key_encrypted,
            config.zavu_api_key_iv,
            encryptionKey,
          );
          result = await sendViaZavu(
            apiKey,
            config.zavu_sender_id,
            args.toPhone,
            templateId,
            args.variables,
            ZAVU_TEMPLATE_VARIABLES[args.category],
            args.document,
            args.ctaUrl,
          );
        } catch (err: unknown) {
          result = { success: false, provider: "zavu", error: `Zavu decrypt failed: ${(err as Error).message}` };
        }
      }
    }
  } else {
    // Periskope (per-tenant if available, else fallback to env vars)
    let apiKey: string | null = null;
    let fromPhone: string | null = null;

    if (config?.periskope_api_key_encrypted && config?.periskope_api_key_iv && encryptionKey) {
      try {
        apiKey = await decrypt(
          config.periskope_api_key_encrypted,
          config.periskope_api_key_iv,
          encryptionKey,
        );
        fromPhone = config.periskope_phone ?? envFromPhone ?? null;
      } catch (err: unknown) {
        console.warn("[whatsapp-provider] periskope decrypt failed, falling back to env:", err);
      }
    }
    if (!apiKey) apiKey = envApiKey ?? null;
    if (!fromPhone) fromPhone = envFromPhone ?? null;

    if (!apiKey || !fromPhone) {
      result = { success: false, provider: "periskope", error: "Periskope credentials not configured" };
    } else {
      result = await sendViaPeriskope(apiKey, fromPhone, args.toPhone, args.fallbackText);
    }
  }

  // Track usage on success — same accounting for both providers.
  if (result.success && tenantId) {
    try {
      await serviceClient.rpc("increment_whatsapp_usage", { _tenant_id: tenantId, _count: 1 });
    } catch (e) {
      console.error("[whatsapp-provider] failed to increment usage:", e);
    }
  }

  return result;
}

// -------------------------------------------------------------------------
// Public: provider verification helpers (used by tenant-operations)
// -------------------------------------------------------------------------

export async function verifyPeriskopeCredentials(
  apiKey: string,
  fromPhone: string,
): Promise<{ ok: boolean; error?: string }> {
  // No published "ping" endpoint — try a lightweight chats request.
  try {
    const res = await fetch("https://api.periskope.app/v1/chats?limit=1", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, "x-phone": fromPhone },
    });
    if (res.ok) return { ok: true };
    const body = await res.text();
    return { ok: false, error: `Periskope ${res.status} - ${body.substring(0, 200)}` };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function verifyZavuCredentials(
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.zavu.dev/v1/templates?limit=1", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true };
    const body = await res.text();
    return { ok: false, error: `Zavu ${res.status} - ${body.substring(0, 200)}` };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}
