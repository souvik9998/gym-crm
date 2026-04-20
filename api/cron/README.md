# Vercel Cron — Daily Automations

This directory contains a Vercel Serverless Function that is invoked by **Vercel Cron**
once per day to run all automated background jobs for GymKloud.

## Schedule

Configured in `vercel.json`:

```json
"crons": [
  { "path": "/api/cron/daily-automations", "schedule": "30 3 * * *" }
]
```

`30 3 * * *` UTC = **9:00 AM IST** every day.

## What it does

The endpoint `/api/cron/daily-automations` triggers the following Supabase Edge Functions
(in order, one after the other):

| # | Edge Function          | Purpose                                                                  |
|---|------------------------|--------------------------------------------------------------------------|
| 1 | `daily-whatsapp-job`   | Sends Expiring-Soon, Expiring-Today, and Expired-Reminder WhatsApp msgs. |
| 2 | `scheduled-reports`    | Sends Daily / Weekly / Monthly automated reports per branch.              |

Each edge function:
- Reads its own per-branch settings (toggles in **Settings → WhatsApp** /
  **Settings → Reports**) and honours them strictly — OFF means *no send*.
- Is **multi-tenant safe** — every branch is processed independently with its
  own data. Members, trainers, and stats never cross branch boundaries.
- Is **idempotent** — duplicate triggers on the same day are a no-op
  (`daily-whatsapp-job` checks `admin_summary_log`; `scheduled-reports` checks
  `report_schedules.next_run_at`). Re-running the cron will not double-send.
- Logs to the Supabase function logs and to `whatsapp_notifications` /
  `report_schedules` for full audit trail. WhatsApp usage is tracked into
  `tenant_usage` for the SuperAdmin portal.

## Required Vercel environment variables

Add these in **Vercel → Project Settings → Environment Variables**
(Production + Preview):

| Variable                       | Value                                                          |
|--------------------------------|----------------------------------------------------------------|
| `SUPABASE_URL`                 | `https://nhfghwwpnqoayhsitqmp.supabase.co`                     |
| `SUPABASE_SERVICE_ROLE_KEY`    | (copy from Supabase → Project Settings → API → service_role)   |
| `SUPABASE_ANON_KEY`            | (copy from Supabase → Project Settings → API → anon key)       |
| `CRON_SECRET`                  | A long random string. Vercel auto-injects this as the          |
|                                | Bearer token on cron-triggered requests, and the handler       |
|                                | rejects any request missing it.                                |

## Manually triggering

You can trigger the cron locally for testing:

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-vercel-domain>/api/cron/daily-automations
```

Or test the underlying Supabase edge functions directly from the admin panel
(Settings → WhatsApp → "Run Now" / Settings → Reports → "Send Test Report").
