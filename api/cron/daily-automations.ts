/**
 * Vercel Cron — Daily Automations Trigger
 *
 * Runs once per day (configured in vercel.json) and triggers ALL backend
 * automation logic for GymKloud:
 *   1. daily-whatsapp-job  → expiring soon / today / expired reminders
 *      (each branch's settings are read inside the edge function — toggles
 *       OFF skip the send; only enabled branches process.)
 *   2. scheduled-reports   → daily/weekly/monthly automated reports
 *      (frequency + delivery channel toggles checked inside the function.)
 *
 * Both edge functions are idempotent (they check `admin_summary_log` /
 * `report_schedules.next_run_at`) so duplicate triggers cannot resend the
 * same notification on the same day.
 *
 * Security: requests are authenticated via the `CRON_SECRET` env var,
 * which Vercel automatically injects into the Authorization header for
 * scheduled cron invocations: `Authorization: Bearer <CRON_SECRET>`.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://nhfghwwpnqoayhsitqmp.supabase.co";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

const CRON_SECRET = process.env.CRON_SECRET;

type FunctionResult = {
  fn: string;
  ok: boolean;
  status: number;
  durationMs: number;
  body: unknown;
  error?: string;
};

async function invokeEdgeFunction(name: string, payload: Record<string, unknown> = {}): Promise<FunctionResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }

    return {
      fn: name,
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - start,
      body: parsed,
    };
  } catch (err: any) {
    return {
      fn: name,
      ok: false,
      status: 0,
      durationMs: Date.now() - start,
      body: null,
      error: err?.message || String(err),
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Authenticate the cron request
  if (CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is not configured on Vercel",
    });
  }

  const startedAt = new Date().toISOString();
  console.log(`[cron/daily-automations] started at ${startedAt}`);

  // 2. Fire both jobs. Run sequentially so logs/usage tracking stay clean.
  const whatsappResult = await invokeEdgeFunction("daily-whatsapp-job", {});
  console.log("[cron/daily-automations] daily-whatsapp-job:", whatsappResult.status, whatsappResult.durationMs + "ms");

  const reportsResult = await invokeEdgeFunction("scheduled-reports", {});
  console.log("[cron/daily-automations] scheduled-reports:", reportsResult.status, reportsResult.durationMs + "ms");

  const ok = whatsappResult.ok && reportsResult.ok;

  return res.status(ok ? 200 : 500).json({
    ok,
    startedAt,
    finishedAt: new Date().toISOString(),
    results: [whatsappResult, reportsResult],
  });
}
