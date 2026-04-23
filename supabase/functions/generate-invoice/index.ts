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
  invoiceBrandName: string;
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
  invoiceTerms: string;
  invoicePalette: {
    header: string;
    accent: string;
    text: string;
  };
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

  const hexToRgb = (hex: string, fallback: [number, number, number]) => {
    const safe = hex?.replace("#", "") || "";
    const full = safe.length === 3 ? safe.split("").map((char) => char + char).join("") : safe;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
    return [
      parseInt(full.slice(0, 2), 16) / 255,
      parseInt(full.slice(2, 4), 16) / 255,
      parseInt(full.slice(4, 6), 16) / 255,
    ] as const;
  };

  const addRoundBadge = (x: number, y: number, text: string, r: number, g: number, b: number) => {
    // Simple rect badge (rounded corners not available in basic PDF)
    const badgeW = 60;
    const badgeH = 18;
    addRect(x, y - 4, badgeW, badgeH, r, g, b);
    addColorText(x + 12, y, text, 9, true, 1, 1, 1);
  };

  let yPos = pageH;

  const [headerR, headerG, headerB] = hexToRgb(data.invoicePalette.header, [0.12, 0.24, 0.43]);
  const [accentR, accentG, accentB] = hexToRgb(data.invoicePalette.accent, [0.88, 0.94, 0.98]);
  const [textR, textG, textB] = hexToRgb(data.invoicePalette.text, [0.11, 0.16, 0.33]);

  const invoiceTitle = data.gymGst ? "TAX INVOICE" : "INVOICE";
  const outerX = 28;
  const outerY = 28;
  const outerW = pageW - 56;
  const outerH = pageH - 56;
  const rightColX = 330;
  const totalRowsStartY = 264;

  content.push(`0 0 0 RG 1 w ${outerX} ${outerY} ${outerW} ${outerH} re S`);
  addRect(outerX, 760, outerW, 30, headerR, headerG, headerB);
  addColorText(240, 770, invoiceTitle, 17, true, 1, 1, 1);
  addColorText(470, 775, `INVOICE NO : ${data.invoiceNumber}`, 8, true, 1, 1, 1);
  addColorText(470, 764, `DATE : ${data.paymentDate}`, 8, true, 1, 1, 1);

  addColorText(170, 735, data.invoiceBrandName || data.gymName, 22, true, 0, 0, 0);
  let hy = 718;
  if (data.gymAddress) {
    addColorText(150, hy, data.gymAddress, 10, false, 0.2, 0.2, 0.2);
    hy -= 13;
  }
  if (data.gymGst) {
    addColorText(205, hy, `GSTIN: ${data.gymGst}`, 9, false, 0.2, 0.2, 0.2);
    hy -= 12;
  }
  if (data.gymEmail) {
    addColorText(185, hy, `Email ID: ${data.gymEmail}`, 9, false, 0.2, 0.2, 0.2);
    hy -= 12;
  }
  if (data.gymPhone) {
    addColorText(200, hy, `Phone: ${data.gymPhone}`, 9, false, 0.2, 0.2, 0.2);
  }

  addLine(outerX, 682, outerX + outerW, 682, 0, 0, 0);
  addRect(outerX, 580, 290, 102, accentR, accentG, accentB);
  addRect(rightColX, 580, outerX + outerW - rightColX, 102, accentR, accentG, accentB);
  addLine(rightColX, 580, rightColX, 682, 0, 0, 0);
  addLine(outerX, 580, outerX + outerW, 580, 0, 0, 0);

  addText(32, 662, "Bill To:", 10, true);
  addText(32, 645, data.memberName, 10, false);
  if (data.memberPhone) addText(32, 630, `Phone: ${data.memberPhone}`, 9, false);
  if (data.memberId) addText(32, 616, `ID: ${data.memberId.slice(0, 8).toUpperCase()}`, 9, false);
  if (data.branchName) addText(32, 602, `Branch: ${data.branchName}`, 9, false);

  addText(334, 645, `Payment Date: ${data.paymentDate}`, 10, false);
  addText(334, 630, `Payment Mode: ${data.paymentMode}`, 10, false);
  if (data.razorpayPaymentId) addText(334, 615, `Txn No: ${data.razorpayPaymentId}`, 9, false);
  addRoundBadge(334, 595, "PAID", headerR, headerG, headerB);

  addLine(outerX, 550, outerX + outerW, 550, 0, 0, 0);
  addLine(320, 360, 320, 580, 0, 0, 0);
  addLine(380, 360, 380, 580, 0, 0, 0);
  addLine(435, 360, 435, 580, 0, 0, 0);
  addLine(500, 360, 500, 580, 0, 0, 0);
  addLine(outerX, 360, outerX + outerW, 360, 0, 0, 0);
  addLine(outerX, 550, outerX + outerW, 550, 0, 0, 0);
  addLine(outerX, 520, outerX + outerW, 520, 0, 0, 0);

  addText(32, 535, "Description", 9, true);
  addText(338, 535, "Duration", 9, true);
  addText(398, 535, "Qty", 9, true);
  addText(470, 535, "Amount", 9, true);

  let tableRowY = 490;

  // Gym Fee row
  if (data.gymFee > 0) {
    const packageLabel = data.packageName || "Gym Membership";
      addText(32, tableRowY, packageLabel, 9, true);
    if (data.startDate && data.endDate) {
        addColorText(338, tableRowY, `${data.startDate} - ${data.endDate}`, 8, false, 0.4, 0.4, 0.4);
    }
      addText(405, tableRowY, "1", 9, false);
      addText(470, tableRowY, `Rs.${data.gymFee.toLocaleString("en-IN")}`, 9, true);
      tableRowY -= 22;
  }

  // Joining Fee row
  if (data.joiningFee > 0) {
      addText(32, tableRowY, "Joining Fee", 9, false);
      addColorText(338, tableRowY, "-", 8, false, 0.5, 0.5, 0.5);
      addText(405, tableRowY, "1", 9, false);
      addText(470, tableRowY, `Rs.${data.joiningFee.toLocaleString("en-IN")}`, 9, true);
      tableRowY -= 22;
  }

  // Trainer Fee row
  if (data.trainerFee > 0) {
      addText(32, tableRowY, "Personal Training Fee", 9, false);
    if (data.startDate && data.endDate) {
        addColorText(338, tableRowY, `${data.startDate} - ${data.endDate}`, 8, false, 0.5, 0.5, 0.5);
    }
      addText(405, tableRowY, "1", 9, false);
      addText(470, tableRowY, `Rs.${data.trainerFee.toLocaleString("en-IN")}`, 9, true);
      tableRowY -= 22;
  }

  // If no breakdown, show single line
  if (data.gymFee === 0 && data.joiningFee === 0 && data.trainerFee === 0) {
    const label = data.packageName || "Payment";
      addText(32, tableRowY, label, 9, true);
      addColorText(338, tableRowY, "-", 8, false, 0.5, 0.5, 0.5);
      addText(405, tableRowY, "1", 9, false);
      addText(470, tableRowY, `Rs.${data.amount.toLocaleString("en-IN")}`, 9, true);
      tableRowY -= 22;
  }

  addRect(outerX, 314, 292, 46, accentR, accentG, accentB);
  addLine(rightColX, 314, rightColX, 360, 0, 0, 0);
  addLine(outerX, 314, outerX + outerW, 314, 0, 0, 0);
  addText(32, 345, "Terms & conditions", 9, true);

  const termLines = (data.invoiceTerms || "Fees once paid are non-refundable.")
    .split(/\n+/)
    .flatMap((line) => line.match(/.{1,55}(\s|$)/g) || [line])
    .slice(0, 5);
  termLines.forEach((line, index) => {
    addText(36, 328 - index * 12, `${index + 1}. ${line.trim()}`, 8, false);
  });

  let totalsY = totalRowsStartY;

  if (data.subtotal > 0 && data.subtotal !== data.amount) {
    addText(rightColX + 5, totalsY, "Subtotal", 9, true);
    addText(515, totalsY, `Rs.${data.subtotal.toLocaleString("en-IN")}`, 9, true);
    totalsY -= 18;
  }

  if (data.discount > 0) {
    addText(rightColX + 5, totalsY, "Discount", 9, true);
    addText(510, totalsY, `-Rs.${data.discount.toLocaleString("en-IN")}`, 9, true);
    totalsY -= 18;
  }

  if (data.tax > 0) {
    addText(rightColX + 5, totalsY, "GST / Tax", 9, true);
    addText(515, totalsY, `Rs.${data.tax.toLocaleString("en-IN")}`, 9, true);
    totalsY -= 18;
  }

  addRect(rightColX, 250, outerX + outerW - rightColX, 24, headerR, headerG, headerB);
  addColorText(rightColX + 5, 258, "Grand Total", 10, true, 1, 1, 1);
  addColorText(500, 258, `Rs.${data.amount.toLocaleString("en-IN")}`, 10, true, 1, 1, 1);

  addLine(outerX, 220, outerX + outerW, 220, 0, 0, 0);
  addText(32, 206, "Total Amount (₹ - In Words):", 9, true);
  addText(32, 180, `For : ${data.invoiceBrandName || data.gymName}`, 10, true);
  addColorText(32, 150, "Authorised Signatory", 10, true, textR, textG, textB);

  if (data.footerMessage) {
    addColorText(165, 120, `"${data.footerMessage}"`, 9, false, 0.5, 0.5, 0.5);
  }
  addColorText(150, 105, "This is a computer-generated invoice. No signature required.", 7, false, 0.7, 0.7, 0.7);

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

    // Check if invoice already exists for this payment (we refresh data even when it exists)
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id, invoice_number, transaction_id")
      .eq("payment_id", paymentId)
      .maybeSingle();

    // Fetch payment with related data
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(`
        *,
        members:member_id (id, name, phone, branch_id),
        daily_pass_users:daily_pass_user_id (id, name, phone, branch_id),
        subscriptions:subscription_id (start_date, end_date, plan_months, trainer_fee, personal_trainer_id, is_custom_package, custom_days, branch_id)
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

    let effectiveBranchId = branchId || payment.branch_id || member?.branch_id || dailyPassUser?.branch_id || subscription?.branch_id;

    // Fallback branch for old records that don't have branch_id
    if (!effectiveBranchId) {
      const { data: fallbackBranch } = await supabase
        .from("branches")
        .select("id")
        .eq("is_default", true)
        .maybeSingle();

      if (fallbackBranch?.id) {
        effectiveBranchId = fallbackBranch.id;
      } else {
        const { data: anyActiveBranch } = await supabase
          .from("branches")
          .select("id")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (anyActiveBranch?.id) {
          effectiveBranchId = anyActiveBranch.id;
        }
      }
    }

    // Fetch gym settings for branding
    let gymName = "Pro Plus Fitness";
    let gymAddress = "";
    let gymPhone = "";
    let gymEmail = "";
    let gymGst = "";
    let branchName = "";
    let footerMessage = "Thank you for choosing our gym!";
    let invoicePrefix = "INV";
    let invoiceTaxRate = 0;

    if (effectiveBranchId) {
      const { data: branch } = await supabase
        .from("branches")
        .select("name")
        .eq("id", effectiveBranchId)
        .single();
      
      branchName = branch?.name || "";

      const { data: settings } = await supabase
        .from("gym_settings")
        .select("gym_name, gym_address, gym_phone, gym_email, gym_gst, invoice_prefix, invoice_footer_message, invoice_tax_rate, invoice_show_gst")
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
        // GST: only apply if both show_gst is enabled AND tax_rate > 0
        if (settings.invoice_show_gst === true && (settings.invoice_tax_rate || 0) > 0) {
          invoiceTaxRate = settings.invoice_tax_rate;
        }
      }
    }

    const customerName = member?.name || dailyPassUser?.name || "Unknown";
    const customerPhone = member?.phone || dailyPassUser?.phone || "";
    const paymentDate = new Date(payment.created_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });

    let invoiceNumber = existingInvoice?.invoice_number || "";

    // Generate invoice number only for first-time invoice creation
    if (!invoiceNumber) {
      let baseInvoiceNumber = "";

      if (effectiveBranchId) {
        const { data: invoiceNumData } = await supabase.rpc("generate_invoice_number", {
          _branch_id: effectiveBranchId,
        });
        if (invoiceNumData) {
          baseInvoiceNumber = invoiceNumData;
        }
      }

      if (!baseInvoiceNumber) {
        baseInvoiceNumber = `${invoicePrefix}-${Date.now()}`;
      }

      invoiceNumber = baseInvoiceNumber;
      let collisionSuffix = 1;

      // Guard against unique invoice_number collisions across branches
      while (true) {
        const { data: conflictingInvoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("invoice_number", invoiceNumber)
          .maybeSingle();

        if (!conflictingInvoice) break;

        invoiceNumber = `${baseInvoiceNumber}-${collisionSuffix}`;
        collisionSuffix += 1;

        if (collisionSuffix > 50) {
          invoiceNumber = `${invoicePrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
          break;
        }
      }
    }

    const transactionId =
      payment.razorpay_payment_id ||
      existingInvoice?.transaction_id ||
      `CASH-${payment.id.slice(0, 8).toUpperCase()}`;

    // Calculate fee breakdown
    const trainerFee = subscription?.trainer_fee ? Number(subscription.trainer_fee) : 0;
    const totalPaid = Number(payment.amount);

    // If GST is enabled, reverse-calculate: subtotal + tax = totalPaid
    // tax = subtotal * taxRate / 100
    // subtotal + subtotal * taxRate / 100 = totalPaid
    // subtotal * (1 + taxRate/100) = totalPaid
    // subtotal = totalPaid / (1 + taxRate/100)
    let subtotalBeforeTax: number;
    let taxOnInvoice: number;

    if (invoiceTaxRate > 0) {
      subtotalBeforeTax = Math.round(totalPaid / (1 + invoiceTaxRate / 100));
      taxOnInvoice = totalPaid - subtotalBeforeTax;
    } else {
      subtotalBeforeTax = totalPaid;
      taxOnInvoice = 0;
    }

    const gymFee = subtotalBeforeTax - trainerFee;

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
      memberId: member?.id || dailyPassUser?.id || "",
      paymentDate,
      amount: totalPaid,
      paymentMode: payment.payment_mode === "online" ? "Online (Razorpay)" : payment.payment_mode === "upi" ? "UPI" : payment.payment_mode === "card" ? "Card" : payment.payment_mode === "bank_transfer" ? "Bank Transfer" : "Cash",
      paymentType: payment.payment_type || "gym_membership",
      razorpayPaymentId: transactionId,
      packageName,
      startDate,
      endDate,
      joiningFee: 0,
      trainerFee,
      gymFee: gymFee > 0 ? gymFee : 0,
      subtotal: subtotalBeforeTax,
      discount: 0,
      tax: taxOnInvoice,
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

    const invoicePayload = {
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
      amount: totalPaid,
      subtotal: subtotalBeforeTax,
      gym_fee: gymFee > 0 ? gymFee : 0,
      joining_fee: 0,
      trainer_fee: trainerFee,
      tax: taxOnInvoice,
      package_name: packageName,
      start_date: subscription?.start_date || null,
      end_date: subscription?.end_date || null,
      payment_mode: payment.payment_mode,
      payment_date: payment.created_at,
      transaction_id: transactionId,
      pdf_url: pdfUrl,
      footer_message: footerMessage,
    };

    if (existingInvoice?.id) {
      const { error: updateError } = await supabase
        .from("invoices")
        .update(invoicePayload)
        .eq("id", existingInvoice.id);

      if (updateError) {
        console.error("Invoice update error:", updateError);
      }
    } else {
      const { error: insertError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          payment_id: paymentId,
          ...invoicePayload,
        });

      if (insertError) {
        console.error("Invoice insert error:", insertError);
      }
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
          `Here is your payment invoice.\n\n` +
          `💰 *Amount:* ₹${Number(payment.amount).toLocaleString("en-IN")}\n` +
          `📅 *Date:* ${paymentDate}\n` +
          `💳 *Mode:* ${payment.payment_mode === "online" ? "Online" : "Cash"}\n` +
          `📦 *Package:* ${packageName}\n` +
          (subscription?.end_date ? `📅 *Valid Till:* ${endDate}\n` : "") +
          `\nThank you for being with us! 🙏\n— ${teamName}`;

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
              ...(pdfUrl ? { media: { type: "document", url: pdfUrl } } : {}),
            }),
          });

          whatsappSent = response.ok;

          if (whatsappSent && effectiveBranchId) {
            const { data: tenantId } = await supabase.rpc("get_tenant_from_branch", { _branch_id: effectiveBranchId });
            if (tenantId) {
              await supabase.rpc("increment_whatsapp_usage", { _tenant_id: tenantId, _count: 1 });
            }
          }

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
    .select(`*, members:member_id (id, name, phone, branch_id), daily_pass_users:daily_pass_user_id (id, name, phone, branch_id)`)
    .eq("id", paymentId)
    .single();

  if (!payment) return;

  const member = payment.members as any;
  const dailyPassUser = payment.daily_pass_users as any;
  const customerName = member?.name || dailyPassUser?.name || "Unknown";
  const customerPhone = member?.phone || dailyPassUser?.phone || "";
  const effectiveBranchId = branchId || payment.branch_id || member?.branch_id || dailyPassUser?.branch_id;

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
