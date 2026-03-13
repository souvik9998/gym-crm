import { createClient } from "npm:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate PDF invoice matching the web invoice view design
function generateInvoicePDF(data: {
  invoiceNumber: string;
  gymName: string;
  gymAddress: string;
  gymPhone: string;
  gymEmail: string;
  gymGst: string;
  memberName: string;
  memberPhone: string;
  memberId: string;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  paymentType: string;
  razorpayPaymentId: string | null;
  packageName: string;
  startDate: string;
  endDate: string;
  joiningFee: number;
  trainerFee: number;
  gymFee: number;
  subtotal: number;
  discount: number;
  tax: number;
  branchName: string;
  footerMessage: string;
}): Uint8Array {
  const content: string[] = [];
  const pageW = 612;
  const pageH = 842;
  const leftMargin = 50;
  const rightMargin = 562;
  const contentWidth = rightMargin - leftMargin;

  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const addText = (x: number, y: number, text: string, fontSize: number = 10, bold = false) => {
    const font = bold ? "/F2" : "/F1";
    content.push(`BT ${font} ${fontSize} Tf ${x} ${y} Td (${esc(text)}) Tj ET`);
  };

  const addColorText = (x: number, y: number, text: string, fontSize: number, bold: boolean, r: number, g: number, b: number) => {
    const font = bold ? "/F2" : "/F1";
    content.push(`BT ${r} ${g} ${b} rg ${font} ${fontSize} Tf ${x} ${y} Td (${esc(text)}) Tj ET`);
    content.push(`0 0 0 rg`);
  };

  const addLine = (x1: number, y1: number, x2: number, y2: number, r = 0.85, g = 0.85, b = 0.85) => {
    content.push(`${r} ${g} ${b} RG 0.5 w ${x1} ${y1} m ${x2} ${y2} l S 0 0 0 RG`);
  };

  const addRect = (x: number, y: number, w: number, h: number, r: number, g: number, b: number) => {
    content.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f 0 0 0 rg`);
  };

  const addRoundBadge = (x: number, y: number, text: string, r: number, g: number, b: number) => {
    // Simple rect badge (rounded corners not available in basic PDF)
    const badgeW = 60;
    const badgeH = 18;
    addRect(x, y - 4, badgeW, badgeH, r, g, b);
    addColorText(x + 12, y, text, 9, true, 1, 1, 1);
  };

  let yPos = pageH;

  // ===== PRIMARY COLOR HEADER =====
  const headerH = 100;
  const headerY = pageH - headerH;
  // Primary color (hsl 142 76% 36% ≈ rgb 0.22, 0.64, 0.32)
  addRect(0, headerY, pageW, headerH, 0.22, 0.64, 0.32);

  // Gym name - white, large
  let hy = pageH - 30;
  addColorText(leftMargin, hy, data.gymName, 20, true, 1, 1, 1);
  hy -= 16;
  if (data.gymAddress) {
    addColorText(leftMargin, hy, data.gymAddress, 9, false, 1, 1, 0.85);
    hy -= 13;
  }
  const contactParts: string[] = [];
  if (data.gymPhone) contactParts.push(`Phone: ${data.gymPhone}`);
  if (data.gymEmail) contactParts.push(`Email: ${data.gymEmail}`);
  if (data.gymGst) contactParts.push(`GST: ${data.gymGst}`);
  if (contactParts.length > 0) {
    addColorText(leftMargin, hy, contactParts.join("  |  "), 8, false, 1, 1, 0.75);
  }

  // INVOICE title - right side, white
  addColorText(430, pageH - 30, "INVOICE", 22, true, 1, 1, 1);
  addColorText(430, pageH - 48, data.invoiceNumber, 10, false, 1, 1, 0.85);
  addColorText(430, pageH - 62, data.paymentDate, 9, false, 1, 1, 0.75);

  // ===== BODY SECTION =====
  yPos = headerY - 25;

  // PAID badge + payment mode
  addRoundBadge(leftMargin, yPos, "PAID", 0.13, 0.62, 0.33);
  addColorText(leftMargin + 70, yPos, `via ${data.paymentMode}`, 9, false, 0.5, 0.5, 0.5);
  yPos -= 15;

  // Separator
  addLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 25;

  // ===== BILL TO + INVOICE INFO (two columns) =====
  const col2X = 350;

  // Left column: Bill To
  addColorText(leftMargin, yPos, "BILL TO", 8, true, 0.5, 0.5, 0.5);
  yPos -= 16;
  addText(leftMargin, yPos, data.memberName, 12, true);
  yPos -= 15;
  if (data.memberPhone) {
    addColorText(leftMargin, yPos, `Phone: ${data.memberPhone}`, 9, false, 0.4, 0.4, 0.4);
    yPos -= 13;
  }
  if (data.memberId) {
    addColorText(leftMargin, yPos, `ID: ${data.memberId.slice(0, 8).toUpperCase()}`, 8, false, 0.5, 0.5, 0.5);
    yPos -= 13;
  }

  // Right column: Invoice Info (at same vertical start)
  const infoY = yPos + 44 + 16; // align with BILL TO
  addColorText(col2X, infoY, "INVOICE INFO", 8, true, 0.5, 0.5, 0.5);
  addColorText(col2X, infoY - 16, `Date: ${data.paymentDate}`, 9, false, 0.3, 0.3, 0.3);
  if (data.razorpayPaymentId) {
    addColorText(col2X, infoY - 30, `Txn: ${data.razorpayPaymentId}`, 8, false, 0.3, 0.3, 0.3);
  }
  if (data.branchName) {
    addColorText(col2X, infoY - 44, `Branch: ${data.branchName}`, 9, false, 0.3, 0.3, 0.3);
  }

  yPos -= 15;
  // Separator
  addLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 25;

  // ===== MEMBERSHIP DETAILS TABLE =====
  addColorText(leftMargin, yPos, "MEMBERSHIP DETAILS", 8, true, 0.5, 0.5, 0.5);
  yPos -= 18;

  // Table header row
  const tableX = leftMargin;
  addRect(tableX, yPos - 5, contentWidth, 22, 0.96, 0.96, 0.96);
  addColorText(tableX + 8, yPos, "DESCRIPTION", 8, true, 0.5, 0.5, 0.5);
  addColorText(tableX + 250, yPos, "DURATION", 8, true, 0.5, 0.5, 0.5);
  addColorText(tableX + 430, yPos, "AMOUNT", 8, true, 0.5, 0.5, 0.5);
  yPos -= 24;

  // Table separator
  addLine(tableX, yPos + 2, tableX + contentWidth, yPos + 2);

  // Gym Fee row
  if (data.gymFee > 0) {
    const packageLabel = data.packageName || "Gym Membership";
    addText(tableX + 8, yPos - 8, packageLabel, 9, true);
    if (data.startDate && data.endDate) {
      addColorText(tableX + 250, yPos - 8, `${data.startDate} - ${data.endDate}`, 8, false, 0.5, 0.5, 0.5);
    }
    addText(tableX + 430, yPos - 8, `Rs.${data.gymFee.toLocaleString("en-IN")}`, 9, true);
    yPos -= 24;
    addLine(tableX, yPos + 2, tableX + contentWidth, yPos + 2);
  }

  // Joining Fee row
  if (data.joiningFee > 0) {
    addText(tableX + 8, yPos - 8, "Joining Fee", 9, false);
    addColorText(tableX + 250, yPos - 8, "-", 8, false, 0.5, 0.5, 0.5);
    addText(tableX + 430, yPos - 8, `Rs.${data.joiningFee.toLocaleString("en-IN")}`, 9, true);
    yPos -= 24;
    addLine(tableX, yPos + 2, tableX + contentWidth, yPos + 2);
  }

  // Trainer Fee row
  if (data.trainerFee > 0) {
    addText(tableX + 8, yPos - 8, "Personal Training Fee", 9, false);
    if (data.startDate && data.endDate) {
      addColorText(tableX + 250, yPos - 8, `${data.startDate} - ${data.endDate}`, 8, false, 0.5, 0.5, 0.5);
    }
    addText(tableX + 430, yPos - 8, `Rs.${data.trainerFee.toLocaleString("en-IN")}`, 9, true);
    yPos -= 24;
    addLine(tableX, yPos + 2, tableX + contentWidth, yPos + 2);
  }

  // If no breakdown, show single line
  if (data.gymFee === 0 && data.joiningFee === 0 && data.trainerFee === 0) {
    const label = data.packageName || "Payment";
    addText(tableX + 8, yPos - 8, label, 9, true);
    addColorText(tableX + 250, yPos - 8, "-", 8, false, 0.5, 0.5, 0.5);
    addText(tableX + 430, yPos - 8, `Rs.${data.amount.toLocaleString("en-IN")}`, 9, true);
    yPos -= 24;
    addLine(tableX, yPos + 2, tableX + contentWidth, yPos + 2);
  }

  yPos -= 10;

  // ===== TOTALS (right-aligned) =====
  const totalsX = 380;

  if (data.subtotal > 0 && data.subtotal !== data.amount) {
    addColorText(totalsX, yPos, "Subtotal", 9, false, 0.5, 0.5, 0.5);
    addText(totalsX + 110, yPos, `Rs.${data.subtotal.toLocaleString("en-IN")}`, 9, false);
    yPos -= 16;
  }

  if (data.discount > 0) {
    addColorText(totalsX, yPos, "Discount", 9, false, 0.5, 0.5, 0.5);
    addColorText(totalsX + 110, yPos, `-Rs.${data.discount.toLocaleString("en-IN")}`, 9, false, 0.13, 0.62, 0.33);
    yPos -= 16;
  }

  if (data.tax > 0) {
    addColorText(totalsX, yPos, "Tax", 9, false, 0.5, 0.5, 0.5);
    addText(totalsX + 110, yPos, `Rs.${data.tax.toLocaleString("en-IN")}`, 9, false);
    yPos -= 16;
  }

  // Total separator
  addLine(totalsX, yPos + 4, rightMargin, yPos + 4);
  yPos -= 8;

  addText(totalsX, yPos, "Total Paid", 11, true);
  addText(totalsX + 100, yPos, `Rs.${data.amount.toLocaleString("en-IN")}`, 14, true);
  yPos -= 30;

  // ===== FOOTER =====
  // Footer separator
  addLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 18;

  if (data.footerMessage) {
    addColorText(leftMargin + (contentWidth / 2 - 80), yPos, `"${data.footerMessage}"`, 9, false, 0.5, 0.5, 0.5);
    yPos -= 18;
  }

  addColorText(leftMargin + (contentWidth / 2 - 100), yPos, "This is a computer-generated invoice. No signature required.", 7, false, 0.7, 0.7, 0.7);

  // ===== BUILD PDF =====
  const contentStream = content.join("\n");
  const contentBytes = new TextEncoder().encode(contentStream);
  const objects: string[] = [];
  let objCount = 0;

  const addObj = (obj: string): number => {
    objCount++;
    objects.push(obj);
    return objCount;
  };

  addObj(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
  addObj(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`);
  addObj(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj`);
  addObj(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${contentStream}\nendstream\nendobj`);
  addObj(`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`);
  addObj(`6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`);

  let pdf = `%PDF-1.4\n`;
  const objOffsets: number[] = [];

  for (let i = 0; i < objects.length; i++) {
    objOffsets.push(pdf.length);
    pdf += objects[i] + "\n";
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objCount + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (const offset of objOffsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimited = enforceRateLimit(req, "generate-invoice", 10, 60, corsHeaders);
  if (rateLimited) return rateLimited;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PERISKOPE_API_KEY = Deno.env.get("PERISKOPE_API_KEY");
    const PERISKOPE_PHONE = Deno.env.get("PERISKOPE_PHONE");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { paymentId, branchId, sendViaWhatsApp = true } = body;

    if (!paymentId) {
      return new Response(
        JSON.stringify({ success: false, error: "paymentId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if invoice already exists for this payment
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("payment_id", paymentId)
      .maybeSingle();

    if (existingInvoice) {
      // Return existing invoice
      const invoiceLink = `https://gym-qr-pro.lovable.app/invoice/${existingInvoice.invoice_number}`;
      
      // Still send WhatsApp if requested
      if (sendViaWhatsApp) {
        await sendWhatsAppInvoice(supabase, paymentId, existingInvoice.invoice_number, invoiceLink, PERISKOPE_API_KEY, PERISKOPE_PHONE, branchId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          invoiceNumber: existingInvoice.invoice_number,
          invoiceUrl: invoiceLink,
          whatsappSent: sendViaWhatsApp,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch payment with related data
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(`
        *,
        members:member_id (id, name, phone, branch_id),
        daily_pass_users:daily_pass_user_id (id, name, phone),
        subscriptions:subscription_id (start_date, end_date, plan_months, trainer_fee, personal_trainer_id, is_custom_package, custom_days)
      `)
      .eq("id", paymentId)
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ success: false, error: "Payment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const member = payment.members as any;
    const dailyPassUser = payment.daily_pass_users as any;
    const subscription = payment.subscriptions as any;
    const effectiveBranchId = branchId || payment.branch_id || member?.branch_id;

    // Fetch gym settings for branding
    let gymName = "Pro Plus Fitness";
    let gymAddress = "";
    let gymPhone = "";
    let gymEmail = "";
    let gymGst = "";
    let branchName = "";
    let footerMessage = "Thank you for choosing our gym!";
    let invoicePrefix = "INV";

    if (effectiveBranchId) {
      const { data: branch } = await supabase
        .from("branches")
        .select("name")
        .eq("id", effectiveBranchId)
        .single();
      
      branchName = branch?.name || "";

      const { data: settings } = await supabase
        .from("gym_settings")
        .select("gym_name, gym_address, gym_phone, gym_email, gym_gst, invoice_prefix, invoice_footer_message")
        .eq("branch_id", effectiveBranchId)
        .maybeSingle();

      if (settings) {
        gymName = settings.gym_name || gymName;
        gymAddress = settings.gym_address || "";
        gymPhone = settings.gym_phone || "";
        gymEmail = settings.gym_email || "";
        gymGst = settings.gym_gst || "";
        invoicePrefix = settings.invoice_prefix || "INV";
        footerMessage = settings.invoice_footer_message || footerMessage;
      }
    }

    const customerName = member?.name || dailyPassUser?.name || "Unknown";
    const customerPhone = member?.phone || dailyPassUser?.phone || "";
    const paymentDate = new Date(payment.created_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });

    // Generate sequential invoice number using DB function
    const { data: invoiceNumData } = await supabase.rpc("generate_invoice_number", {
      _branch_id: effectiveBranchId,
    });
    const invoiceNumber = invoiceNumData || `${invoicePrefix}-${Date.now()}`;

    // Calculate fee breakdown
    const trainerFee = subscription?.trainer_fee ? Number(subscription.trainer_fee) : 0;
    const gymFee = Number(payment.amount) - trainerFee;

    const startDate = subscription?.start_date
      ? new Date(subscription.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : paymentDate;
    const endDate = subscription?.end_date
      ? new Date(subscription.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "-";

    let packageName = "Gym Membership";
    if (payment.payment_type === "gym_and_pt") packageName = "Gym + Personal Training";
    else if (payment.payment_type === "pt_only" || payment.payment_type === "pt") packageName = "Personal Training";
    if (subscription?.plan_months) packageName += ` (${subscription.plan_months} Month${subscription.plan_months > 1 ? "s" : ""})`;
    if (subscription?.is_custom_package && subscription?.custom_days) packageName += ` (${subscription.custom_days} Days)`;

    // Generate PDF
    const pdfBytes = generateInvoicePDF({
      invoiceNumber,
      gymName,
      gymAddress,
      gymPhone,
      gymEmail,
      gymGst,
      memberName: customerName,
      memberPhone: customerPhone,
      paymentDate,
      amount: Number(payment.amount),
      paymentMode: payment.payment_mode === "online" ? "Online (Razorpay)" : "Cash",
      paymentType: payment.payment_type || "gym_membership",
      razorpayPaymentId: payment.razorpay_payment_id,
      packageName,
      startDate,
      endDate,
      joiningFee: 0,
      trainerFee,
      gymFee,
      branchName: branchName || gymName,
      footerMessage,
    });

    // Upload to storage
    const fileName = `${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
    const filePath = `${effectiveBranchId || "general"}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
    }

    // Get public URL for PDF
    const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(filePath);
    const pdfUrl = urlData?.publicUrl || null;

    // Save invoice record to database
    const { error: insertError } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        payment_id: paymentId,
        branch_id: effectiveBranchId,
        member_id: member?.id || null,
        daily_pass_user_id: dailyPassUser?.id || null,
        customer_name: customerName,
        customer_phone: customerPhone,
        gym_name: gymName,
        gym_address: gymAddress || null,
        gym_phone: gymPhone || null,
        gym_email: gymEmail || null,
        gym_gst: gymGst || null,
        branch_name: branchName || null,
        amount: Number(payment.amount),
        subtotal: Number(payment.amount),
        gym_fee: gymFee,
        joining_fee: 0,
        trainer_fee: trainerFee,
        package_name: packageName,
        start_date: subscription?.start_date || null,
        end_date: subscription?.end_date || null,
        payment_mode: payment.payment_mode,
        payment_date: payment.created_at,
        transaction_id: payment.razorpay_payment_id || null,
        pdf_url: pdfUrl,
        footer_message: footerMessage,
      });

    if (insertError) {
      console.error("Invoice insert error:", insertError);
    }

    // Branded invoice link
    const invoiceLink = `https://gym-qr-pro.lovable.app/invoice/${invoiceNumber}`;

    // Send via WhatsApp if requested
    let whatsappSent = false;
    if (sendViaWhatsApp && customerPhone && PERISKOPE_API_KEY && PERISKOPE_PHONE) {
      let whatsappEnabled = true;
      if (effectiveBranchId) {
        const { data: ws } = await supabase
          .from("gym_settings")
          .select("whatsapp_enabled")
          .eq("branch_id", effectiveBranchId)
          .maybeSingle();
        whatsappEnabled = ws?.whatsapp_enabled !== false;
      }

      if (whatsappEnabled) {
        let cleaned = customerPhone.replace(/\D/g, "");
        if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
        if (cleaned.length === 10) cleaned = "91" + cleaned;

        const teamName = branchName ? `Team ${branchName}` : `Team ${gymName}`;

        const message = `🧾 *Invoice ${invoiceNumber}*\n\n` +
          `Hi ${customerName}, 👋\n\n` +
          `Here is your payment invoice:\n\n` +
          `💰 *Amount:* ₹${Number(payment.amount).toLocaleString("en-IN")}\n` +
          `📅 *Date:* ${paymentDate}\n` +
          `💳 *Mode:* ${payment.payment_mode === "online" ? "Online" : "Cash"}\n` +
          `📦 *Package:* ${packageName}\n` +
          (subscription?.end_date ? `📅 *Valid Till:* ${endDate}\n` : "") +
          `\n📄 *View Invoice:*\n${invoiceLink}\n\n` +
          `Thank you for being with us! 🙏\n— ${teamName}`;

        try {
          const response = await fetch("https://api.periskope.app/v1/message/send", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PERISKOPE_API_KEY}`,
              "x-phone": PERISKOPE_PHONE,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: `${cleaned}@c.us`,
              message,
            }),
          });

          whatsappSent = response.ok;

          const logData: any = {
            recipient_phone: customerPhone,
            recipient_name: customerName,
            notification_type: "invoice",
            message_content: message.substring(0, 500),
            status: whatsappSent ? "sent" : "failed",
            is_manual: true,
            branch_id: effectiveBranchId || null,
          };
          if (member?.id) logData.member_id = member.id;
          if (dailyPassUser?.id) logData.daily_pass_user_id = dailyPassUser.id;

          await supabase.from("whatsapp_notifications").insert(logData);
        } catch (err: any) {
          console.error("WhatsApp send error:", err);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoiceNumber,
        invoiceUrl: invoiceLink,
        pdfUrl: pdfUrl,
        whatsappSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error generating invoice:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to send WhatsApp for existing invoices
async function sendWhatsAppInvoice(
  supabase: any,
  paymentId: string,
  invoiceNumber: string,
  invoiceLink: string,
  PERISKOPE_API_KEY: string | undefined,
  PERISKOPE_PHONE: string | undefined,
  branchId: string | undefined
) {
  if (!PERISKOPE_API_KEY || !PERISKOPE_PHONE) return;

  const { data: payment } = await supabase
    .from("payments")
    .select(`*, members:member_id (id, name, phone, branch_id), daily_pass_users:daily_pass_user_id (id, name, phone)`)
    .eq("id", paymentId)
    .single();

  if (!payment) return;

  const member = payment.members as any;
  const dailyPassUser = payment.daily_pass_users as any;
  const customerName = member?.name || dailyPassUser?.name || "Unknown";
  const customerPhone = member?.phone || dailyPassUser?.phone || "";
  const effectiveBranchId = branchId || payment.branch_id || member?.branch_id;

  if (!customerPhone) return;

  let cleaned = customerPhone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
  if (cleaned.length === 10) cleaned = "91" + cleaned;

  const message = `🧾 *Invoice ${invoiceNumber}*\n\nHi ${customerName}, 👋\n\n💰 *Amount:* ₹${Number(payment.amount).toLocaleString("en-IN")}\n\n📄 *View Invoice:*\n${invoiceLink}\n\nThank you! 🙏`;

  try {
    await fetch("https://api.periskope.app/v1/message/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERISKOPE_API_KEY}`,
        "x-phone": PERISKOPE_PHONE,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: `${cleaned}@c.us`, message }),
    });

    const logData: any = {
      recipient_phone: customerPhone,
      recipient_name: customerName,
      notification_type: "invoice",
      message_content: message.substring(0, 500),
      status: "sent",
      is_manual: true,
      branch_id: effectiveBranchId || null,
    };
    if (member?.id) logData.member_id = member.id;
    if (dailyPassUser?.id) logData.daily_pass_user_id = dailyPassUser.id;

    await supabase.from("whatsapp_notifications").insert(logData);
  } catch (err: any) {
    console.error("WhatsApp re-send error:", err);
  }
}
