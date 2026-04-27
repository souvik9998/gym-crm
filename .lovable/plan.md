## Goal

Create a real "Expiring Soon" scenario in the dashboard and verify the new **QStash expiry reminders** pipeline actually sends a WhatsApp message — without waiting for the 9 AM IST cron to fire.

Today is **2026-04-27**. Branch **"Hrit's Fitness - Main"** (`81785086-…`) has:
- `whatsapp_enabled = true`
- `expiring_2days = true`, `expiring_days_before = 2`

Currently the `qstash_schedules` table is **empty** — no QStash schedules have ever been synced. We'll fix that as part of the test.

---

## Step 1 — Create the "Expiring Soon" test member

Pick the existing member **Sanjay** (`ec2f4d73-9cb5-4f04-95c2-99c8f131b68f`, phone `9735273407`, branch *Hrit's Fitness - Main*). His current subscription `cc68d69b-6039-49e9-815f-1e5298ee0516` ends on 2026-05-21.

Shift his subscription so it ends **2026-04-29** (today + 2 days), which matches the branch's `expiring_days_before = 2` window:

```sql
UPDATE public.subscriptions
SET end_date   = '2026-04-29',
    start_date = '2026-03-30',   -- keep duration sensible
    status     = 'expiring_soon',
    updated_at = NOW()
WHERE id = 'cc68d69b-6039-49e9-815f-1e5298ee0516';

SELECT public.refresh_subscription_statuses();
```

After this, **Admin → Dashboard** will show Sanjay under **Expiring Soon** (the 7-day badge logic in `MembersTable` and `get_dashboard_stats` will both pick him up).

> If you'd rather not touch a real member, I can instead insert a brand-new throwaway member (e.g. "QStash Test", phone `9999900001`) with a fresh subscription ending 2026-04-29. Tell me which you prefer.

---

## Step 2 — Sync QStash schedules for this tenant

Right now `qstash_schedules` is empty. Two options:

**A) From the UI (preferred — exercises the real path):**
1. Log in as Super Admin → open **Tenants → Hrit's Fitness** → the **QStash Scheduler Status** card.
2. Click **"Sync All Schedules"**. This invokes `qstash-schedule-manager?action=sync-tenant` and registers daily 9 AM IST schedules with Upstash for each branch + each enabled reminder kind.
3. Verify rows appear in `qstash_schedules` and the card shows "ON" for **Expiring Soon** on Hrit's Fitness - Main.

**B) Direct edge function call (faster, same result):** I'll invoke `qstash-schedule-manager?action=sync-tenant` with `{ "tenantId": "a05bf6ee-283c-4630-91eb-3800874becf3" }` using `supabase--curl_edge_functions` and confirm the schedules are persisted.

This is a one-time setup per tenant — once synced, Upstash will fire the webhook daily at 9 AM IST automatically.

---

## Step 3 — Trigger the reminder NOW (don't wait for 9 AM)

The webhook function `qstash-expiry-reminders` accepts `dryRun: true`, which **skips Upstash signature verification** but still runs the full reminder logic (query expiring subs, send WhatsApp via Periskope, log to `whatsapp_notifications`).

Invoke it directly via `supabase--curl_edge_functions`:

```
POST /qstash-expiry-reminders
{
  "branchId": "81785086-36f2-4ed0-bf1d-a174089ac8d0",
  "kind": "expiring_soon",
  "dryRun": true
}
```

Expected response shape:
```json
{
  "success": true,
  "branchId": "81785086-...",
  "kind": "expiring_soon",
  "attempts": 1,
  "sent": 1,
  "failed": 0,
  "members": [{ "name": "Sanjay", "phone": "9735273407", "ok": true }]
}
```

---

## Step 4 — Verify end-to-end

1. **Database** — confirm a row landed in `whatsapp_notifications` for Sanjay with the right `notification_type` (e.g. `expiring_2days`) and `status = 'sent'`.
2. **Edge function logs** — pull the last `qstash-expiry-reminders` invocation logs to see the per-member send result and the Periskope response.
3. **WhatsApp** — Sanjay's phone (`9735273407`) should receive the templated "expiring soon" message.
4. **Dashboard** — the **Expiring Soon** count should include Sanjay; clicking through, his row in **MembersTable** should show the orange "Expiring Soon" badge.
5. **Idempotency** — re-run the same dryRun POST. The function dedupes against `whatsapp_notifications`, so attempts should still be 1 but `sent` should be 0 (already-notified path), proving we won't double-send when the real cron fires tomorrow.

---

## (Optional) Step 5 — Roll back the test data

If you want to put Sanjay back to his real end date after testing:
```sql
UPDATE public.subscriptions
SET end_date = '2026-05-21', start_date = '2026-04-21', status = 'active', updated_at = NOW()
WHERE id = 'cc68d69b-6039-49e9-815f-1e5298ee0516';
SELECT public.refresh_subscription_statuses();
```
And delete the test notification row(s) from `whatsapp_notifications` if you don't want them in history.

---

## Files / systems touched

- **Data only:** `subscriptions` (1 row UPDATE), `whatsapp_notifications` (insert by edge fn), `qstash_schedules` (insert/upsert by sync).
- **No code changes** — this plan only exercises the already-built `qstash-schedule-manager`, `qstash-expiry-reminders`, and Periskope-backed WhatsApp pipeline.

## Open questions for you

1. **Test target:** modify existing member **Sanjay** (quickest), or create a fresh throwaway "QStash Test" member?
2. **Schedule sync:** do you want to click *Sync All Schedules* yourself in the Super Admin UI (Step 2A), or should I invoke the sync edge function for you (Step 2B)?
