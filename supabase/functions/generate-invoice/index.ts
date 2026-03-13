import { createClient } from "npm:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate PDF invoice as bytes using raw PDF construction
function generateInvoicePDF(data: {
  invoiceNumber: string;
  gymName: string;
  gymAddress: string;
  gymPhone: string;
  gymEmail: string;
  gymGst: string;
  memberName: string;
  memberPhone: string;
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
  branchName: string;
  footerMessage: string;
}): Uint8Array {
  const content: string[] = [];
  let yPos = 750;
  const leftMargin = 50;
  const rightMargin = 545;

  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const addText = (x: number, y: number, text: string, fontSize: number = 10, bold: boolean = false) => {
    const font = bold ? "/F2" : "/F1";
    content.push(`BT ${font} ${fontSize} Tf ${x} ${y} Td (${esc(text)}) Tj ET`);
  };

  const addLine = (x1: number, y1: number, x2: number, y2: number) => {
    content.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  };

  const addRect = (x: number, y: number, w: number, h: number, r: number, g: number, b: number) => {
    content.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f 0 0 0 rg`);
  };

  // Header background
  addRect(0, 770, 612, 72, 0.15, 0.15, 0.15);
  
  // Header - white text
  content.push(`1 1 1 rg`);
  addText(leftMargin, 810, data.gymName, 18, true);
  content.push(`0 0 0 rg`);

  yPos = 790;
  addText(leftMargin, yPos, data.gymName, 16, true);
  yPos -= 16;
  if (data.gymAddress) {
    addText(leftMargin, yPos, data.gymAddress, 9, false);
    yPos -= 14;
  }
  if (data.gymPhone) {
    addText(leftMargin, yPos, `Phone: ${data.gymPhone}`, 9, false);
    yPos -= 14;
  }
  if (data.gymEmail) {
    addText(leftMargin, yPos, `Email: ${data.gymEmail}`, 9, false);
    yPos -= 14;
  }
  if (data.gymGst) {
    addText(leftMargin, yPos, `GST: ${data.gymGst}`, 9, false);
    yPos -= 14;
  }

  // Invoice title - right side
  addText(400, 790, "INVOICE", 20, true);
  addText(400, 774, `#${data.invoiceNumber}`, 10, false);
  addText(400, 760, `Date: ${data.paymentDate}`, 9, false);

  yPos -= 10;
  addLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 25;

  // Bill To section
  addText(leftMargin, yPos, "BILL TO:", 10, true);
  yPos -= 16;
  addText(leftMargin, yPos, data.memberName, 11, true);
  yPos -= 14;
  addText(leftMargin, yPos, `Phone: ${data.memberPhone}`, 9, false);
  yPos -= 14;
  addText(leftMargin, yPos, `Branch: ${data.branchName}`, 9, false);
  yPos -= 30;

  // Table header
  addRect(leftMargin, yPos - 4, rightMargin - leftMargin, 20, 0.93, 0.93, 0.93);
  addText(leftMargin + 5, yPos, "Description", 10, true);
  addText(350, yPos, "Details", 10, true);
  addText(480, yPos, "Amount", 10, true);
  yPos -= 22;

  // Package row
  const packageLabel = data.packageName || data.paymentType || "Gym Membership";
  addText(leftMargin + 5, yPos, packageLabel, 9, false);
  addText(350, yPos, `${data.startDate} - ${data.endDate}`, 9, false);
  
  if (data.gymFee > 0) {
    addText(480, yPos, `Rs.${data.gymFee.toLocaleString("en-IN")}`, 9, false);
  }
  yPos -= 18;

  if (data.joiningFee > 0) {
    addText(leftMargin + 5, yPos, "Joining Fee", 9, false);
    addText(480, yPos, `Rs.${data.joiningFee.toLocaleString("en-IN")}`, 9, false);
    yPos -= 18;
  }

  if (data.trainerFee > 0) {
    addText(leftMargin + 5, yPos, "Personal Training Fee", 9, false);
    addText(480, yPos, `Rs.${data.trainerFee.toLocaleString("en-IN")}`, 9, false);
    yPos -= 18;
  }

  addLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 20;

  addText(380, yPos, "TOTAL:", 12, true);
  addText(480, yPos, `Rs.${data.amount.toLocaleString("en-IN")}`, 12, true);
  yPos -= 25;

  // Payment info
  addLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 20;
  addText(leftMargin, yPos, "PAYMENT INFORMATION", 10, true);
  yPos -= 16;
  addText(leftMargin, yPos, `Payment Mode: ${data.paymentMode}`, 9, false);
  yPos -= 14;
  addText(leftMargin, yPos, `Status: Paid`, 9, false);
  yPos -= 14;
  if (data.razorpayPaymentId) {
    addText(leftMargin, yPos, `Transaction ID: ${data.razorpayPaymentId}`, 9, false);
    yPos -= 14;
  }

  // Footer
  yPos = 60;
  addLine(leftMargin, yPos + 15, rightMargin, yPos + 15);
  if (data.footerMessage) {
    addText(leftMargin, yPos, data.footerMessage, 8, false);
    yPos -= 12;
  }
  addText(leftMargin, yPos, "This is a computer-generated invoice. No signature required.", 8, false);
  addText(leftMargin, yPos - 12, `Generated by ${data.gymName}`, 8, false);

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
  addObj(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj`);
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
