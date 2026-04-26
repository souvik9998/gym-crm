## Goal

Introduce **Zavu** as a second WhatsApp provider alongside Periskope. Each Gym Owner (tenant) is assigned exactly one active provider by the Super Admin. The chosen provider is used for **every** WhatsApp message GymKloud sends for that tenant (registration, renewal, expiry reminders, payment receipts, staff credentials, daily-pass, manual sends, daily expiry job, event confirmations, invoices, check-ins, password resets — all 7 edge functions that currently call Periskope).

When **Zavu** is selected, each message **category** must use a pre-approved WhatsApp template, so the Super Admin gets a UI to set/update template IDs per category. When **Periskope** is selected, the existing free-text messages are sent (no template IDs needed).

WhatsApp usage tracking (`tenant_usage.whatsapp_messages_sent` via `increment_whatsapp_usage`) continues to fire on every successful send regardless of provider, so Gym Owner quotas keep working unchanged.

---

## How Zavu works (from docs.zavu.dev)

- **Auth:** `Authorization: Bearer <ZAVU_API_KEY>` (key looks like `zv_live_xxx`).
- **Send endpoint:** `POST https://api.zavu.dev/v1/messages`
- **Template send body:**
  ```json
  {
    "to": "+919876543210",
    "channel": "whatsapp",
    "messageType": "template",
    "content": {
      "templateId": "tmpl_abc123",
      "templateVariables": { "1": "John", "2": "20 Jan 2026" }
    }
  }
  ```
