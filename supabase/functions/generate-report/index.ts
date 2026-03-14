/**
 * Generate Report Edge Function
 * 
 * Generates reports in multiple formats (Excel, PDF, Dashboard Link, WhatsApp Summary)
 * and sends them via email/WhatsApp.
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
  reportFormat?: string;
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
    xml += `<Row>`;
    for (const h of sheet.headers) {
      xml += `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`;
    }
    xml += `</Row>`;
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Generate a styled PDF-like HTML report
function generatePdfHtml(branchName: string, label: string, summaryRows: (string | number)[][], sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]): string {
  let sectionsHtml = '';
  
  for (const sheet of sheets) {
    if (sheet.name === 'Summary') continue;
    sectionsHtml += `
    <div style="margin-bottom: 24px;">
      <h3 style="color: #4472C4; font-size: 16px; margin: 0 0 12px 0; border-bottom: 2px solid #4472C4; padding-bottom: 6px;">${escapeHtml(sheet.name)}</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr>${sheet.headers.map(h => `<th style="background: #4472C4; color: white; padding: 8px 12px; text-align: left; font-size: 11px;">${escapeHtml(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${sheet.rows.slice(0, 50).map((row, i) => `
            <tr style="background: ${i % 2 === 0 ? '#f8f9fa' : '#ffffff'};">
              ${row.map(cell => `<td style="padding: 6px 12px; border-bottom: 1px solid #e9ecef; font-size: 11px;">${escapeHtml(String(cell ?? ''))}</td>`).join('')}
            </tr>
          `).join('')}
          ${sheet.rows.length > 50 ? `<tr><td colspan="${sheet.headers.length}" style="padding: 8px; text-align: center; color: #888; font-style: italic;">... and ${sheet.rows.length - 50} more rows</td></tr>` : ''}
        </tbody>
      </table>
    </div>`;
  }

  // Summary metrics
  const metricsHtml = summaryRows
    .filter(r => r[0] !== '' && r[1] !== '')
    .map(r => `<tr><td style="padding: 6px 12px; font-weight: 500; color: #333;">${escapeHtml(String(r[0]))}</td><td style="padding: 6px 12px; text-align: right; font-weight: 600; color: #4472C4;">${typeof r[1] === 'number' ? r[1].toLocaleString('en-IN') : escapeHtml(String(r[1]))}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${escapeHtml(branchName)} - ${escapeHtml(label)}</title></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 32px; color: #333;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 32px; color: white; text-align: center; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 28px;">📊 ${escapeHtml(branchName)}</h1>
    <p style="margin: 0; opacity: 0.9; font-size: 14px;">${escapeHtml(label)}</p>
    <p style="margin: 8px 0 0 0; opacity: 0.7; font-size: 12px;">Generated on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
  </div>

  <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #333;">📋 Key Metrics</h2>
    <table style="width: 100%; border-collapse: collapse;">
      ${metricsHtml}
    </table>
  </div>

  ${sectionsHtml}

  <div style="text-align: center; color: #888; font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e9ecef;">
    <p>This report was automatically generated by GymKloud</p>
  </div>
</body>
</html>`;
}

// Generate a WhatsApp-friendly text summary
function generateWhatsAppSummary(branchName: string, label: string, summaryRows: (string | number)[][]): string {
  let text = `📊 *${branchName}*\n${label}\n\n`;
  
  let currentSection = '';
  for (const row of summaryRows) {
    if (row[0] === '' && row[1] === '') {
      text += '\n';
      continue;
    }
    const metric = String(row[0]);
    const value = typeof row[1] === 'number' ? row[1].toLocaleString('en-IN') : String(row[1]);
    
    if (metric.includes('Revenue') || metric.includes('Amount')) {
      text += `💰 ${metric}: ₹${value}\n`;
    } else if (metric.includes('Members') || metric.includes('Member')) {
      text += `👥 ${metric}: ${value}\n`;
    } else if (metric.includes('Check-in') || metric.includes('Attendance')) {
      text += `✅ ${metric}: ${value}\n`;
    } else if (metric.includes('Trainer')) {
      text += `🏋️ ${metric}: ${value}\n`;
    } else {
      text += `▪️ ${metric}: ${value}\n`;
    }
  }
  
  text += `\n📅 Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n_Powered by GymKloud_`;
  return text;
}

async function sendEmailWithResend(to: string, subject: string, html: string, attachment?: { filename: string; content: string; contentType?: string }) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "Email not configured" };
  }

  const emailPayload: Record<string, unknown> = {
    from: "GymKloud Reports <hello@gymkloud.in>",
    to: [to],
    subject,
    html,
  };

  if (attachment) {
    const encoder = new TextEncoder();
    const uint8 = encoder.encode(attachment.content);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64Content = btoa(binary);

    emailPayload.attachments = [{
      filename: attachment.filename,
      content: base64Content,
      ...(attachment.contentType ? { content_type: attachment.contentType } : {}),
    }];
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
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
              reportFormat: schedule.report_format || 'excel',
            });

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

      // Manual trigger
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
  next.setUTCHours(3, 30, 0, 0);
  switch (frequency) {
    case "daily": next.setDate(next.getDate() + 1); break;
    case "weekly": next.setDate(next.getDate() + 7); break;
    case "monthly": next.setMonth(next.getMonth() + 1); break;
    default: next.setDate(next.getDate() + 7);
  }
  return next;
}

// deno-lint-ignore no-explicit-any
async function collectReportData(supabase: any, config: ReportConfig) {
  const { branchId } = config;
  const { start, end, label } = getDateRange(config.frequency);
  const startStr = start.toISOString();
  const endStr = end.toISOString();
  const startDate = start.toISOString().split("T")[0];
  const endDate = end.toISOString().split("T")[0];

  const { data: branch } = await supabase
    .from("branches")
    .select("name, address, phone")
    .eq("id", branchId)
    .single();

  const branchName = branch?.name || "Gym";
  const sheets: { name: string; headers: string[]; rows: (string | number)[][] }[] = [];
  const summaryRows: (string | number)[][] = [];

  // 1. Payments
  if (config.includePayments !== false) {
    const { data: payments } = await supabase
      .from("payments")
      .select("id, amount, payment_mode, status, created_at, payment_type, notes")
      .eq("branch_id", branchId)
      .gte("created_at", startStr)
      .lte("created_at", endStr)
      .order("created_at", { ascending: false });

    sheets.push({
      name: "Payments",
      headers: ["Date", "Amount (₹)", "Mode", "Status", "Type", "Notes"],
      rows: (payments || []).map((p: any) => [
        new Date(p.created_at).toLocaleDateString("en-IN"),
        p.amount, p.payment_mode || "N/A", p.status || "N/A",
        p.payment_type || "gym_membership", p.notes || "",
      ]),
    });

    const totalRevenue = (payments || []).filter((p: any) => p.status === "success").reduce((sum: number, p: any) => sum + Number(p.amount), 0);
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

  // 2. Memberships
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

    const latestSubs = new Map();
    for (const sub of subscriptions) {
      if (!latestSubs.has(sub.member_id)) latestSubs.set(sub.member_id, sub);
    }

    sheets.push({
      name: "Members",
      headers: ["Name", "Phone", "Email", "Status", "Start Date", "End Date", "Plan Months"],
      rows: (members || []).map((m: any) => {
        const sub = latestSubs.get(m.id);
        return [m.name, m.phone, m.email || "N/A", sub?.status || "No Subscription", sub?.start_date || "N/A", sub?.end_date || "N/A", sub?.plan_months || 0];
      }),
    });

    const activeCount = [...latestSubs.values()].filter((s: any) => s.status === "active").length;
    const expiredCount = [...latestSubs.values()].filter((s: any) => s.status === "expired").length;
    const expiringSoon = [...latestSubs.values()].filter((s: any) => s.status === "expiring_soon").length;
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

  // 3. Attendance
  if (config.includeAttendance !== false) {
    const { data: attendance } = await supabase
      .from("attendance_logs")
      .select("id, date, check_in_at, check_out_at, total_hours, user_type, member_id, staff_id")
      .eq("branch_id", branchId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .limit(500);

    sheets.push({
      name: "Attendance",
      headers: ["Date", "User Type", "Check In", "Check Out", "Hours"],
      rows: (attendance || []).map((a: any) => [
        a.date, a.user_type || "member",
        new Date(a.check_in_at).toLocaleTimeString("en-IN"),
        a.check_out_at ? new Date(a.check_out_at).toLocaleTimeString("en-IN") : "N/A",
        a.total_hours || 0,
      ]),
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

  // 4. Trainers
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

    sheets.push({
      name: "Trainers",
      headers: ["Name", "Phone", "Specialization", "Monthly Fee (₹)", "Active Clients", "Status"],
      rows: (trainers || []).map((t: any) => [
        t.name, t.phone || "N/A", t.specialization || "General",
        t.monthly_fee, trainerClientCount.get(t.id) || 0,
        t.is_active ? "Active" : "Inactive",
      ]),
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
    const { data: dailyPasses } = await supabase
      .from("daily_pass_users")
      .select("id")
      .eq("branch_id", branchId);

    summaryRows.push(["Daily Pass Users", dailyPasses?.length || 0]);
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

  return { sheets, summaryRows, branchName, label };
}

// deno-lint-ignore no-explicit-any
async function generateAndSendReport(supabase: any, config: ReportConfig) {
  const { sheets, summaryRows, branchName, label } = await collectReportData(supabase, config);
  const format = config.reportFormat || 'excel';
  const dateStr = new Date().toISOString().split("T")[0];
  const safeBranchName = branchName.replace(/[^a-zA-Z0-9]/g, "_");

  let emailResult = { success: false, error: "No email configured" };
  let whatsappResult = { success: false };

  const emailWrapperHtml = (innerContent: string) => `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 32px; color: white; text-align: center; margin-bottom: 24px;">
        <h1 style="margin: 0 0 8px 0; font-size: 24px;">📊 ${escapeHtml(branchName)}</h1>
        <p style="margin: 0; opacity: 0.9; font-size: 14px;">${escapeHtml(label)}</p>
      </div>
      ${innerContent}
    </div>`;

  switch (format) {
    case 'pdf': {
      // Send the PDF-style HTML report as attachment
      const pdfHtml = generatePdfHtml(branchName, label, summaryRows, sheets);
      if (config.reportEmail) {
        emailResult = await sendEmailWithResend(
          config.reportEmail,
          `${branchName} - ${label}`,
          emailWrapperHtml(`
            <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
              <p style="margin: 0 0 12px 0; color: #333;">Hi,</p>
              <p style="margin: 0 0 12px 0; color: #555;">Your ${config.frequency} gym report is ready. Please find the PDF report attached.</p>
              <p style="margin: 0; color: #888; font-size: 12px;">This is an automated report from GymKloud.</p>
            </div>
          `),
          { filename: `${safeBranchName}_Report_${config.frequency}_${dateStr}.html`, content: pdfHtml, contentType: 'text/html' }
        );
      }
      break;
    }

    case 'dashboard_link': {
      // Send email with a link to the admin analytics dashboard
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || '';
      // Use the published app URL for dashboard link
      const dashboardUrl = `https://gym-qr-pro.lovable.app/admin/analytics`;
      
      if (config.reportEmail) {
        const metricsPreview = summaryRows
          .filter(r => r[0] !== '' && r[1] !== '')
          .slice(0, 6)
          .map(r => `<tr><td style="padding: 4px 8px; color: #555;">${escapeHtml(String(r[0]))}</td><td style="padding: 4px 8px; text-align: right; font-weight: 600; color: #4472C4;">${typeof r[1] === 'number' ? r[1].toLocaleString('en-IN') : escapeHtml(String(r[1]))}</td></tr>`)
          .join('');

        emailResult = await sendEmailWithResend(
          config.reportEmail,
          `${branchName} - ${label}`,
          emailWrapperHtml(`
            <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
              <p style="margin: 0 0 12px 0; color: #333;">Hi,</p>
              <p style="margin: 0 0 12px 0; color: #555;">Your ${config.frequency} report summary is ready. View detailed analytics on your dashboard.</p>
              <table style="width: 100%; margin: 16px 0;">${metricsPreview}</table>
              <div style="text-align: center; margin-top: 20px;">
                <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">📊 Open Dashboard</a>
              </div>
              <p style="margin: 16px 0 0 0; color: #888; font-size: 12px;">This is an automated report from GymKloud.</p>
            </div>
          `)
        );
      }
      break;
    }

    case 'whatsapp_summary': {
      // Send WhatsApp message with summary + optional email
      const summaryText = generateWhatsAppSummary(branchName, label, summaryRows);
      
      // Also send email with summary
      if (config.reportEmail) {
        const metricsHtml = summaryRows
          .filter(r => r[0] !== '' && r[1] !== '')
          .map(r => `<tr><td style="padding: 6px 12px; color: #555;">${escapeHtml(String(r[0]))}</td><td style="padding: 6px 12px; text-align: right; font-weight: 600; color: #4472C4;">${typeof r[1] === 'number' ? '₹' + r[1].toLocaleString('en-IN') : escapeHtml(String(r[1]))}</td></tr>`)
          .join('');
        
        emailResult = await sendEmailWithResend(
          config.reportEmail,
          `${branchName} - ${label}`,
          emailWrapperHtml(`
            <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
              <p style="margin: 0 0 12px 0; color: #333;">Hi,</p>
              <p style="margin: 0 0 12px 0; color: #555;">Here's your ${config.frequency} report summary. A WhatsApp summary has also been sent.</p>
              <table style="width: 100%; margin: 16px 0;">${metricsHtml}</table>
              <p style="margin: 0; color: #888; font-size: 12px;">This is an automated report from GymKloud.</p>
            </div>
          `)
        );
      }

      // Force send WhatsApp summary regardless of sendWhatsapp toggle
      if (config.whatsappPhone) {
        try {
          const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
          const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");
          if (PERISKOPE_API_KEY && PERISKOPE_PHONE) {
            const waRes = await fetch("https://api.periskope.app/v1/message/sendMessage", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${PERISKOPE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                phoneNumber: PERISKOPE_PHONE,
                receiverPhoneNumber: config.whatsappPhone.startsWith("91") ? config.whatsappPhone : `91${config.whatsappPhone}`,
                message: summaryText,
              }),
            });
            whatsappResult = { success: waRes.ok };
          }
        } catch (e) {
          console.error("WhatsApp send error:", e);
        }
      }
      break;
    }

    case 'excel':
    default: {
      // Original Excel format
      const excelContent = generateExcelXml(sheets);
      const filename = `${safeBranchName}_Report_${config.frequency}_${dateStr}.xls`;

      if (config.reportEmail) {
        emailResult = await sendEmailWithResend(
          config.reportEmail,
          `${branchName} - ${label}`,
          emailWrapperHtml(`
            <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
              <p style="margin: 0 0 12px 0; color: #333;">Hi,</p>
              <p style="margin: 0 0 12px 0; color: #555;">Your ${config.frequency} gym report is ready. Please find the Excel report attached.</p>
              <p style="margin: 0; color: #888; font-size: 12px;">This is an automated report from GymKloud.</p>
            </div>
          `),
          { filename, content: excelContent }
        );
      }
      break;
    }
  }

  // Send WhatsApp notification for non-whatsapp_summary formats
  if (format !== 'whatsapp_summary' && config.sendWhatsapp && config.whatsappPhone) {
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
    format,
  };
}
