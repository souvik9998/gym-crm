
## Goal

Replace the current daily `pg_cron` based reminder fan-out (which runs `daily-whatsapp-job` once at 09:00 IST and loops through every branch + member in a single execution) with **Upstash QStash scheduled messages** for the two reminder categories you mentioned:

- **Expiring Soon Reminder** (`expiring_2days` — N days before expiry, configurable per branch)
- **Expired Reminder** (`expired_reminder` — N days after expiry, configurable per branch)

Other categories (`expiring_today`, transactional sends, admin summary) stay on the existing pipeline for now.

---

## Why QStash (vs current pg_cron)

| Today (pg_cron → daily-whatsapp-job) | With QStash |
|---|---|
| One fat run per day; long-running edge function | Each reminder is its own short HTTP delivery |
| All branches share one cron line; no per-tenant control | Daily cron per branch (or per subscription schedule) |
| Retries are manual inside the function | QStash handles retries + DLQ automatically |
| Hard to introspect per-message status | QStash dashboard + signed callbacks |
| pg_cron timezone is UTC-only | QStash supports cron + timezone, or one-shot `notBefore` per message |

---

## Two architectural options (you choose one)

### **Option A — Daily QStash cron per branch (recommended, minimal change)**

QStash holds **one daily schedule per branch** (or one global schedule that fans out per branch). Each fire calls a new edge function (`qstash-expiry-reminders`) with `{ branchId, kind: "expiring_soon" | "expired" }`. The edge function reads the branch's `whatsapp_auto_send` settings (`expiring_days_before`, `expired_days_after`), queries matching subscriptions for that day, sends via the existing `sendWhatsAppForTenant`, and logs to `whatsapp_notifications`.

- Pros: ~zero data model change, preserves dedup logic, easy to roll back.
- Cons: still a "batch per branch per day" model — not truly per-member scheduling.

### **Option B — Per-subscription one-shot QStash messages (true scheduling)**

Whenever a subscription is created/renewed/edited, we publish **two QStash messages** with `Upstash-Not-Before` set to the exact future timestamp:
- One for `expiring_soon` at `end_date − expiring_days_before` 09:00 IST
- One for `expired_reminder` at `end_date + expired_days_after` 09:00 IST

Each message carries `{ subscriptionId, kind }` and hits a new edge function `qstash-send-reminder` which re-validates (status, dedup, settings still enabled) before sending.

- Pros: truly event-driven, exact timing, no daily scan, naturally distributes load.
- Cons: needs cancellation logic when a subscription is renewed/cancelled (delete the queued QStash message by `messageId`), and a backfill job for existing active subscriptions.

**My recommendation:** Start with **Option A** (1–2 days work, low risk) and migrate to Option B later if you want per-member precision.

The plan below implements **Option A** but is structured so Option B can be layered on without rework.

---

## Work breakdown

### 1. Secrets & connector setup
- Add Lovable secrets:
  - `QSTASH_TOKEN` — for publishing/scheduling messages
  - `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` — to verify incoming webhooks (mandatory; otherwise anyone can hit the endpoint and fan out WhatsApp)
- These are not provided by a Lovable connector, so I'll request them via `add_secret` once the plan is approved.