- Templates are pre-approved by Meta and identified by a `templateId` (`tmpl_xxx`). Variables are positional (`{{1}}`, `{{2}}`, …).
- Optional `Zavu-Sender` header to pin a specific sender profile (we'll expose this as an optional field).

---

## 1. Database changes (migration)

### 1a. New table `tenant_messaging_config`
One row per tenant. Stores provider selection, encrypted credentials for **both** providers (so Super Admin can prep one before switching), and a JSONB map of Zavu template IDs per message category.

```sql
CREATE TABLE public.tenant_messaging_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Active provider: 'periskope' | 'zavu' | 'none'
  active_provider text NOT NULL DEFAULT 'periskope'
    CHECK (active_provider IN ('periskope', 'zavu', 'none')),

  -- Periskope creds (encrypted using existing RAZORPAY_ENCRYPTION_KEY pattern)
  periskope_api_key_encrypted text,
  periskope_api_key_iv text,
  periskope_phone text,            -- not secret, stored as plaintext
  periskope_verified_at timestamptz,

  -- Zavu creds
  zavu_api_key_encrypted text,
  zavu_api_key_iv text,
  zavu_sender_id text,             -- optional, plaintext
  zavu_verified_at timestamptz,

  -- Zavu templates per message category (key = notification_type used in send-whatsapp)
  -- Shape: { "new_registration": "tmpl_abc", "renewal": "tmpl_def", ... }
  zavu_templates jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_messaging_config_tenant ON public.tenant_messaging_config(tenant_id);

ALTER TABLE public.tenant_messaging_config ENABLE ROW LEVEL SECURITY;

-- Super Admins manage everything
CREATE POLICY "Super admins manage tenant messaging config"
ON public.tenant_messaging_config FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant admins can VIEW (non-secret fields only — service role still does writes from edge fns)
CREATE POLICY "Tenant admins can view their messaging config"
ON public.tenant_messaging_config FOR SELECT TO authenticated
USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE TRIGGER trg_messaging_config_updated_at
BEFORE UPDATE ON public.tenant_messaging_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### 1b. Reuse the existing encryption key
Existing `RAZORPAY_ENCRYPTION_KEY` (already a 64-hex AES-256 key) is reused via `supabase/functions/_shared/encryption.ts` — no new secret needed.

> Encryption secret naming is internal — the Razorpay key is just a generic AES-256 key. We'll keep using it. (No user-facing change; we won't rename to avoid breaking Razorpay.)

### 1c. Categories of messages whose Zavu template IDs must be configurable
These match the `type`/`notification_type` values already passed to `send-whatsapp` and used elsewhere:

| Category key | Used by |
|---|---|
| `new_registration` | `Register.tsx`, send-whatsapp |
| `renewal` | `Renew.tsx`, send-whatsapp |
| `daily_pass` | daily-pass purchase, send-whatsapp |
| `pt_extension` | `ExtendPT.tsx`, send-whatsapp |
| `expiring_2days` | daily-whatsapp-job |
| `expiring_today` | daily-whatsapp-job |
| `expired_reminder` | daily-whatsapp-job |
| `payment_details` | send-whatsapp, post-payment flows |
| `admin_add_member` | AddMemberDialog, send-whatsapp |
| `promotional` | MembersTable manual send |
| `staff_credentials` | StaffWhatsAppButton, send-whatsapp |
| `event_confirmation` | finalize-event-payment |
| `invoice_link` | generate-invoice |
| `check_in` | check-in (if WhatsApp on check-in is enabled) |
| `password_reset` | staff-auth password reset / send-password-reset |
| `daily_summary_admin` | daily-whatsapp-job admin summary |

The Super Admin UI lists all of these with a label + description and an input for Zavu `tmpl_…` ID.

---

## 2. New Super Admin UI: `MessagingProviderTab`

Add a new **"Messaging"** tab in `src/pages/superadmin/TenantDetail.tsx` (between "Payments" and "Domains").

New file: `src/components/superadmin/MessagingProviderTab.tsx`

### UI sections
1. **Active Provider card** — Radio/segmented control: `Periskope` | `Zavu` | `None (disabled)`. Saving updates `active_provider`. Shows current selection with a green "Active" badge.
2. **Periskope credentials card** — `API Key` (password input), `Phone (E.164)` input, "Verify & Save" button. Verification = call `https://api.periskope.app/v1/account/me` (or a cheap GET) with the key; on success encrypt & save, set `periskope_verified_at`. Shows masked key (`zv_live_••••1234`) once saved with a "Disconnect" button.
3. **Zavu credentials card** — `API Key` (`zv_live_…`), optional `Sender ID`, "Verify & Save". Verification = `GET https://api.zavu.dev/v1/templates?limit=1` with the bearer key; on 200 → encrypt & save, set `zavu_verified_at`. Shows masked key + Disconnect.
4. **Zavu Template Mapping card** — **Only rendered when `active_provider === 'zavu'`.** A grouped, scrollable list of all 16 categories (grouped: *Member lifecycle*, *Reminders*, *Operational*, *Admin*). Each row: category label + description + `Input` for `tmpl_…` ID + a small "Test send" button (sends to a Super-Admin-entered phone number using that template — invokes the new edge function described below).
5. **Save All Templates** button (debounced auto-save would also work) — persists the full `zavu_templates` map.

### Frontend → Backend
All saves go through a new edge function action: `tenant-operations?action=save-messaging-config` (Super Admin only, validates with Zod, encrypts secrets via `_shared/encryption.ts`).

Status fetch: `tenant-operations?action=get-messaging-config` returns provider, masked key tails, `verified_at`, plaintext sender, full `zavu_templates` map (no decrypted secrets).

Test-send: `tenant-operations?action=test-messaging` with `{ tenantId, provider, templateKey?, toPhone }` → fires one message via the chosen provider+template and returns success/error.

---

## 3. New shared module: `supabase/functions/_shared/whatsapp-provider.ts`

Single source of truth for sending WhatsApp messages. **Every** edge function that currently calls Periskope will be refactored to import from here.

```ts
// Public API
export type MessageCategory =
  | "new_registration" | "renewal" | "daily_pass" | "pt_extension"
  | "expiring_2days" | "expiring_today" | "expired_reminder"
  | "payment_details" | "admin_add_member" | "promotional"
  | "staff_credentials" | "event_confirmation" | "invoice_link"
  | "check_in" | "password_reset" | "daily_summary_admin";

export interface SendArgs {
  toPhone: string;          // E.164 without '+', e.g. "919876543210"
  category: MessageCategory;
  // Provider-agnostic payload — used to build text (Periskope) and to map vars (Zavu)
  variables: Record<string, string>;  // e.g. { name, expiry_date, amount, branch_name, ... }
  fallbackText: string;               // The message we'd send via Periskope (free text)
  branchId?: string | null;
  tenantId?: string | null;           // optional, will be resolved from branchId if missing
}

export interface SendResult { success: boolean; error?: string; provider: "periskope" | "zavu" | "none"; }

export async function sendWhatsAppForTenant(
  serviceClient: SupabaseClient,
  args: SendArgs,
): Promise<SendResult>;
```

### Internal logic
1. Resolve `tenantId` from `branchId` via `get_tenant_from_branch` (cached per request).
2. Load `tenant_messaging_config` row.
3. **If `active_provider === 'none'`** → return `{ success: false, error: "messaging_disabled", provider: "none" }`.
4. **If Periskope:**
   - Decrypt `periskope_api_key_encrypted` (or fall back to env vars if row missing — backward compat for tenants not yet configured).
   - Send free-text via existing Periskope endpoint.
5. **If Zavu:**
   - Decrypt `zavu_api_key_encrypted`.
   - Look up `zavu_templates[category]` → if missing, return `{ success: false, error: "zavu_template_not_configured:<category>" }` (logged + surfaced).
   - Build positional `templateVariables` from `args.variables` using a fixed per-category mapping table (also lives in this file, e.g. `new_registration` → `["name", "expiry_date", "branch_name"]`).
   - POST to `https://api.zavu.dev/v1/messages` with `messageType: "template"`.
6. **On success:** call `increment_whatsapp_usage(tenant_id, 1)` (existing RPC) — **identical accounting for both providers**.
7. Return result.

### Per-category variable mapping (built in)
```
new_registration:  [name, expiry_date, branch_name]
renewal:           [name, expiry_date, branch_name]
daily_pass:        [name, expiry_date, branch_name]
pt_extension:      [name, expiry_date, branch_name]
expiring_2days:    [name, expiry_date, branch_name]
expiring_today:    [name, expiry_date, branch_name]
expired_reminder:  [name, days_expired, branch_name]
payment_details:   [name, amount, payment_date, payment_mode, expiry_date, branch_name]
admin_add_member:  [name, expiry_date, branch_name]
promotional:       [name, branch_name]
staff_credentials: [name, phone, password, role, branches, branch_name]
event_confirmation:[name, event_title, event_date, branch_name]
invoice_link:      [name, invoice_number, invoice_url, branch_name]
check_in:          [name, check_in_time, branch_name]
password_reset:    [name, reset_link, branch_name]
daily_summary_admin:[summary_text]
```
(These are positional `{{1}}, {{2}}, …` to match Zavu/WhatsApp template variables. The Super Admin sees the variable list per category beside each input so they create matching templates in their Zavu dashboard.)

---

## 4. Refactor all edge functions that send WhatsApp

Replace direct `fetch("https://api.periskope.app/...")` calls with `sendWhatsAppForTenant(...)` in:

1. **`send-whatsapp/index.ts`** — biggest refactor. The `generateMessage()` text becomes the `fallbackText`; collected fields (member name, expiry, payment info, branch name, staff details) become `variables`. The duplicate `trackWhatsAppUsage` call inside `sendPeriskopeMessage` is removed because the shared module now owns usage accounting.
2. **`daily-whatsapp-job/index.ts`** — expiring/expired reminders + admin summary. Resolves provider per-branch (per-tenant) automatically.
3. **`finalize-event-payment/index.ts`** — event confirmation message.
4. **`generate-invoice/index.ts`** — invoice link share.
5. **`generate-report/index.ts`** — automated report delivery (if it sends via WhatsApp; email path untouched).
6. **`check-in/index.ts`** — check-in confirmation if enabled.
7. **`staff-auth/index.ts`** & **`send-password-reset/index.ts`** — password reset and staff credentials.

No client/UI code needs to change for these — the edge functions transparently switch providers.

---

## 5. Updates to `tenant-operations` edge function

Add three new actions (Super Admin only, validated with Zod, rate-limited):

- `get-messaging-config` → returns `{ active_provider, periskope: {connected, masked, phone, verified_at}, zavu: {connected, masked, sender_id, verified_at}, zavu_templates }`.
- `save-messaging-config` → accepts partial updates: `{ active_provider?, periskope?: {apiKey?, phone?}, zavu?: {apiKey?, senderId?}, zavu_templates? }`. Encrypts any provided secret, runs verification call against the provider before persisting.
- `test-messaging` → fires one test message using the saved/active config.

All three log to `platform_audit_logs` (existing table) for traceability.

---

## 6. WhatsApp usage tracking — unchanged, verified for both providers

`increment_whatsapp_usage(_tenant_id, _count)` is already called on every successful Periskope send. The new shared module calls it once on every successful send regardless of provider, so the Gym Owner's monthly quota (`tenant_limits.max_monthly_whatsapp_messages`) and the existing limit gate (`tenant_can_add_resource(_, 'whatsapp')`) work for Zavu identically. No DB or quota-UI change needed.

---

## 7. Backward compatibility & rollout

- For any tenant **without** a `tenant_messaging_config` row, the shared module falls back to the existing global Periskope env secrets (`PERISKOPE_API_KEY`, `PERISKOPE_PHONE`) — so nothing breaks before the Super Admin configures things.
- Periskope env secrets remain in place; no code paths are deleted, just routed through the shared module.
- A simple data backfill (optional) inserts an empty config row per active tenant set to `active_provider = 'periskope'` so the Messaging tab opens cleanly.

---

## 8. Files touched / created

**New**
- `supabase/migrations/<timestamp>_tenant_messaging_config.sql`
- `supabase/functions/_shared/whatsapp-provider.ts`
- `src/components/superadmin/MessagingProviderTab.tsx`

**Modified**
- `src/pages/superadmin/TenantDetail.tsx` — add Messaging tab.
- `supabase/functions/tenant-operations/index.ts` — 3 new actions.
- `supabase/functions/send-whatsapp/index.ts`
- `supabase/functions/daily-whatsapp-job/index.ts`
- `supabase/functions/finalize-event-payment/index.ts`
- `supabase/functions/generate-invoice/index.ts`
- `supabase/functions/generate-report/index.ts`
- `supabase/functions/check-in/index.ts`
- `supabase/functions/staff-auth/index.ts` and/or `supabase/functions/send-password-reset/index.ts`
- `supabase/functions/_shared/validation.ts` — add Zod schemas for new actions.

---

## 9. Acceptance criteria

1. Super Admin opens **Tenant Detail → Messaging** and sees provider selector, both credential cards, and (when Zavu is active) a template mapping panel for every message category.
2. Switching a tenant from Periskope → Zavu causes the **next** message of any kind for that tenant to be delivered via the Zavu template; Periskope is not called.
3. If a Zavu template ID is missing for a category, the send returns a clear error and is logged in `whatsapp_notifications.error_message` (e.g. `"zavu_template_not_configured:expiring_today"`).
4. The "Test send" button delivers a real message and returns success/failure inline.
5. `tenant_usage.whatsapp_messages_sent` increments by 1 per successful send for **both** providers; the Gym Owner's monthly cap continues to gate sends as before.
6. Tenants left unconfigured continue to use the global Periskope env secrets (no regression).
7. Credentials are AES-256-GCM encrypted at rest and never returned to the browser; UI shows only masked tails (`••••1234`).