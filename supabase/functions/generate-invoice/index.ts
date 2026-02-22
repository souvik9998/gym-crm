import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate a unique invoice number
function generateInvoiceNumber(paymentDate: string, paymentId: string): string {
  const date = new Date(paymentDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const shortId = paymentId.slice(0, 6).toUpperCase();
  return `INV-${year}${month}-${shortId}`;
}

// Generate PDF invoice as bytes using raw PDF construction
function generateInvoicePDF(data: {
  invoiceNumber: string;
  gymName: string;
  gymAddress: string;
  gymPhone: string;
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
}): Uint8Array {
  // Build PDF manually (PDF 1.4 spec)
  const lines: string[] = [];
  let yPos = 750;
  const leftMargin = 50;
  const rightMargin = 545;

  // Helper to escape PDF string
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  // We'll build page content as text operations
  const content: string[] = [];

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
  
  // Header text
  addText(leftMargin, 810, data.gymName, 18, true);
  content.push(`1 1 1 rg`);
  addText(leftMargin, 810, data.gymName, 18, true);
  content.push(`0 0 0 rg`);

  // Reset to normal after header
  yPos = 790;
  
  // Gym info below header  
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

  // Joining fee row (if any)
  if (data.joiningFee > 0) {
    addText(leftMargin + 5, yPos, "Joining Fee", 9, false);
    addText(480, yPos, `Rs.${data.joiningFee.toLocaleString("en-IN")}`, 9, false);
    yPos -= 18;
  }

  // Trainer fee row (if any)
  if (data.trainerFee > 0) {
    addText(leftMargin + 5, yPos, "Personal Training Fee", 9, false);
    addText(480, yPos, `Rs.${data.trainerFee.toLocaleString("en-IN")}`, 9, false);
    yPos -= 18;
  }

  // Separator
  addLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 20;

  // Total
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
  addText(leftMargin, yPos, "This is a computer-generated invoice. No signature required.", 8, false);
  addText(leftMargin, yPos - 12, `Generated by ${data.gymName}`, 8, false);

  // Build the content stream
  const contentStream = content.join("\n");
  const contentBytes = new TextEncoder().encode(contentStream);

  // Build PDF objects
  const objects: string[] = [];
  let objCount = 0;
  const offsets: number[] = [];

  const addObj = (obj: string): number => {
    objCount++;
    objects.push(obj);
    return objCount;
  };

  // Obj 1: Catalog
  addObj(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
  // Obj 2: Pages
  addObj(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`);
  // Obj 3: Page
  addObj(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj`);
  // Obj 4: Content stream
  addObj(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${contentStream}\nendstream\nendobj`);
  // Obj 5: Font (Helvetica)
  addObj(`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`);
  // Obj 6: Font (Helvetica-Bold)
  addObj(`6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`);

  // Build final PDF
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
    let branchName = "";

    if (effectiveBranchId) {
      const { data: branch } = await supabase
        .from("branches")
        .select("name")
        .eq("id", effectiveBranchId)
        .single();
      
      branchName = branch?.name || "";

      const { data: settings } = await supabase
        .from("gym_settings")
        .select("gym_name, gym_address, gym_phone")
        .eq("branch_id", effectiveBranchId)
        .maybeSingle();

      if (settings) {
        gymName = settings.gym_name || gymName;
        gymAddress = settings.gym_address || "";
        gymPhone = settings.gym_phone || "";
      }
    }

    const customerName = member?.name || dailyPassUser?.name || "Unknown";
    const customerPhone = member?.phone || dailyPassUser?.phone || "";
    const paymentDate = new Date(payment.created_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });

    const invoiceNumber = generateInvoiceNumber(payment.created_at, payment.id);

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
      return new Response(
        JSON.stringify({ success: false, error: "Failed to upload invoice PDF" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(filePath);
    const invoiceUrl = urlData?.publicUrl;

    // Send via WhatsApp if requested
    let whatsappSent = false;
    if (sendViaWhatsApp && customerPhone && PERISKOPE_API_KEY && PERISKOPE_PHONE) {
      // Check if WhatsApp is enabled for branch
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
          `\n📄 *Download Invoice:*\n${invoiceUrl}\n\n` +
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

          // Log the WhatsApp notification
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
        invoiceUrl,
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