### 2. New edge function: `qstash-expiry-reminders` (webhook receiver)
- Path: `supabase/functions/qstash-expiry-reminders/index.ts`
- `verify_jwt = false` in `supabase/config.toml` (QStash can't send Supabase JWTs).
- **Verifies QStash signature** using `Upstash-Signature` header + `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` (per Upstash signature spec). Reject with 401 if invalid — this is the only thing protecting the endpoint.
- Body: `{ branchId: string, kind: "expiring_soon" | "expired" }`
- Logic mirrors the relevant blocks of `daily-whatsapp-job` for that single branch + single kind:
  - Reads `gym_settings` (`whatsapp_enabled`, `whatsapp_auto_send`, `gym_name`)
  - Computes `targetDate` from `expiring_days_before` / `expired_days_after`
  - Queries `subscriptions` joined to `members`, applies the existing dedup against `whatsapp_notifications`
  - Sends via `sendWhatsAppForTenant` (provider-aware Periskope/Zavu — usage tracking continues unchanged)
  - Inserts into `whatsapp_notifications` with the same `notification_type` values already used (`expiring_2days`, `expired_reminder`) so existing reports/dashboards keep working.

### 3. New edge function: `qstash-schedule-manager` (admin/superadmin tool)
- Path: `supabase/functions/qstash-schedule-manager/index.ts`
- Authenticated (super_admin or tenant admin). Actions via `?action=`:
  - `list-schedules` — calls QStash `GET /v2/schedules`, returns schedules tagged for this tenant/branch.
  - `upsert-branch-schedules` — for a given `branchId`, creates/updates two QStash schedules (one for `expiring_soon`, one for `expired`) using:
    - `cron: "30 3 * * *"` (09:00 IST = 03:30 UTC) — matches today's behavior
    - `destination: <SUPABASE_URL>/functions/v1/qstash-expiry-reminders`
    - `body: { branchId, kind }`
    - `Upstash-Schedule-Id` header so we can update idempotently
  - `delete-branch-schedules` — removes both schedules when WhatsApp is disabled or branch deleted.
- Stores the returned `scheduleId`s in a tiny new table `qstash_schedules(branch_id, kind, schedule_id, created_at)` so we can update/delete cleanly. (Migration included.)

### 4. UI integration
- **Admin → Settings → WhatsApp Auto-Send** (`src/components/admin/WhatsAppAutoSendSettings.tsx`):
  - When the user toggles `expiring_2days` or `expired_reminder` on/off, or changes `expiring_days_before` / `expired_days_after`, call `qstash-schedule-manager?action=upsert-branch-schedules` (or `delete-branch-schedules`) so QStash state stays in sync. The day-count itself doesn't change the cron (still 09:00 IST), but disabling/enabling toggles schedule existence.
- **Super Admin → Tenant Detail**: add a small "Reminder Scheduler" status panel showing whether QStash schedules exist for each branch, with a "Re-sync" button that hits `upsert-branch-schedules` for all enabled branches in that tenant.

### 5. Cutover from pg_cron
- The existing `daily-whatsapp-job` keeps running, **but** I'll add an env flag `EXPIRY_REMINDERS_VIA_QSTASH=true`. When set, the daily job **skips** the `expiring_2days` and `expired_reminder` blocks (only `expiring_today` + admin summary remain). This avoids duplicate sends during cutover.
- Provide a one-shot SQL snippet (manual, not migration) to remove the obsolete pg_cron job once QStash is verified for a few days.

### 6. Backfill / one-time provisioning
- After the schedule manager ships, run `upsert-branch-schedules` for every branch where `whatsapp_enabled = true` AND (`expiring_2days != false` OR `expired_reminder != false`). This is a small script invoked from the Super Admin "Re-sync all" button.

### 7. Observability
- Edge function logs already structured (`log("event", {...})`). I'll add the QStash `Upstash-Message-Id` to every log line so you can cross-reference a delivery in the QStash dashboard.
- Failed sends still get rows in `whatsapp_notifications` with `status='failed'` and the provider error — surfacing in the existing WhatsApp Logs tab.

---

## Files to create / edit

**Create**
- `supabase/functions/qstash-expiry-reminders/index.ts`
- `supabase/functions/qstash-schedule-manager/index.ts`
- `supabase/functions/_shared/qstash.ts` (signature verification + small client helper for schedule CRUD)
- Migration: `qstash_schedules` table with RLS (super_admin + tenant admin select/manage own branches)

**Edit**
- `supabase/functions/daily-whatsapp-job/index.ts` — gate `expiring_2days` + `expired_reminder` behind `EXPIRY_REMINDERS_VIA_QSTASH`
- `supabase/config.toml` — `verify_jwt = false` for the two new functions
- `src/components/admin/WhatsAppAutoSendSettings.tsx` — call schedule manager on toggle/day change
- `src/pages/superadmin/TenantDetail.tsx` — add Reminder Scheduler status + re-sync action

**No change required to**: `_shared/whatsapp-provider.ts`, member registration flow, existing reports, `whatsapp_notifications` schema, Periskope/Zavu config.

---

## What I need from you to start
1. **Approve this plan.**
2. After approval I'll request these secrets via `add_secret`:
   - `QSTASH_TOKEN`
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`
   (Get them from https://console.upstash.com → QStash → "Request" tab.)
3. Confirm: stick with **Option A (daily QStash cron per branch)** for v1, and consider **Option B (per-subscription scheduling)** as a future enhancement? If you'd rather go straight to Option B, I'll adjust the plan — it's bigger but cleaner long-term.
