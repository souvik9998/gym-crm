/**
 * Generate Report Edge Function
 * 
 * Generates reports in multiple formats (Excel, PDF, Visual Dashboard)
 * and sends them via email or WhatsApp.
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
  deliveryChannel?: 'email' | 'whatsapp';
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

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatCurrency(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

// ─── Excel XML Generation (improved styling) ───

function generateExcelXml(sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="Title">
    <Font ss:Bold="1" ss:Size="14" ss:Color="#1a1a1a"/>
    <Interior ss:Color="#E8EAF6" ss:Pattern="Solid"/>
    <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Header">
    <Font ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#3F51B5" ss:Pattern="Solid"/>
    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#283593"/>
    </Borders>
  </Style>
  <Style ss:ID="DataEven">
    <Font ss:Size="10" ss:Color="#333333"/>
    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
    <Alignment ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>
    </Borders>
  </Style>
  <Style ss:ID="DataOdd">
    <Font ss:Size="10" ss:Color="#333333"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Alignment ss:Vertical="Center"/>
    <Borders>
      <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E0E0E0"/>
    </Borders>
  </Style>
  <Style ss:ID="Currency">
    <Font ss:Size="10" ss:Color="#1B5E20"/>
    <NumberFormat ss:Format="₹#,##0.00"/>
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="MetricLabel">
    <Font ss:Bold="1" ss:Size="11" ss:Color="#333333"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="MetricValue">
    <Font ss:Bold="1" ss:Size="11" ss:Color="#3F51B5"/>
    <Interior ss:Color="#F5F5F5" ss:Pattern="Solid"/>
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
</Styles>`;

  for (const sheet of sheets) {
    xml += `<Worksheet ss:Name="${escapeXml(sheet.name)}">
<Table ss:DefaultColumnWidth="120">`;

    // Set column widths
    for (let i = 0; i < sheet.headers.length; i++) {
      const width = sheet.name === "Summary" ? (i === 0 ? 200 : 150) : 140;
      xml += `<Column ss:Width="${width}"/>`;
    }

    // Headers
    xml += `<Row ss:Height="32">`;
    for (const h of sheet.headers) {
      xml += `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`;
    }
    xml += `</Row>`;

    // Data rows with alternating styles
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      const isSummary = sheet.name === "Summary";
      const isEmpty = row[0] === "" && row[1] === "";
      
      if (isEmpty) {
        xml += `<Row ss:Height="8"><Cell><Data ss:Type="String"></Data></Cell></Row>`;
        continue;
      }

      xml += `<Row ss:Height="24">`;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        let styleId = r % 2 === 0 ? "DataEven" : "DataOdd";
        
        if (isSummary) {
          styleId = c === 0 ? "MetricLabel" : "MetricValue";
        }

        if (typeof cell === "number") {
          xml += `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${cell}</Data></Cell>`;
        } else {
          xml += `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(String(cell || ""))}</Data></Cell>`;
        }
      }
      xml += `</Row>`;
    }
    xml += `</Table></Worksheet>`;
  }

  xml += `</Workbook>`;
  return xml;
}

// ─── Visual Dashboard HTML (rendered as inline email) ───

function generateVisualDashboardHtml(branchName: string, label: string, summaryRows: (string | number)[][], sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]): string {
  // Extract key metrics
  const metrics: Record<string, number> = {};
  for (const row of summaryRows) {
    if (row[0] && row[1] !== '' && typeof row[1] === 'number') {
      metrics[String(row[0])] = row[1];
    }
  }

  const totalRevenue = metrics['Total Revenue'] || 0;
  const totalMembers = metrics['Total Members'] || 0;
  const activeMembers = metrics['Active Members'] || 0;
  const expiringSoon = metrics['Expiring Soon'] || 0;
  const expiredMembers = metrics['Expired Members'] || 0;
  const totalCheckins = metrics['Total Check-ins'] || 0;
  const totalTransactions = metrics['Total Transactions'] || 0;
  const cashPayments = metrics['Cash Payments'] || 0;
  const onlinePayments = metrics['Online Payments'] || 0;
  const totalTrainers = metrics['Total Trainers'] || 0;
  const activeTrainers = metrics['Active Trainers'] || 0;
  const ptClients = metrics['Total PT Clients'] || 0;
  const newMembers = metrics['New Members (Period)'] || 0;
  const dailyPassUsers = metrics['Daily Pass Users'] || 0;

  // Calculate percentages for visual bars
  const activePercent = totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 100) : 0;
  const expiredPercent = totalMembers > 0 ? Math.round((expiredMembers / totalMembers) * 100) : 0;
  const expiringPercent = totalMembers > 0 ? Math.round((expiringSoon / totalMembers) * 100) : 0;

  const cardStyle = `background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;`;
  const metricBig = `font-size: 28px; font-weight: 700; margin: 0; line-height: 1.2;`;
  const metricLabel = `font-size: 12px; color: #6b7280; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;`;
  const barBg = `background: #f3f4f6; border-radius: 6px; height: 8px; width: 100%; overflow: hidden;`;

  // Recent payments table
  const paymentsSheet = sheets.find(s => s.name === 'Payments');
  const recentPayments = paymentsSheet?.rows.slice(0, 5) || [];

  // Trainer data
  const trainersSheet = sheets.find(s => s.name === 'Trainers');
  const trainerRows = trainersSheet?.rows.slice(0, 5) || [];

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(branchName)} - ${escapeHtml(label)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 0; color: #1a1a2e;">
  <div style="max-width: 640px; margin: 0 auto; padding: 24px 16px;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 32px 24px; color: white; text-align: center; margin-bottom: 20px;">
      <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 700;">📊 ${escapeHtml(branchName)}</h1>
      <p style="margin: 0; opacity: 0.9; font-size: 14px;">${escapeHtml(label)}</p>
      <p style="margin: 8px 0 0 0; opacity: 0.7; font-size: 11px;">Generated on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
    </div>

    <!-- Revenue Card -->
    <div style="${cardStyle} margin-bottom: 12px; background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border-color: #bbf7d0;">
      <p style="${metricLabel} color: #15803d;">💰 TOTAL REVENUE</p>
      <p style="${metricBig} color: #15803d;">${formatCurrency(totalRevenue)}</p>
      <div style="display: flex; gap: 24px; margin-top: 12px;">
        <div>
          <p style="font-size: 18px; font-weight: 600; margin: 0; color: #333;">${totalTransactions}</p>
          <p style="font-size: 11px; color: #6b7280; margin: 2px 0 0 0;">Transactions</p>
        </div>
        <div>
          <p style="font-size: 18px; font-weight: 600; margin: 0; color: #333;">${cashPayments}</p>
          <p style="font-size: 11px; color: #6b7280; margin: 2px 0 0 0;">Cash</p>
        </div>
        <div>
          <p style="font-size: 18px; font-weight: 600; margin: 0; color: #333;">${onlinePayments}</p>
          <p style="font-size: 11px; color: #6b7280; margin: 2px 0 0 0;">Online</p>
        </div>
      </div>
    </div>

    <!-- Members Grid -->
    <div style="display: flex; gap: 12px; margin-bottom: 12px;">
      <div style="${cardStyle} flex: 1; text-align: center;">
        <p style="${metricBig} color: #3b82f6;">${totalMembers}</p>
        <p style="${metricLabel}">👥 Total Members</p>
      </div>
      <div style="${cardStyle} flex: 1; text-align: center;">
        <p style="${metricBig} color: #22c55e;">${activeMembers}</p>
        <p style="${metricLabel}">✅ Active</p>
      </div>
      <div style="${cardStyle} flex: 1; text-align: center;">
        <p style="${metricBig} color: #f59e0b;">${newMembers}</p>
        <p style="${metricLabel}">🆕 New</p>
      </div>
    </div>

    <!-- Member Status Breakdown -->
    <div style="${cardStyle} margin-bottom: 12px;">
      <p style="font-size: 14px; font-weight: 600; margin: 0 0 16px 0;">📊 Member Status Breakdown</p>
      
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 12px; color: #333;">Active Members</span>
          <span style="font-size: 12px; font-weight: 600; color: #22c55e;">${activeMembers} (${activePercent}%)</span>
        </div>
        <div style="${barBg}"><div style="background: #22c55e; height: 100%; width: ${activePercent}%; border-radius: 6px;"></div></div>
      </div>
      
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 12px; color: #333;">Expiring Soon</span>
          <span style="font-size: 12px; font-weight: 600; color: #f59e0b;">${expiringSoon} (${expiringPercent}%)</span>
        </div>
        <div style="${barBg}"><div style="background: #f59e0b; height: 100%; width: ${expiringPercent}%; border-radius: 6px;"></div></div>
      </div>
      
      <div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 12px; color: #333;">Expired Members</span>
          <span style="font-size: 12px; font-weight: 600; color: #ef4444;">${expiredMembers} (${expiredPercent}%)</span>
        </div>
        <div style="${barBg}"><div style="background: #ef4444; height: 100%; width: ${expiredPercent}%; border-radius: 6px;"></div></div>
      </div>
    </div>

    <!-- Attendance & Trainers Row -->
    <div style="display: flex; gap: 12px; margin-bottom: 12px;">
      <div style="${cardStyle} flex: 1;">
        <p style="${metricLabel}">✅ CHECK-INS</p>
        <p style="${metricBig} color: #8b5cf6;">${totalCheckins}</p>
      </div>
      <div style="${cardStyle} flex: 1;">
        <p style="${metricLabel}">🏋️ TRAINERS</p>
        <p style="${metricBig} color: #ec4899;">${activeTrainers}/${totalTrainers}</p>
        <p style="font-size: 11px; color: #6b7280; margin: 2px 0 0 0;">${ptClients} PT clients</p>
      </div>
      <div style="${cardStyle} flex: 1;">
        <p style="${metricLabel}">🎫 DAILY PASS</p>
        <p style="${metricBig} color: #06b6d4;">${dailyPassUsers}</p>
      </div>
    </div>

    <!-- Recent Payments Table -->
    ${recentPayments.length > 0 ? `
    <div style="${cardStyle} margin-bottom: 12px;">
      <p style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">💳 Recent Payments</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 8px 6px; text-align: left; color: #6b7280; font-weight: 600;">Date</th>
            <th style="padding: 8px 6px; text-align: right; color: #6b7280; font-weight: 600;">Amount</th>
            <th style="padding: 8px 6px; text-align: center; color: #6b7280; font-weight: 600;">Mode</th>
            <th style="padding: 8px 6px; text-align: center; color: #6b7280; font-weight: 600;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${recentPayments.map((row, i) => `
            <tr style="border-bottom: 1px solid #f3f4f6; ${i % 2 === 1 ? 'background: #f9fafb;' : ''}">
              <td style="padding: 8px 6px;">${escapeHtml(String(row[0]))}</td>
              <td style="padding: 8px 6px; text-align: right; font-weight: 600; color: #15803d;">${typeof row[1] === 'number' ? formatCurrency(row[1]) : escapeHtml(String(row[1]))}</td>
              <td style="padding: 8px 6px; text-align: center;">
                <span style="background: ${String(row[2]) === 'cash' ? '#fef3c7' : '#dbeafe'}; color: ${String(row[2]) === 'cash' ? '#92400e' : '#1e40af'}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(String(row[2]))}</span>
              </td>
              <td style="padding: 8px 6px; text-align: center;">
                <span style="background: ${String(row[3]) === 'success' ? '#dcfce7' : '#fee2e2'}; color: ${String(row[3]) === 'success' ? '#15803d' : '#991b1b'}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(String(row[3]))}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Trainers Table -->
    ${trainerRows.length > 0 ? `
    <div style="${cardStyle} margin-bottom: 12px;">
      <p style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">🏋️ Trainer Overview</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 8px 6px; text-align: left; color: #6b7280; font-weight: 600;">Name</th>
            <th style="padding: 8px 6px; text-align: center; color: #6b7280; font-weight: 600;">Specialization</th>
            <th style="padding: 8px 6px; text-align: center; color: #6b7280; font-weight: 600;">Clients</th>
            <th style="padding: 8px 6px; text-align: center; color: #6b7280; font-weight: 600;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${trainerRows.map((row, i) => `
            <tr style="border-bottom: 1px solid #f3f4f6; ${i % 2 === 1 ? 'background: #f9fafb;' : ''}">
              <td style="padding: 8px 6px; font-weight: 500;">${escapeHtml(String(row[0]))}</td>
              <td style="padding: 8px 6px; text-align: center;">${escapeHtml(String(row[2]))}</td>
              <td style="padding: 8px 6px; text-align: center; font-weight: 600; color: #7c3aed;">${row[4]}</td>
              <td style="padding: 8px 6px; text-align: center;">
                <span style="background: ${String(row[5]) === 'Active' ? '#dcfce7' : '#fee2e2'}; color: ${String(row[5]) === 'Active' ? '#15803d' : '#991b1b'}; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${escapeHtml(String(row[5]))}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Footer -->
    <div style="text-align: center; padding: 16px 0; color: #9ca3af; font-size: 11px;">
      <p style="margin: 0;">This report was automatically generated by <strong>GymKloud</strong></p>
    </div>
  </div>
</body>
</html>`;
}

// ─── PDF HTML Generation ───

function generatePdfReportHtml(branchName: string, label: string, summaryRows: (string | number)[][], sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]): string {
  let sectionsHtml = '';
  
  for (const sheet of sheets) {
    if (sheet.name === 'Summary') continue;
    sectionsHtml += `
    <div style="margin-bottom: 28px; page-break-inside: avoid;">
      <h3 style="color: #3F51B5; font-size: 16px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #3F51B5;">${escapeHtml(sheet.name)}</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr>
            ${sheet.headers.map(h => `<th style="background: #3F51B5; color: white; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600;">${escapeHtml(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${sheet.rows.slice(0, 100).map((row, i) => `
            <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
              ${row.map((cell, ci) => {
                const val = typeof cell === 'number' && (sheet.headers[ci]?.includes('₹') || sheet.headers[ci]?.includes('Amount') || sheet.headers[ci]?.includes('Fee')) 
                  ? formatCurrency(cell) 
                  : escapeHtml(String(cell ?? ''));
                return `<td style="padding: 8px 12px; border-bottom: 1px solid #e9ecef; font-size: 11px;">${val}</td>`;
              }).join('')}
            </tr>
          `).join('')}
          ${sheet.rows.length > 100 ? `<tr><td colspan="${sheet.headers.length}" style="padding: 10px; text-align: center; color: #9ca3af; font-style: italic; font-size: 11px;">... and ${sheet.rows.length - 100} more rows</td></tr>` : ''}
        </tbody>
      </table>
    </div>`;
  }

  const metricsHtml = summaryRows
    .filter(r => r[0] !== '' && r[1] !== '')
    .map(r => {
      const val = typeof r[1] === 'number' 
        ? (String(r[0]).includes('Revenue') || String(r[0]).includes('Amount') ? formatCurrency(r[1]) : r[1].toLocaleString('en-IN'))
        : escapeHtml(String(r[1]));
      return `<tr>
        <td style="padding: 8px 16px; font-weight: 500; color: #333; border-bottom: 1px solid #f3f4f6;">${escapeHtml(String(r[0]))}</td>
        <td style="padding: 8px 16px; text-align: right; font-weight: 700; color: #3F51B5; border-bottom: 1px solid #f3f4f6;">${val}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(branchName)} - ${escapeHtml(label)}</title>
  <style>
    @media print {
      body { margin: 0; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 32px; color: #333; background: white;">
  
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 32px; color: white; text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">📊 ${escapeHtml(branchName)}</h1>
    <p style="margin: 0; opacity: 0.9; font-size: 15px;">${escapeHtml(label)}</p>
    <p style="margin: 8px 0 0 0; opacity: 0.7; font-size: 12px;">Generated on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
  </div>

  <!-- Key Metrics -->
  <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 32px; border: 1px solid #e5e7eb;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #333; font-weight: 600;">📋 Key Metrics</h2>
    <table style="width: 100%; border-collapse: collapse;">
      ${metricsHtml}
    </table>
  </div>

  <!-- Data Sections -->
  ${sectionsHtml}

  <!-- Footer -->
  <div style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
    <p style="margin: 0;">This report was automatically generated by <strong>GymKloud</strong></p>
    <p style="margin: 4px 0 0 0;">© ${new Date().getFullYear()} GymKloud. All rights reserved.</p>
  </div>
</body>
</html>`;
}

// ─── WhatsApp text summary ───

function generateWhatsAppSummary(branchName: string, label: string, summaryRows: (string | number)[][]): string {
  let text = `📊 *${branchName}*\n📅 ${label}\n\n`;
  
  for (const row of summaryRows) {
    if (row[0] === '' && row[1] === '') {
      text += '\n';
      continue;
    }
    const metric = String(row[0]);
    const value = typeof row[1] === 'number' ? row[1].toLocaleString('en-IN') : String(row[1]);
    
    if (metric.includes('Revenue')) {
      text += `💰 ${metric}: ₹${value}\n`;
    } else if (metric.includes('Members') || metric.includes('Member')) {
      text += `👥 ${metric}: ${value}\n`;
    } else if (metric.includes('Check-in')) {
      text += `✅ ${metric}: ${value}\n`;
    } else if (metric.includes('Trainer') || metric.includes('PT')) {
      text += `🏋️ ${metric}: ${value}\n`;
    } else if (metric.includes('Transaction') || metric.includes('Payment')) {
      text += `💳 ${metric}: ${value}\n`;
    } else if (metric.includes('Daily Pass')) {
      text += `🎫 ${metric}: ${value}\n`;
    } else {
      text += `▪️ ${metric}: ${value}\n`;
    }
  }
  
  text += `\n📅 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n_Powered by GymKloud_`;
  return text;
}

// ─── Email sender ───

async function sendEmailWithResend(to: string, subject: string, html: string, attachment?: { filename: string; content: string; contentType?: string }) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured");
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
    emailPayload.attachments = [{
      filename: attachment.filename,
      content: btoa(binary),
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

// ─── WhatsApp sender ───

async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  try {
    const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
    const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");
    if (!PERISKOPE_API_KEY || !PERISKOPE_PHONE) return false;

    const waRes = await fetch("https://api.periskope.app/v1/message/sendMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERISKOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber: PERISKOPE_PHONE,
        receiverPhoneNumber: phone.startsWith("91") ? phone : `91${phone}`,
        message,
      }),
    });
    return waRes.ok;
  } catch (e) {
    console.error("WhatsApp error:", e);
    return false;
  }
}

// ─── Main handler ───

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
              whatsappPhone: schedule.whatsapp_phone,
              includePayments: schedule.include_payments,
              includeMemberships: schedule.include_memberships,
              includeAttendance: schedule.include_attendance,
              includeTrainers: schedule.include_trainers,
              includeBranchAnalysis: schedule.include_branch_analysis,
              reportFormat: schedule.report_format || 'excel',
              deliveryChannel: 'email',
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

// ─── Data collection ───

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

    const successPayments = (payments || []).filter((p: any) => p.status === "success");
    const totalRevenue = successPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    summaryRows.push(
      ["Total Revenue", totalRevenue],
      ["Total Transactions", payments?.length || 0],
      ["Cash Payments", successPayments.filter((p: any) => p.payment_mode === "cash").length],
      ["Online Payments", successPayments.filter((p: any) => p.payment_mode === "online").length],
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
      .select("id, date, check_in_at, check_out_at, total_hours, user_type")
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

    summaryRows.push(
      ["Total Check-ins", attendance?.length || 0],
      ["Member Check-ins", (attendance || []).filter((a: any) => a.user_type === "member").length],
      ["Staff Check-ins", (attendance || []).filter((a: any) => a.user_type === "staff").length],
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

  // Summary sheet
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

// ─── Main report generator ───

// deno-lint-ignore no-explicit-any
async function generateAndSendReport(supabase: any, config: ReportConfig) {
  const { sheets, summaryRows, branchName, label } = await collectReportData(supabase, config);
  const format = config.reportFormat || 'excel';
  const channel = config.deliveryChannel || 'email';
  const dateStr = new Date().toISOString().split("T")[0];
  const safeBranchName = branchName.replace(/[^a-zA-Z0-9]/g, "_");

  let emailResult = { success: false, error: "Not sent" };
  let whatsappSent = false;

  // Generate content based on format
  let emailSubject = `${branchName} - ${label}`;
  let emailHtml = '';
  let attachment: { filename: string; content: string; contentType?: string } | undefined;
  let whatsappMessage = '';

  switch (format) {
    case 'pdf': {
      const pdfContent = generatePdfReportHtml(branchName, label, summaryRows, sheets);
      emailHtml = pdfContent; // Send the full styled report as the email body itself
      attachment = {
        filename: `${safeBranchName}_Report_${dateStr}.html`,
        content: pdfContent,
        contentType: 'text/html',
      };
      emailSubject = `📄 ${branchName} - ${label}`;
      whatsappMessage = generateWhatsAppSummary(branchName, label, summaryRows);
      break;
    }

    case 'visual_dashboard': {
      // Send the visual dashboard as the email body (renders as rich HTML in email clients)
      emailHtml = generateVisualDashboardHtml(branchName, label, summaryRows, sheets);
      emailSubject = `📈 ${branchName} - ${label}`;
      whatsappMessage = generateWhatsAppSummary(branchName, label, summaryRows);
      break;
    }

    case 'excel':
    default: {
      const excelContent = generateExcelXml(sheets);
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 32px; color: white; text-align: center; margin-bottom: 24px;">
            <h1 style="margin: 0 0 8px 0; font-size: 24px;">📊 ${escapeHtml(branchName)}</h1>
            <p style="margin: 0; opacity: 0.9; font-size: 14px;">${escapeHtml(label)}</p>
          </div>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px;">
            <p style="margin: 0 0 12px 0; color: #333;">Hi,</p>
            <p style="margin: 0 0 12px 0; color: #555;">Your ${config.frequency} gym report is ready. Please find the Excel report attached.</p>
            <p style="margin: 0; color: #9ca3af; font-size: 12px;">This is an automated report from GymKloud.</p>
          </div>
        </div>`;
      attachment = {
        filename: `${safeBranchName}_Report_${config.frequency}_${dateStr}.xls`,
        content: excelContent,
      };
      emailSubject = `📊 ${branchName} - ${label}`;
      whatsappMessage = generateWhatsAppSummary(branchName, label, summaryRows);
      break;
    }
  }

  // Deliver based on channel
  if (channel === 'whatsapp') {
    if (config.whatsappPhone) {
      whatsappSent = await sendWhatsAppMessage(config.whatsappPhone, whatsappMessage);
    }
  } else {
    // Email delivery
    if (config.reportEmail) {
      emailResult = await sendEmailWithResend(config.reportEmail, emailSubject, emailHtml, attachment);
    }
  }

  return {
    success: true,
    emailSent: emailResult.success,
    whatsappSent,
    sheetsGenerated: sheets.length,
    format,
    channel,
  };
}
