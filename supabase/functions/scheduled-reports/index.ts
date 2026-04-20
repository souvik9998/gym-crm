/**
 * Scheduled Reports Edge Function
 * 
 * Runs on a cron schedule to check report_schedules table and trigger
 * generate-report for any branches that are due for a report.
 * This runs independently in the background - no user interaction needed.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (event: string, data: Record<string, unknown> = {}) => {
  console.log(`[scheduled-reports] ${event}`, JSON.stringify(data));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const triggeredAt = new Date().toISOString();
  log("triggered", { at: triggeredAt, method: req.method });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  log("env-check", {
    hasSupabaseUrl: !!SUPABASE_URL,
    hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
    hasAnonKey: !!SUPABASE_ANON_KEY,
  });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "Supabase credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Allow manual trigger to optionally force-run (ignore next_run_at) for a single branch
  let force = false;
  let manualBranchId: string | null = null;
  try {
    const body = await req.json();
    force = body?.force === true;
    manualBranchId = body?.branchId || null;
  } catch {
    // No body
  }
  log("body-parsed", { force, manualBranchId });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);

    log("date-context", { utcNow: now.toISOString(), istNow: istNow.toISOString() });

    // Build query
    let query = supabase.from("report_schedules").select("*").eq("is_enabled", true);
    if (!force) {
      query = query.lte("next_run_at", now.toISOString());
    }
    if (manualBranchId) {
      query = query.eq("branch_id", manualBranchId);
    }

    const { data: dueSchedules, error: fetchError } = await query;

    if (fetchError) {
      log("fetch-error", { error: fetchError.message });
      throw fetchError;
    }

    log("schedules-fetched", {
      count: dueSchedules?.length || 0,
      schedules: (dueSchedules || []).map((s: any) => ({
        id: s.id,
        branch_id: s.branch_id,
        frequency: s.frequency,
        next_run_at: s.next_run_at,
        last_sent_at: s.last_sent_at,
        report_email: s.report_email,
        send_whatsapp: s.send_whatsapp,
        whatsapp_phone: s.whatsapp_phone,
      })),
    });

    if (!dueSchedules || dueSchedules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No reports due", force, manualBranchId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processedCount = 0;
    let errorCount = 0;
    const results: any[] = [];

    for (const schedule of dueSchedules) {
      try {
        console.log(`[scheduled-reports] Processing report for branch ${schedule.branch_id}, frequency: ${schedule.frequency}`);

        // Determine delivery channels
        const deliveryChannels: string[] = [];
        if (schedule.report_email) deliveryChannels.push('email');
        if (schedule.send_whatsapp) deliveryChannels.push('whatsapp');

        if (deliveryChannels.length === 0) {
          console.log(`[scheduled-reports] Skipping branch ${schedule.branch_id} - no delivery channel`);
          continue;
        }

        // Call generate-report edge function for each delivery channel
        for (const channel of deliveryChannels) {
          try {
            const reportPayload = {
              branchId: schedule.branch_id,
              frequency: schedule.frequency,
              reportEmail: channel === 'email' ? schedule.report_email : undefined,
              sendWhatsapp: channel === 'whatsapp',
              whatsappPhone: schedule.whatsapp_phone || undefined,
              includePayments: schedule.include_payments,
              includeMemberships: schedule.include_memberships,
              includeAttendance: schedule.include_attendance,
              includeTrainers: schedule.include_trainers,
              includeBranchAnalysis: schedule.include_branch_analysis,
              reportFormat: schedule.report_format || 'excel',
              deliveryChannel: channel,
            };

            const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-report`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "apikey": SUPABASE_ANON_KEY || "",
              },
              body: JSON.stringify(reportPayload),
            });

            const result = await response.json();

            if (!response.ok) {
              console.error(`[scheduled-reports] generate-report failed for branch ${schedule.branch_id} via ${channel}:`, result);
              
              // Retry once
              console.log(`[scheduled-reports] Retrying ${channel} for branch ${schedule.branch_id}...`);
              await new Promise(r => setTimeout(r, 3000));
              
              const retryResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-report`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  "apikey": SUPABASE_ANON_KEY || "",
                },
                body: JSON.stringify(reportPayload),
              });

              const retryResult = await retryResponse.json();
              if (!retryResponse.ok) {
                console.error(`[scheduled-reports] FAILED after retry for ${schedule.branch_id} via ${channel}:`, retryResult);
                errorCount++;
                results.push({ branchId: schedule.branch_id, channel, status: "failed", error: retryResult.error });
              } else {
                console.log(`[scheduled-reports] Retry succeeded for ${schedule.branch_id} via ${channel}`);
                results.push({ branchId: schedule.branch_id, channel, status: "sent_on_retry" });
              }
            } else {
              console.log(`[scheduled-reports] Report sent for branch ${schedule.branch_id} via ${channel}`);
              results.push({ branchId: schedule.branch_id, channel, status: "sent" });
            }
          } catch (channelError: any) {
            console.error(`[scheduled-reports] Channel ${channel} error for ${schedule.branch_id}:`, channelError);
            errorCount++;
            results.push({ branchId: schedule.branch_id, channel, status: "error", error: channelError.message });
          }
        }

        // Calculate next run time
        const nextRun = new Date();
        nextRun.setUTCHours(3, 30, 0, 0); // 9:00 AM IST
        switch (schedule.frequency) {
          case "daily":
            nextRun.setDate(nextRun.getDate() + 1);
            break;
          case "weekly":
            nextRun.setDate(nextRun.getDate() + 7);
            break;
          case "monthly":
            nextRun.setMonth(nextRun.getMonth() + 1);
            break;
        }

        // Update schedule with last_sent_at and next_run_at
        await supabase
          .from("report_schedules")
          .update({
            last_sent_at: now.toISOString(),
            next_run_at: nextRun.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", schedule.id);

        processedCount++;
      } catch (scheduleError: any) {
        console.error(`[scheduled-reports] Error processing schedule ${schedule.id}:`, scheduleError);
        errorCount++;
        results.push({ scheduleId: schedule.id, status: "error", error: scheduleError.message });
      }
    }

    // Log the run
    await supabase.from("admin_summary_log").insert({
      summary_type: "scheduled_reports",
      member_ids: [],
    });

    console.log(`[scheduled-reports] Completed: ${processedCount} processed, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        errors: errorCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[scheduled-reports] ERROR:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
