# QStash-Driven Expiry & Expired Reminders — Activation Plan

## Current State (already built)

Most of the infrastructure already exists and is correctly architected (QStash = trigger only, backend = all logic):

- **`qstash-schedule-manager`** edge fn — admin/super-admin endpoint to upsert/delete/list/sync-tenant QStash schedules. Stable schedule ID per `(branch, kind)`.
- **`qstash-expiry-reminders`** edge fn — webhook receiver. Validates Upstash-Signature, reads `gym_settings.whatsapp_auto_send` per branch, queries members, dedupes via `whatsapp_notifications`, sends via existing `sendWhatsAppForTenant` (Periskope/Zavu).
- **`qstash_schedules`** table — tracks each branch's two schedules.
- **`WhatsAppAutoSendSettings.tsx`** — toggling "Expiring Soon" or "Expired Reminder" already calls `qstash-schedule-manager?action=upsert|delete`.
- **`QstashSchedulerStatus.tsx`** (Super Admin) — lists schedules per branch + "Re-sync all".
- All QStash secrets (`QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) are configured.
- Daily run is idempotent: `qstash-expiry-reminders` checks `whatsapp_notifications` rows by `subscription_id + notification_type + status='sent'` to avoid duplicates.

## Gaps to Close

1. **Zero schedules currently exist in `qstash_schedules`.** Toggles are ON for some branches but the QStash schedules were never created in Upstash. Needs a one-time bulk sync.
2. **Cutover flag not set.** `daily-whatsapp-job` still runs the "expiring_2days" path itself unless `EXPIRY_REMINDERS_VIA_QSTASH=true`. With QStash now owning that category, we must set this secret so we don't double-send.
3. **Manual "Run Now" button** in `ManualAutomationTriggers.tsx` only invokes `daily-whatsapp-job`. Once the cutover flag is set, that function will skip `expiring_soon`. The button should additionally fire the same code path QStash uses, so admins can manually test/replay both `expiring_soon` and `expired` for their branch.
4. **No "Send Reminder" button visible** in the Settings WhatsApp section beyond `ManualAutomationTriggers`. The user said: "make sure to utilise the send reminder button in the settings to do this same action manually." This refers to that Run Now button — we'll re-label it and make it trigger the full QStash-equivalent flow.

## Implementation Steps

### Step 1 — Add `manual` mode to `qstash-expiry-reminders`

Currently the function requires a valid Upstash-Signature unless `dryRun: true`. Add a third bypass: `manual: true` accompanied by a valid Supabase JWT belonging to a user who is super_admin OR tenant_admin for the branch's tenant. This lets the front-end call the same function directly.

- Parse `manual` from body.
- When `manual === true`, skip signature check, instead call `auth.getUser()` on the bearer token + check `is_super_admin` OR `is_tenant_admin`.
- Insert `is_manual: true` into `whatsapp_notifications` rows on this path.

### Step 2 — Update the "Run Now" button

In `src/components/admin/ManualAutomationTriggers.tsx`:

- Rename header → **"Send Reminders Now"** (clearer than "Manual Automation Triggers").
- Description: "Manually trigger the same daily reminder pipeline (expiring soon + expired) for this branch."
- The single "Run Now" button now fires THREE calls in sequence for the current branch:
  1. `qstash-expiry-reminders` with `{ branchId, kind: "expiring_soon", manual: true }`
  2. `qstash-expiry-reminders` with `{ branchId, kind: "expired", manual: true }`
  3. `daily-whatsapp-job` with `{ manual: true, branchId }` — for the **expiring_today** path which still lives there (and any other non-expiry summary logic).
- Aggregate the `attempted/sent/failed` counts and show them in the Recent Runs panel.

### Step 3 — Set cutover env var

Add Supabase secret `EXPIRY_REMINDERS_VIA_QSTASH=true` so `daily-whatsapp-job` no longer sends `expiring_2days` (avoids duplicates with the QStash schedule). `expiring_today` and any other categories continue from `daily-whatsapp-job` since QStash only owns `expiring_soon` + `expired`.

### Step 4 — One-time backfill of QStash schedules

Run a server-side script (via the existing `qstash-schedule-manager?action=sync-tenant`) for each tenant that has ≥1 branch with `whatsapp_enabled=true`. This creates the missing Upstash schedules and fills `qstash_schedules`. Done via `supabase--curl_edge_functions` after deployment.

### Step 5 — Verify end-to-end

1. Deploy the two edge functions.
2. Curl `qstash-schedule-manager?action=sync-tenant` for the active tenant; assert `qstash_schedules` rows appear.
3. Curl `qstash-expiry-reminders` with `manual: true, kind: "expiring_soon", branchId: <souvik's branch>` — should pick up Souvik Das (end_date 2026-04-29, default `expiring_days_before = 2`, today = 2026-04-28 → target = 2026-04-30; we'll temporarily test with `kind: "expiring_soon"` and check logs / `whatsapp_notifications` rows).
4. Confirm a row in `whatsapp_notifications` is created and dedupe works on a second invocation.
5. Click "Send Reminders Now" from the UI to confirm the same flow triggers via the front-end.

## Technical Notes

- **No new tables or migrations needed** — `qstash_schedules` and `whatsapp_notifications` already exist.
- **Idempotency**: `qstash-expiry-reminders` already checks prior `whatsapp_notifications` rows per `subscription_id + notification_type` before sending.
- **Multi-tenant scaling**: each branch has its own pair of QStash schedules (`gymkloud-expiring_soon-<branchId>`, `gymkloud-expired-<branchId>`); Upstash dispatches them in parallel. Adding a new gym branch + toggling either reminder ON automatically registers its schedule via `WhatsAppAutoSendSettings.tsx`.
- **Settings honored per branch**: `whatsapp_enabled`, `whatsapp_auto_send.expiring_2days`, `whatsapp_auto_send.expired_reminder`, `expiring_days_before`, `expired_days_after` are all read inside `qstash-expiry-reminders` at fire time.
- **No new secrets** beyond setting `EXPIRY_REMINDERS_VIA_QSTASH=true`.

## Files Touched

- `supabase/functions/qstash-expiry-reminders/index.ts` — add manual JWT-auth bypass.
- `src/components/admin/ManualAutomationTriggers.tsx` — rebrand to "Send Reminders Now"; trigger all three calls; aggregate counts.
- (Operational) Add `EXPIRY_REMINDERS_VIA_QSTASH=true` secret + run sync-tenant backfill.
