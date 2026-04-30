import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { sendWhatsAppForTenant } from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate PDF invoice matching the web invoice view design
async function generateInvoicePDF(data: {
  invoiceNumber: string;
  gymName: string;
  invoiceBrandName: string;
  invoiceLogoUrl: string | null;
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
  gymStartDate?: string;
  gymEndDate?: string;
  ptStartDate?: string;
  ptEndDate?: string;
  ptTrainerName?: string;
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
  const pageW = 612;
  const pageH = 842;
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

  const wrapText = (text: string, maxChars: number) => {
    return text
      .split(/\n+/)
      .flatMap((line) => {
        const words = line.trim().split(/\s+/).filter(Boolean);
        if (!words.length) return [""];
        const rows: string[] = [];
        let current = "";
        for (const word of words) {
          const next = current ? `${current} ${word}` : word;
          if (next.length > maxChars && current) {
            rows.push(current);
            current = word;
          } else {
            current = next;
          }
        }
        if (current) rows.push(current);
        return rows;
      })
      .slice(0, 6);
  };

  const [headerR, headerG, headerB] = hexToRgb(data.invoicePalette.header, [0.12, 0.24, 0.43]);
  const [accentR, accentG, accentB] = hexToRgb(data.invoicePalette.accent, [0.88, 0.94, 0.98]);
  const [textR, textG, textB] = hexToRgb(data.invoicePalette.text, [0.11, 0.16, 0.33]);
  const invoiceTitle = data.gymGst ? "TAX INVOICE" : "INVOICE";

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Invoice ${data.invoiceNumber}`);
  pdfDoc.setSubject(`Payment invoice for ${data.memberName}`);
  pdfDoc.setAuthor(data.invoiceBrandName || data.gymName || data.branchName || "GymKloud");
  pdfDoc.setCreator("GymKloud");
  pdfDoc.setProducer("GymKloud Invoice Generator");
  const page = pdfDoc.addPage([pageW, pageH]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const outerX = 28;
  const outerY = 28;
  const outerW = pageW - 56;
  const outerH = pageH - 56;
  const leftColW = 302;
  const rightColX = outerX + leftColW;
  const headerY = pageH - 80;
  const businessTop = headerY - 108;
  const billTop = businessTop - 102;
  const tableTop = billTop - 36;
  const tableBottom = 360;
  const termsTop = tableBottom;
  const termsBottom = 314;
  const totalsBottom = 250;

  const sanitizePdfText = (value: string) => value
    .replace(/₹/g, "Rs.")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  const drawTopText = (
    x: number,
    topY: number,
    text: string,
    size = 10,
    color = rgb(0, 0, 0),
    bold = false,
  ) => {
    const safeText = sanitizePdfText(text);
    page.drawText(safeText, {
      x,
      y: pageH - topY - size,
      size,
      font: bold ? fontBold : fontRegular,
      color,
    });
  };

  const drawTopLine = (x1: number, topY1: number, x2: number, topY2: number, thickness = 1, color = rgb(0, 0, 0)) => {
    page.drawLine({
      start: { x: x1, y: pageH - topY1 },
      end: { x: x2, y: pageH - topY2 },
      thickness,
      color,
    });
  };

  const drawTopRect = (
    x: number,
    topY: number,
    w: number,
    h: number,
    fill?: ReturnType<typeof rgb>,
    border = true,
  ) => {
    page.drawRectangle({
      x,
      y: pageH - topY - h,
      width: w,
      height: h,
      color: fill,
      borderColor: border ? rgb(0, 0, 0) : undefined,
      borderWidth: border ? 1 : 0,
    });
  };

  drawTopRect(outerX, 28, outerW, outerH, undefined, true);
  drawTopRect(outerX, 28, outerW, 30, rgb(headerR, headerG, headerB), false);
  drawTopText(240, 36, invoiceTitle, 17, rgb(1, 1, 1), true);
  drawTopText(450, 34, `INVOICE NO : ${data.invoiceNumber}`, 8, rgb(1, 1, 1), true);
  drawTopText(450, 46, `DATE : ${data.paymentDate}`, 8, rgb(1, 1, 1), true);

  let logoOffsetX = 0;
  if (data.invoiceLogoUrl) {
    try {
      const response = await fetch(data.invoiceLogoUrl);
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        let image;
        try {
          image = await pdfDoc.embedPng(bytes);
        } catch {
          image = await pdfDoc.embedJpg(bytes);
        }
        const scaled = image.scale(Math.min(64 / image.width, 64 / image.height));
        page.drawImage(image, {
          x: outerX + 22,
          y: pageH - 82 - scaled.height,
          width: scaled.width,
          height: scaled.height,
        });
        logoOffsetX = 80;
      }
    } catch (error) {
      console.error("Invoice logo embed error:", error);
    }
  }

  drawTopText(outerX + 24 + logoOffsetX, 72, data.invoiceBrandName || data.gymName, 22, rgb(0, 0, 0), true);
  const businessLines = [data.gymAddress, data.gymGst ? `GSTIN: ${data.gymGst}` : "", data.gymEmail ? `Email ID: ${data.gymEmail}` : "", data.gymPhone ? `Phone: ${data.gymPhone}` : ""].filter(Boolean);
  businessLines.forEach((line, index) => drawTopText(outerX + 24 + logoOffsetX, 100 + index * 14, line, 9, rgb(0.25, 0.25, 0.25), false));

  drawTopLine(outerX, businessTop, outerX + outerW, businessTop);
  drawTopRect(outerX, businessTop, leftColW, 102, rgb(accentR, accentG, accentB), false);
  drawTopRect(rightColX, businessTop, outerX + outerW - rightColX, 102, rgb(accentR, accentG, accentB), false);
  drawTopLine(rightColX, businessTop, rightColX, billTop);
  drawTopLine(outerX, billTop, outerX + outerW, billTop);

  drawTopText(outerX + 4, 184, "Bill To:", 10, rgb(0, 0, 0), true);
  drawTopText(outerX + 4, 202, data.memberName, 10, rgb(0, 0, 0), false);
  if (data.memberPhone) drawTopText(outerX + 4, 217, `Phone: ${data.memberPhone}`, 9, rgb(0, 0, 0), false);
  if (data.memberId) drawTopText(outerX + 4, 231, `ID: ${data.memberId.slice(0, 8).toUpperCase()}`, 9, rgb(0, 0, 0), false);
  if (data.branchName) drawTopText(outerX + 4, 245, `Branch: ${data.branchName}`, 9, rgb(0, 0, 0), false);

  drawTopText(rightColX + 8, 202, `Payment Date: ${data.paymentDate}`, 10, rgb(0, 0, 0), false);
  drawTopText(rightColX + 8, 217, `Payment Mode: ${data.paymentMode}`, 10, rgb(0, 0, 0), false);
  if (data.razorpayPaymentId) drawTopText(rightColX + 8, 231, `Txn No: ${data.razorpayPaymentId}`, 9, rgb(0, 0, 0), false);
  drawTopRect(rightColX + 8, 248, 60, 18, rgb(headerR, headerG, headerB), false);
  drawTopText(rightColX + 20, 252, "PAID", 9, rgb(1, 1, 1), true);

  drawTopLine(outerX, tableTop, outerX + outerW, tableTop);
  drawTopLine(outerX, tableBottom, outerX + outerW, tableBottom);
  const col1 = outerX;
  const col2 = outerX + 292;
  const col3 = outerX + 372;
  const col4 = outerX + 432;
  const col5 = outerX + 497;
  [col2, col3, col4, col5].forEach((x) => drawTopLine(x, tableTop, x, tableBottom));
  drawTopLine(outerX, tableTop + 30, outerX + outerW, tableTop + 30);

  drawTopText(col1 + 8, 301, "Description", 9, rgb(textR, textG, textB), true);
  drawTopText(col2 + 8, 301, "Duration", 9, rgb(textR, textG, textB), true);
  drawTopText(col3 + 18, 301, "Qty", 9, rgb(textR, textG, textB), true);
  drawTopText(col5 - 38, 301, "Amount", 9, rgb(textR, textG, textB), true);

  const items: Array<{ description: string; duration: string; qty: string; amount: string }> = [];
  if (data.gymFee > 0) items.push({ description: data.packageName || "Gym Membership", duration: data.startDate && data.endDate ? `${data.startDate} - ${data.endDate}` : "-", qty: "1", amount: `Rs.${data.gymFee.toLocaleString("en-IN")}` });
  if (data.joiningFee > 0) items.push({ description: "Joining Fee", duration: "-", qty: "1", amount: `Rs.${data.joiningFee.toLocaleString("en-IN")}` });
  if (data.trainerFee > 0) items.push({ description: "Personal Training Fee", duration: data.startDate && data.endDate ? `${data.startDate} - ${data.endDate}` : "-", qty: "1", amount: `Rs.${data.trainerFee.toLocaleString("en-IN")}` });
  if (items.length === 0) items.push({ description: data.packageName || "Payment", duration: "-", qty: "1", amount: `Rs.${data.amount.toLocaleString("en-IN")}` });

  items.forEach((item, index) => {
    const rowTop = 334 + index * 26;
    drawTopText(col1 + 8, rowTop, item.description, 9, rgb(0, 0, 0), index === 0);
    drawTopText(col2 + 8, rowTop, item.duration, 8, rgb(0.4, 0.4, 0.4), false);
    drawTopText(col3 + 24, rowTop, item.qty, 9, rgb(0, 0, 0), false);
    drawTopText(col5 - 30, rowTop, item.amount, 9, rgb(0, 0, 0), true);
  });

  drawTopRect(outerX, termsTop, leftColW, 46, rgb(accentR, accentG, accentB), false);
  drawTopLine(rightColX, termsTop, rightColX, tableBottom);
  drawTopLine(outerX, termsBottom, outerX + outerW, termsBottom);
  drawTopText(outerX + 4, 490, "Terms & conditions", 9, rgb(0, 0, 0), true);
  wrapText(data.invoiceTerms || "Fees once paid are non-refundable.", 46)
    .slice(0, 5)
    .forEach((line, index) => drawTopText(outerX + 8, 508 + index * 12, `${index + 1}. ${line}`, 8, rgb(0, 0, 0), false));

  let totalsTop = 488;
  const pushTotalRow = (label: string, value: string) => {
    drawTopText(rightColX + 8, totalsTop, label, 9, rgb(0, 0, 0), true);
    drawTopText(outerX + outerW - 72, totalsTop, value, 9, rgb(0, 0, 0), true);
    totalsTop += 18;
  };
  if (data.subtotal > 0 && data.subtotal !== data.amount) pushTotalRow("Subtotal", `Rs.${data.subtotal.toLocaleString("en-IN")}`);
  if (data.discount > 0) pushTotalRow("Discount", `-Rs.${data.discount.toLocaleString("en-IN")}`);
  if (data.tax > 0) pushTotalRow("GST / Tax", `Rs.${data.tax.toLocaleString("en-IN")}`);

  drawTopRect(rightColX, 564, outerX + outerW - rightColX, 24, rgb(headerR, headerG, headerB), false);
  drawTopText(rightColX + 8, 570, "Grand Total", 10, rgb(1, 1, 1), true);
  drawTopText(outerX + outerW - 72, 570, `Rs.${data.amount.toLocaleString("en-IN")}`, 10, rgb(1, 1, 1), true);

  const amountInWords = wrapText((() => {
    const value = Math.round(Number(data.amount));
    if (!Number.isFinite(value) || value <= 0) return "Zero rupees only";
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const toWords = (num: number): string => {
      if (num === 0) return "";
      if (num < 20) return ones[num];
      if (num < 100) return `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ""}`;
      if (num < 1000) return `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ` ${toWords(num % 100)}` : ""}`;
      if (num < 100000) return `${toWords(Math.floor(num / 1000))} Thousand${num % 1000 ? ` ${toWords(num % 1000)}` : ""}`;
      if (num < 10000000) return `${toWords(Math.floor(num / 100000))} Lakh${num % 100000 ? ` ${toWords(num % 100000)}` : ""}`;
      return `${toWords(Math.floor(num / 10000000))} Crore${num % 10000000 ? ` ${toWords(num % 10000000)}` : ""}`;
    };
    return `${toWords(value).trim()} rupees only`;
  })(), 70);

  drawTopLine(outerX, 622, outerX + outerW, 622);
  drawTopText(outerX + 4, 634, "Total Amount (Rs. - In Words):", 9, rgb(0, 0, 0), true);
  amountInWords.slice(0, 2).forEach((line, index) => drawTopText(outerX + 10, 650 + index * 12, line, 8, rgb(0.2, 0.2, 0.2), false));
  drawTopText(outerX + 4, 690, `For : ${data.invoiceBrandName || data.gymName}`, 10, rgb(0, 0, 0), true);
  drawTopText(outerX + 4, 736, "Authorised Signatory", 10, rgb(textR, textG, textB), true);
  if (data.footerMessage) drawTopText(165, 706, `"${data.footerMessage}"`, 9, rgb(0.45, 0.45, 0.45), false);
  drawTopText(150, 722, "This is a computer-generated invoice. No signature required.", 7, rgb(0.7, 0.7, 0.7), false);

  return await pdfDoc.save();
}

function sanitizeFilePart(value: string | null | undefined, fallback: string): string {
  const cleaned = (value || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

function buildInvoicePdfNames(
  invoiceNumber: string,
  customerName: string,
  gymName: string,
  publicToken: string,
) {
  const safeInvoiceNo = sanitizeFilePart(invoiceNumber, "invoice");
  const safeCustomer = sanitizeFilePart(customerName, "customer");
  const safeGym = sanitizeFilePart(gymName, "gym");
  // Canonical storage path: one PDF per invoice (overwritten on regenerate).
  // Token in the path keeps the file unguessable even if the bucket leaks listings.
  return {
    displayFileName: `${safeInvoiceNo}_${safeCustomer}_${safeGym}.pdf`,
    storageFileName: `${safeInvoiceNo}_${publicToken.slice(0, 16)}.pdf`,
  };
}

function formatDateLabel(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!value) return "-";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", ...options });
}

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getPublicInvoiceOrigin(req: Request): string {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || "";
  if (origin.startsWith("http") && !origin.includes("supabase.co")) return origin.replace(/\/$/, "");
  return "https://id-preview--c30de963-7516-4305-bcdb-134d2d3ec03b.lovable.app";
}

function formatPaymentMode(mode: string | null | undefined): string {
  if (mode === "online") return "Online (Razorpay)";
  if (mode === "upi") return "UPI";
  if (mode === "card") return "Card";
  if (mode === "bank_transfer") return "Bank Transfer";
  return "Cash";
}

function isPersonalTrainingPayment(type: string | null | undefined): boolean {
  return ["pt", "pt_only", "pt_subscription", "pt_extension"].includes(type || "");
}

function labelPaymentType(type: string | null | undefined): string {
  const labels: Record<string, string> = {
    membership: "Gym Membership",
    gym_membership: "Gym Membership",
    gym_renewal: "Gym Membership Renewal",
    gym_and_pt: "Gym Membership + Personal Training",
    pt: "Personal Training",
    pt_only: "Personal Training",
    pt_subscription: "Personal Training",
    pt_extension: "Personal Training Extension",
    daily_pass: "Daily Pass",
    event_registration: "Event Registration",
  };
  return labels[type || ""] || (type || "Payment").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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
    const { paymentId, branchId, sendViaWhatsApp = true, action, publicToken: tokenInput } = body;

    // Token-only path: issue a short-lived signed PDF URL for the public Invoice page.
    // Does NOT require a paymentId; the token is the authorization.
    if (action === "sign_pdf") {
      if (!tokenInput || typeof tokenInput !== "string" || tokenInput.length < 32) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid token" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: inv } = await supabase
        .from("invoices")
        .select("pdf_storage_path, invoice_number, customer_name, gym_name")
        .eq("public_token", tokenInput)
        .maybeSingle();

      if (!inv?.pdf_storage_path) {
        return new Response(
          JSON.stringify({ success: false, error: "PDF not available" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: signed, error: signErr } = await supabase.storage
        .from("invoices")
        .createSignedUrl(inv.pdf_storage_path, 60 * 10); // 10 min for direct download

      if (signErr || !signed?.signedUrl) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to sign PDF" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const safeName = `${sanitizeFilePart(inv.invoice_number, "invoice")}_${sanitizeFilePart(inv.customer_name, "customer")}_${sanitizeFilePart(inv.gym_name, "gym")}.pdf`;
      return new Response(
        JSON.stringify({ success: true, pdfUrl: signed.signedUrl, pdfFileName: safeName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!paymentId) {
      return new Response(
        JSON.stringify({ success: false, error: "paymentId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if invoice already exists for this payment (we refresh data even when it exists)
    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id, invoice_number, transaction_id, public_token, pdf_storage_path")
      .eq("payment_id", paymentId)
      .maybeSingle();

    // Fetch payment with related data
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(`
        *,
        members:member_id (id, name, phone, branch_id),
        daily_pass_users:daily_pass_user_id (id, name, phone, branch_id),
        subscriptions:subscription_id (start_date, end_date, plan_months, trainer_fee, personal_trainer_id, is_custom_package, custom_days, pt_start_date, pt_end_date, branch_id),
        daily_pass_subscriptions:daily_pass_subscription_id (package_name, duration_days, start_date, end_date, price, trainer_fee, branch_id)
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
    const dailyPassSubscription = payment.daily_pass_subscriptions as any;

    let effectiveBranchId = branchId || payment.branch_id || member?.branch_id || dailyPassUser?.branch_id || subscription?.branch_id || dailyPassSubscription?.branch_id;

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
    let invoiceBrandName = "";
    let invoiceLogoUrl: string | null = null;
    let gymAddress = "";
    let gymPhone = "";
    let gymEmail = "";
    let gymGst = "";
    let branchName = "";
    let footerMessage = "Thank you for choosing our gym!";
    let invoicePrefix = "INV";
    let invoiceTaxRate = 0;
    let invoiceTerms = "";
    let invoicePalette = {
      header: "#1d4ed8",
      accent: "#dbeafe",
      text: "#172554",
    };

    if (effectiveBranchId) {
      const { data: branch } = await supabase
        .from("branches")
        .select("name")
        .eq("id", effectiveBranchId)
        .single();
      
      branchName = branch?.name || "";

      const { data: settings } = await supabase
        .from("gym_settings")
        .select("gym_name, gym_address, gym_phone, gym_email, gym_gst, invoice_prefix, invoice_footer_message, invoice_tax_rate, invoice_show_gst, invoice_terms, invoice_brand_name, invoice_logo_url, invoice_palette")
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
        invoiceTerms = settings.invoice_terms || "";
        invoiceBrandName = settings.invoice_brand_name || settings.gym_name || "";
        invoiceLogoUrl = settings.invoice_logo_url || null;
        invoicePalette = {
          header: settings.invoice_palette?.header || invoicePalette.header,
          accent: settings.invoice_palette?.accent || invoicePalette.accent,
          text: settings.invoice_palette?.text || invoicePalette.text,
        };
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

    let linkedPtSubscription: any = null;
    if (isPersonalTrainingPayment(payment.payment_type) && payment.member_id) {
      const { data: ptCandidates } = await supabase
        .from("pt_subscriptions")
        .select("id, start_date, end_date, total_fee, monthly_fee, branch_id, personal_trainers:personal_trainer_id (name)")
        .eq("member_id", payment.member_id)
        .order("created_at", { ascending: false })
        .limit(10);

      linkedPtSubscription = (ptCandidates || []).find((candidate: any) => Number(candidate.total_fee || 0) === Number(payment.amount || 0)) || ptCandidates?.[0] || null;
    }

    let eventRegistration: any = null;
    if (payment.payment_type === "event_registration") {
      const { data: registration } = await supabase
        .from("event_registrations")
        .select("events:event_id (title, event_date, event_end_date)")
        .eq("payment_id", paymentId)
        .maybeSingle();
      eventRegistration = registration;
    }

    // Calculate fee breakdown
    const trainerFee = isPersonalTrainingPayment(payment.payment_type)
      ? Number(linkedPtSubscription?.total_fee || payment.amount || 0)
      : Number(subscription?.trainer_fee || dailyPassSubscription?.trainer_fee || 0);
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

    const gymFee = isPersonalTrainingPayment(payment.payment_type) ? 0 : Math.max(subtotalBeforeTax - trainerFee, 0);

    const eventDetails = eventRegistration?.events as any;
    const rawStartDate = linkedPtSubscription?.start_date || dailyPassSubscription?.start_date || subscription?.start_date || eventDetails?.event_date;
    const rawEndDate = linkedPtSubscription?.end_date || dailyPassSubscription?.end_date || subscription?.pt_end_date || subscription?.end_date || eventDetails?.event_end_date || eventDetails?.event_date;
    const startDate = rawStartDate
      ? new Date(rawStartDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : paymentDate;
    const endDate = rawEndDate
      ? new Date(rawEndDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "-";

    let packageName = dailyPassSubscription?.package_name || labelPaymentType(payment.payment_type);
    if (payment.payment_type === "event_registration" && eventDetails?.title) {
      packageName = `Event Registration - ${eventDetails.title}`;
    }
    if ((payment.payment_type === "membership" || payment.payment_type === "gym_membership" || payment.payment_type === "gym_renewal" || payment.payment_type === "gym_and_pt") && subscription?.plan_months) {
      packageName += ` (${subscription.plan_months} Month${subscription.plan_months > 1 ? "s" : ""})`;
    }
    if (isPersonalTrainingPayment(payment.payment_type) && linkedPtSubscription?.personal_trainers?.name) {
      packageName += ` - ${linkedPtSubscription.personal_trainers.name}`;
    }
    if (dailyPassSubscription?.duration_days && !packageName.includes("Day")) packageName += ` (${dailyPassSubscription.duration_days} Days)`;
    if (subscription?.is_custom_package && subscription?.custom_days) packageName += ` (${subscription.custom_days} Days)`;

    // Reuse the invoice's stable random public_token (or generate one for new invoices).
    // The token is what users actually share — it's unguessable and gates both row + PDF access.
    const publicToken = existingInvoice?.public_token
      || (Array.from(crypto.getRandomValues(new Uint8Array(24)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""));

    const { displayFileName, storageFileName } = buildInvoicePdfNames(
      invoiceNumber,
      customerName,
      invoiceBrandName || gymName || branchName,
      publicToken,
    );

    // Generate PDF
    const pdfBytes = await generateInvoicePDF({
      invoiceNumber,
      gymName,
      invoiceBrandName: invoiceBrandName || gymName,
      invoiceLogoUrl,
      gymAddress,
      gymPhone,
      gymEmail,
      gymGst,
      memberName: customerName,
      memberPhone: customerPhone,
      memberId: member?.id || dailyPassUser?.id || "",
      paymentDate,
      amount: totalPaid,
      paymentMode: formatPaymentMode(payment.payment_mode),
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
      invoiceTerms,
      invoicePalette,
    });

    // Canonical storage path: one file per invoice, overwritten on regenerate
    // (this avoids the "many duplicate PDFs" storage bloat).
    const filePath = existingInvoice?.pdf_storage_path
      || `${effectiveBranchId || "general"}/${storageFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload invoice PDF: ${uploadError.message}`);
    }

    // Storage optimization: remove any legacy timestamped duplicates of this invoice
    // (created by the previous "always-new-filename" version). One canonical PDF per invoice.
    try {
      const folder = effectiveBranchId || "general";
      const safeInvoiceNo = sanitizeFilePart(invoiceNumber, "invoice");
      const { data: siblings } = await supabase.storage
        .from("invoices")
        .list(folder, { limit: 200, search: safeInvoiceNo });
      const stale = (siblings || [])
        .map((f: { name: string }) => `${folder}/${f.name}`)
        .filter((p: string) => p !== filePath && p.includes(safeInvoiceNo));
      if (stale.length > 0) {
        await supabase.storage.from("invoices").remove(stale);
      }
    } catch (cleanupErr) {
      console.warn("Stale invoice PDF cleanup skipped:", cleanupErr);
    }

    // Bucket is private; issue a long-lived signed URL for WhatsApp delivery.
    // The Invoice page itself fetches a fresh signed URL on demand via this function.
    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days for WhatsApp link
    const pdfUrl = signed?.signedUrl || null;

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
      start_date: toDateOnly(rawStartDate),
      end_date: toDateOnly(rawEndDate),
      payment_mode: payment.payment_mode,
      payment_date: payment.created_at,
      transaction_id: transactionId,
      pdf_url: pdfUrl,
      pdf_storage_path: filePath,
      footer_message: footerMessage,
      invoice_terms: invoiceTerms || null,
      invoice_brand_name: invoiceBrandName || gymName,
      invoice_logo_url: invoiceLogoUrl,
      invoice_palette: invoicePalette,
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
          public_token: publicToken,
          ...invoicePayload,
        });

      if (insertError) {
        console.error("Invoice insert error:", insertError);
      }
    }

    // Public link uses the unguessable token instead of the sequential invoice number.
    const invoiceLink = `${getPublicInvoiceOrigin(req)}/invoice/${publicToken}`;

    // Send via WhatsApp if requested
    let whatsappSent = false;
    let whatsappError: string | null = null;
    if (sendViaWhatsApp && customerPhone) {
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

        // Message body matches the gk_invoice_link_only template:
        //   Hi {{1}} 👋
        //   Your invoice has been generated successfully.
        //   📄 Amount: ₹{{2}}
        //   📅 Date: {{3}}
        //   You can view and download it here:
        //   🔗 {{4}}
        //   - {{5}} Team
        const amountStr = Number(payment.amount).toLocaleString("en-IN");
        const message =
          `Hi ${customerName} 👋\n` +
          `Your invoice has been generated successfully.\n\n` +
          `📄 Amount: ₹${amountStr}\n` +
          `📅 Date: ${paymentDate}\n\n` +
          `You can view and download it here:\n` +
          `🔗 ${invoiceLink}\n\n` +
          `- ${teamName}`;

        try {
          const result = await sendWhatsAppForTenant(supabase, {
            toPhone: cleaned,
            category: "invoice_link",
            // Positional mapping (see ZAVU_TEMPLATE_VARIABLES.invoice_link):
            //   {{1}} name, {{2}} amount, {{3}} payment_date, {{4}} invoice_link, {{5}} branch_name (= Team name)
            variables: {
              name: customerName,
              amount: amountStr,
              payment_date: paymentDate,
              invoice_link: invoiceLink,
              branch_name: branchName || gymName,
            },
            fallbackText: message,
            // Keep CTA button as a follow-up for providers that support it.
            ctaUrl: {
              url: invoiceLink,
              displayText: "View Invoice",
              text: `🧾 Your invoice ${invoiceNumber} is ready. Tap below to view & download.`,
            },
            branchId: effectiveBranchId,
          });

          whatsappSent = result.success;
          whatsappError = result.success ? null : (result.error || "WhatsApp provider rejected the message");

          const logData: any = {
            recipient_phone: customerPhone,
            recipient_name: customerName,
            notification_type: "invoice",
            message_content: message.substring(0, 500),
            status: whatsappSent ? "sent" : "failed",
            error_message: whatsappError,
            is_manual: true,
            branch_id: effectiveBranchId || null,
          };
          if (member?.id) logData.member_id = member.id;
          if (dailyPassUser?.id) logData.daily_pass_user_id = dailyPassUser.id;

          await supabase.from("whatsapp_notifications").insert(logData);
        } catch (err: any) {
          whatsappError = err?.message || "WhatsApp send failed";
          console.error("WhatsApp send error:", err);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoiceNumber,
        publicToken,
        invoiceUrl: invoiceLink,
        pdfUrl: pdfUrl,
        pdfFileName: displayFileName,
        whatsappSent,
        whatsappError,
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
  _PERISKOPE_API_KEY: string | undefined,
  _PERISKOPE_PHONE: string | undefined,
  branchId: string | undefined
) {
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

  // Resolve branch + gym name for the team signature in the template.
  let branchName = "";
  let gymName = "";
  if (effectiveBranchId) {
    const { data: br } = await supabase
      .from("branches")
      .select("name, gym_settings(gym_name)")
      .eq("id", effectiveBranchId)
      .maybeSingle();
    branchName = br?.name || "";
    gymName = (br as any)?.gym_settings?.[0]?.gym_name || (br as any)?.gym_settings?.gym_name || "";
  }
  const teamName = branchName || gymName || "Your Gym";

  const amountStr = Number(payment.amount).toLocaleString("en-IN");
  const paymentDate = new Date(payment.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  // Mirrors the gk_invoice_link_only template body.
  const message =
    `Hi ${customerName} 👋\n` +
    `Your invoice has been generated successfully.\n\n` +
    `📄 Amount: ₹${amountStr}\n` +
    `📅 Date: ${paymentDate}\n\n` +
    `You can view and download it here:\n` +
    `🔗 ${invoiceLink}\n\n` +
    `- Team ${teamName}`;

  try {
    const result = await sendWhatsAppForTenant(supabase, {
      toPhone: cleaned,
      category: "invoice_link",
      // Positional: {{1}} name, {{2}} amount, {{3}} payment_date, {{4}} invoice_link, {{5}} branch_name
      variables: {
        name: customerName,
        amount: amountStr,
        payment_date: paymentDate,
        invoice_link: invoiceLink,
        branch_name: teamName,
      },
      fallbackText: message,
      ctaUrl: {
        url: invoiceLink,
        displayText: "View Invoice",
        text: `🧾 Your invoice ${invoiceNumber} is ready. Tap below to view & download.`,
      },
      branchId: effectiveBranchId,
    });

    const logData: any = {
      recipient_phone: customerPhone,
      recipient_name: customerName,
      notification_type: "invoice",
      message_content: message.substring(0, 500),
      status: result.success ? "sent" : "failed",
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
