// Supabase Edge Function: process-whatsapp-queue
// Run this on a schedule (e.g., every minute via Supabase cron)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch pending notifications from queue
    const { data: pendingQueue, error: queueError } = await supabase
      .from("whatsapp_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10); // Process 10 at a time

    if (queueError) {
      throw queueError;
    }

    if (!pendingQueue || pendingQueue.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No pending notifications" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const item of pendingQueue) {
      try {
        // Call the send-whatsapp function
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            phone: item.phone,
            name: item.name,
            endDate: item.end_date,
            type: item.notification_type,
            memberIds: [item.member_id],
          }),
        });

        const result = await response.json();

        // Update queue item status
        await supabase
          .from("whatsapp_queue")
          .update({
            status: result.success ? "completed" : "failed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        results.push({
          id: item.id,
          success: result.success,
          error: result.error,
        });
      } catch (error: any) {
        // Mark as failed
        await supabase
          .from("whatsapp_queue")
          .update({
            status: "failed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        results.push({
          id: item.id,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        sent: successCount,
        failed: failedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in process-whatsapp-queue function:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
