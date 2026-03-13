/**
 * Generate Report Edge Function
 * 
 * Generates an Excel report with gym performance data and sends it via email.
 * Optionally sends a WhatsApp message with a download link.
 * 
 * Triggered by the scheduled-reports cron function or manually by admin.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ReportConfig {
  branchId: string;
  frequency: string;
  reportEmail?: string;
  sendWhatsapp?: boolean;
  whatsappPhone?: string;
  includePayments?: boolean;
  includeMemberships?: boolean;
  includeAttendance?: boolean;
  includeTrainers?: boolean;
  includeBranchAnalysis?: boolean;
}

function getDateRange(frequency: string): { start: Date; end: Date; label: string } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (frequency) {
    case "daily":
      start.setDate(start.getDate() - 1);
      return { start, end, label: `Daily Report - ${start.toLocaleDateString("en-IN")}` };
    case "weekly":
      start.setDate(start.getDate() - 7);
      return { start, end, label: `Weekly Report - ${start.toLocaleDateString("en-IN")} to ${end.toLocaleDateString("en-IN")}` };
    case "monthly":
      start.setMonth(start.getMonth() - 1);
      return { start, end, label: `Monthly Report - ${start.toLocaleDateString("en-IN")} to ${end.toLocaleDateString("en-IN")}` };
    default:
      start.setDate(start.getDate() - 7);
      return { start, end, label: `Report - ${start.toLocaleDateString("en-IN")} to ${end.toLocaleDateString("en-IN")}` };
  }
}

// Simple CSV-style Excel generation using XML Spreadsheet format
function generateExcelXml(sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="Header">
    <Font ss:Bold="1" ss:Size="11"/>
    <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>
    <Font ss:Color="#FFFFFF" ss:Bold="1"/>
  </Style>
  <Style ss:ID="Currency">
    <NumberFormat ss:Format="₹#,##0.00"/>
  </Style>
  <Style ss:ID="Default">
    <Font ss:Size="10"/>
  </Style>
</Styles>`;

  for (const sheet of sheets) {
    xml += `<Worksheet ss:Name="${escapeXml(sheet.name)}">
<Table>`;
    
    // Headers
    xml += `<Row>`;
    for (const h of sheet.headers) {
      xml += `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`;
    }
    xml += `</Row>`;

    // Data rows
    for (const row of sheet.rows) {
      xml += `<Row>`;
      for (const cell of row) {
        if (typeof cell === "number") {
          xml += `<Cell ss:StyleID="Default"><Data ss:Type="Number">${cell}</Data></Cell>`;
        } else {
          xml += `<Cell ss:StyleID="Default"><Data ss:Type="String">${escapeXml(String(cell || ""))}</Data></Cell>`;
        }
      }
      xml += `</Row>`;
    }
    xml += `</Table></Worksheet>`;
  }

  xml += `</Workbook>`;
  return xml;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendEmailWithResend(to: string, subject: string, html: string, attachment: { filename: string; content: string }) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "Email not configured" };
  }

  const base64Content = btoa(attachment.content);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "GymKloud Reports <reports@gymkloud.in>",
      to: [to],
      subject,
      html,
      attachments: [{
        filename: attachment.filename,
        content: base64Content,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return { success: false, error: err };
  }

  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimited = enforceRateLimit(req, "generate-report", 5, 60, corsHeaders);
  if (rateLimited) return rateLimited;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let config: ReportConfig;
    let isScheduled = false;

    if (req.method === "POST") {
      const body = await req.text();
      const parsed = JSON.parse(body);
      
      if (parsed.scheduled) {
        // Called by cron - process all due reports
        isScheduled = true;
        const now = new Date().toISOString();
        const { data: dueReports } = await supabase
          .from("report_schedules")
          .select("*")
          .eq("is_enabled", true)
          .lte("next_run_at", now);

        if (!dueReports || dueReports.length === 0) {
          return new Response(JSON.stringify({ message: "No reports due" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const results = [];
        for (const schedule of dueReports) {
          try {
            const result = await generateAndSendReport(supabase, {
              branchId: schedule.branch_id,
              frequency: schedule.frequency,
              reportEmail: schedule.report_email,
              sendWhatsapp: schedule.send_whatsapp,
              whatsappPhone: schedule.whatsapp_phone,
              includePayments: schedule.include_payments,
              includeMemberships: schedule.include_memberships,
              includeAttendance: schedule.include_attendance,
              includeTrainers: schedule.include_trainers,
              includeBranchAnalysis: schedule.include_branch_analysis,
            });

            // Update next_run_at
            const nextRun = calculateNextRun(schedule.frequency);
            await supabase
              .from("report_schedules")
              .update({ last_sent_at: new Date().toISOString(), next_run_at: nextRun.toISOString() })
              .eq("id", schedule.id);

            results.push({ branchId: schedule.branch_id, success: true });
          } catch (e) {
            console.error(`Report failed for branch ${schedule.branch_id}:`, e);
            results.push({ branchId: schedule.branch_id, success: false, error: String(e) });
          }
        }

        return new Response(JSON.stringify({ results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Manual trigger - validate auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: userData } = await anonClient.auth.getUser();
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: "Invalid auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      config = parsed as ReportConfig;
    } else {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!isScheduled) {
      const result = await generateAndSendReport(supabase, config);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Report generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function calculateNextRun(frequency: string): Date {
  const next = new Date();
  // Set to 9 AM IST (3:30 UTC)
  next.setUTCHours(3, 30, 0, 0);
  
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 7);
  }
  return next;
}

// deno-lint-ignore no-explicit-any
async function generateAndSendReport(supabase: any, config: ReportConfig) {
  const { branchId } = config;
  const { start, end, label } = getDateRange(config.frequency);
  const startStr = start.toISOString();
  const endStr = end.toISOString();
  const startDate = start.toISOString().split("T")[0];
  const endDate = end.toISOString().split("T")[0];

  // Fetch branch info
  const { data: branch } = await supabase
    .from("branches")
    .select("name, address, phone")
    .eq("id", branchId)
    .single();

  const branchName = branch?.name || "Gym";
  const sheets: { name: string; headers: string[]; rows: (string | number)[][] }[] = [];

  // Summary sheet
  const summaryRows: (string | number)[][] = [];

  // 1. Payments data
  if (config.includePayments !== false) {
    const { data: payments } = await supabase
      .from("payments")
      .select("id, amount, payment_mode, status, created_at, payment_type, notes")
      .eq("branch_id", branchId)
      .gte("created_at", startStr)
      .lte("created_at", endStr)
      .order("created_at", { ascending: false });

    const paymentRows = (payments || []).map((p: any) => [
      new Date(p.created_at).toLocaleDateString("en-IN"),
      p.amount,
      p.payment_mode || "N/A",
      p.status || "N/A",
      p.payment_type || "gym_membership",
      p.notes || "",
    ]);

    sheets.push({
      name: "Payments",
      headers: ["Date", "Amount (₹)", "Mode", "Status", "Type", "Notes"],
      rows: paymentRows,
    });

    const totalRevenue = (payments || [])
      .filter((p: any) => p.status === "success")
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    const cashPayments = (payments || []).filter((p: any) => p.payment_mode === "cash" && p.status === "success").length;
    const onlinePayments = (payments || []).filter((p: any) => p.payment_mode === "online" && p.status === "success").length;

    summaryRows.push(
      ["Total Revenue", totalRevenue],
      ["Total Transactions", payments?.length || 0],
      ["Cash Payments", cashPayments],
      ["Online Payments", onlinePayments],
      ["", ""],
    );
  }

  // 2. Memberships data
  if (config.includeMemberships !== false) {
    const { data: members } = await supabase
      .from("members")
      .select("id, name, phone, email, created_at")
      .eq("branch_id", branchId);

    const memberIds = (members || []).map((m: any) => m.id);
    
    let subscriptions: any[] = [];
    if (memberIds.length > 0) {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("member_id, status, start_date, end_date, plan_months")
        .in("member_id", memberIds)
        .order("end_date", { ascending: false });
      subscriptions = subs || [];
    }

    // Latest sub per member
    const latestSubs = new Map();
    for (const sub of subscriptions) {
      if (!latestSubs.has(sub.member_id)) {
        latestSubs.set(sub.member_id, sub);
      }
    }

    const memberRows = (members || []).map((m: any) => {
      const sub = latestSubs.get(m.id);
      return [
        m.name,
        m.phone,
        m.email || "N/A",
        sub?.status || "No Subscription",
        sub?.start_date || "N/A",
        sub?.end_date || "N/A",
        sub?.plan_months || 0,
      ];
    });

    sheets.push({
      name: "Members",
      headers: ["Name", "Phone", "Email", "Status", "Start Date", "End Date", "Plan Months"],
      rows: memberRows,
    });

    const activeCount = [...latestSubs.values()].filter((s: any) => s.status === "active").length;
    const expiredCount = [...latestSubs.values()].filter((s: any) => s.status === "expired").length;
    const expiringSoon = [...latestSubs.values()].filter((s: any) => s.status === "expiring_soon").length;

    // New members in period
    const newMembers = (members || []).filter((m: any) => new Date(m.created_at) >= start).length;

    summaryRows.push(
      ["Total Members", members?.length || 0],
      ["Active Members", activeCount],
      ["Expiring Soon", expiringSoon],
      ["Expired Members", expiredCount],
      ["New Members (Period)", newMembers],
      ["", ""],
    );
  }

  // 3. Attendance data
  if (config.includeAttendance !== false) {
    const { data: attendance } = await supabase
      .from("attendance_logs")
      .select("id, date, check_in_at, check_out_at, total_hours, user_type, member_id, staff_id")
      .eq("branch_id", branchId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .limit(500);

    const attendanceRows = (attendance || []).map((a: any) => [
      a.date,
      a.user_type || "member",
      new Date(a.check_in_at).toLocaleTimeString("en-IN"),
      a.check_out_at ? new Date(a.check_out_at).toLocaleTimeString("en-IN") : "N/A",
      a.total_hours || 0,
    ]);

    sheets.push({
      name: "Attendance",
      headers: ["Date", "User Type", "Check In", "Check Out", "Hours"],
      rows: attendanceRows,
    });

    const memberCheckins = (attendance || []).filter((a: any) => a.user_type === "member").length;
    const staffCheckins = (attendance || []).filter((a: any) => a.user_type === "staff").length;

    summaryRows.push(
      ["Total Check-ins", attendance?.length || 0],
      ["Member Check-ins", memberCheckins],
      ["Staff Check-ins", staffCheckins],
      ["", ""],
    );
  }

  // 4. Trainer data
  if (config.includeTrainers !== false) {
    const { data: trainers } = await supabase
      .from("personal_trainers")
      .select("id, name, phone, specialization, monthly_fee, is_active")
      .eq("branch_id", branchId);

    const trainerIds = (trainers || []).map((t: any) => t.id);
    let ptSubs: any[] = [];
    if (trainerIds.length > 0) {
      const { data } = await supabase
        .from("pt_subscriptions")
        .select("personal_trainer_id, status")
        .in("personal_trainer_id", trainerIds)
        .eq("status", "active");
      ptSubs = data || [];
    }

    const trainerClientCount = new Map<string, number>();
    for (const pt of ptSubs) {
      trainerClientCount.set(pt.personal_trainer_id, (trainerClientCount.get(pt.personal_trainer_id) || 0) + 1);
    }

    const trainerRows = (trainers || []).map((t: any) => [
      t.name,
      t.phone || "N/A",
      t.specialization || "General",
      t.monthly_fee,
      trainerClientCount.get(t.id) || 0,
      t.is_active ? "Active" : "Inactive",
    ]);

    sheets.push({
      name: "Trainers",
      headers: ["Name", "Phone", "Specialization", "Monthly Fee (₹)", "Active Clients", "Status"],
      rows: trainerRows,
    });

    summaryRows.push(
      ["Total Trainers", trainers?.length || 0],
      ["Active Trainers", (trainers || []).filter((t: any) => t.is_active).length],
      ["Total PT Clients", ptSubs.length],
      ["", ""],
    );
  }

  // 5. Branch analysis
  if (config.includeBranchAnalysis !== false) {
    // Daily pass data
    const { data: dailyPasses } = await supabase
      .from("daily_pass_users")
      .select("id")
      .eq("branch_id", branchId);

    summaryRows.push(
      ["Daily Pass Users", dailyPasses?.length || 0],
    );
  }

  // Add summary as first sheet
  sheets.unshift({
    name: "Summary",
    headers: ["Metric", "Value"],
    rows: [
      ["Report", label],
      ["Branch", branchName],
      ["Generated At", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
      ["", ""],
      ...summaryRows,
    ],
  });

  // Generate Excel
  const excelContent = generateExcelXml(sheets);
  const filename = `${branchName.replace(/[^a-zA-Z0-9]/g, "_")}_Report_${config.frequency}_${new Date().toISOString().split("T")[0]}.xls`;

  // Send email
  let emailResult = { success: false, error: "No email configured" };
  if (config.reportEmail) {
    emailResult = await sendEmailWithResend(
      config.reportEmail,
      `${branchName} - ${label}`,
      `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 32px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0 0 8px 0; font-size: 24px;">📊 ${branchName}</h1>
          <p style="margin: 0; opacity: 0.9; font-size: 14px;">${label}</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
          <p style="margin: 0 0 12px 0; color: #333;">Hi,</p>
          <p style="margin: 0 0 12px 0; color: #555;">Your ${config.frequency} gym report is ready. Please find the Excel report attached.</p>
          <p style="margin: 0; color: #888; font-size: 12px;">This is an automated report from GymKloud.</p>
        </div>
      </div>
      `,
      { filename, content: excelContent }
    );
  }

  // Send WhatsApp notification (optional)
  let whatsappResult = { success: false };
  if (config.sendWhatsapp && config.whatsappPhone) {
    try {
      const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
      const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");
      if (PERISKOPE_API_KEY && PERISKOPE_PHONE) {
        const message = `📊 *${branchName} - ${label}*\n\nYour ${config.frequency} gym report has been generated and sent to your email.\n\n_Powered by GymKloud_`;
        
        const waRes = await fetch("https://api.periskope.app/v1/message/sendMessage", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${PERISKOPE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phoneNumber: PERISKOPE_PHONE,
            receiverPhoneNumber: config.whatsappPhone.startsWith("91") ? config.whatsappPhone : `91${config.whatsappPhone}`,
            message,
          }),
        });
        whatsappResult = { success: waRes.ok };
      }
    } catch (e) {
      console.error("WhatsApp send error:", e);
    }
  }

  return {
    success: true,
    emailSent: emailResult.success,
    whatsappSent: whatsappResult.success,
    sheetsGenerated: sheets.length,
  };
}
