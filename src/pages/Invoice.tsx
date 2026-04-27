import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, Copy, Share2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import PoweredByBadge from "@/components/PoweredByBadge";

interface InvoiceData {
  id: string;
  invoice_number: string;
  public_token: string;
  customer_name: string;
  customer_phone: string | null;
  gym_name: string;
  gym_address: string | null;
  gym_phone: string | null;
  gym_email: string | null;
  gym_gst: string | null;
  branch_name: string | null;
  amount: number;
  subtotal: number;
  discount: number;
  tax: number;
  gym_fee: number;
  joining_fee: number;
  trainer_fee: number;
  package_name: string | null;
  start_date: string | null;
  end_date: string | null;
  payment_mode: string | null;
  payment_date: string | null;
  transaction_id: string | null;
  has_pdf: boolean;
  footer_message: string | null;
  invoice_terms: string | null;
  invoice_brand_name: string | null;
  invoice_logo_url: string | null;
  invoice_palette: {
    header?: string;
    accent?: string;
    text?: string;
  } | null;
  created_at: string;
  member_id: string | null;
  payment_id: string | null;
}

const normalizeInvoiceData = (data: Record<string, unknown>): InvoiceData => ({
  id: String(data.id ?? ""),
  invoice_number: String(data.invoice_number ?? ""),
  public_token: String(data.public_token ?? ""),
  customer_name: String(data.customer_name ?? ""),
  customer_phone: (data.customer_phone as string | null) ?? null,
  gym_name: String(data.gym_name ?? ""),
  gym_address: (data.gym_address as string | null) ?? null,
  gym_phone: (data.gym_phone as string | null) ?? null,
  gym_email: (data.gym_email as string | null) ?? null,
  gym_gst: (data.gym_gst as string | null) ?? null,
  branch_name: (data.branch_name as string | null) ?? null,
  amount: Number(data.amount ?? 0),
  subtotal: Number(data.subtotal ?? 0),
  discount: Number(data.discount ?? 0),
  tax: Number(data.tax ?? 0),
  gym_fee: Number(data.gym_fee ?? 0),
  joining_fee: Number(data.joining_fee ?? 0),
  trainer_fee: Number(data.trainer_fee ?? 0),
  package_name: (data.package_name as string | null) ?? null,
  start_date: (data.start_date as string | null) ?? null,
  end_date: (data.end_date as string | null) ?? null,
  payment_mode: (data.payment_mode as string | null) ?? null,
  payment_date: (data.payment_date as string | null) ?? null,
  transaction_id: (data.transaction_id as string | null) ?? null,
  has_pdf: Boolean(data.has_pdf ?? false),
  footer_message: (data.footer_message as string | null) ?? null,
  invoice_terms: (data.invoice_terms as string | null) ?? null,
  invoice_brand_name: (data.invoice_brand_name as string | null) ?? null,
  invoice_logo_url: (data.invoice_logo_url as string | null) ?? null,
  invoice_palette: (data.invoice_palette as InvoiceData["invoice_palette"]) ?? null,
  created_at: String(data.created_at ?? ""),
  member_id: (data.member_id as string | null) ?? null,
  payment_id: (data.payment_id as string | null) ?? null,
});

export default function Invoice() {
  // Route param is the unguessable public token (≥48 hex chars).
  const { invoiceId: token } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid invoice link");
      setLoading(false);
      return;
    }

    // Tokens are 48 hex chars. Reject anything else early to avoid wasted RPC calls.
    if (!/^[a-f0-9]{32,}$/i.test(token)) {
      setError("Invalid or expired invoice link");
      setLoading(false);
      return;
    }

    fetchInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchInvoice = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .rpc("get_invoice_by_public_token", { _token: token });

      if (fetchError) throw fetchError;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setError("Invoice not found");
        return;
      }

      setInvoice(normalizeInvoiceData(row as Record<string, unknown>));
    } catch (err: any) {
      setError("Unable to load invoice");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Invoice link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = async () => {
    if (!invoice?.payment_id) {
      toast.error("Payment reference missing for this invoice");
      return;
    }

    setSendingWhatsApp(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice", {
        body: { paymentId: invoice.payment_id, sendViaWhatsApp: true },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Failed to send invoice on WhatsApp");
      }

      if (data.whatsappSent) {
        toast.success("Invoice PDF sent to user on WhatsApp");
      } else {
        toast.error("WhatsApp delivery failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send invoice on WhatsApp");
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleDownloadPDF = async () => {
    const downloadPdf = (url: string, filename: string) => {
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.pdf`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    if (invoice?.pdf_url) {
      downloadPdf(invoice.pdf_url, invoice.invoice_number || "invoice");
    } else {
      // Try to generate the PDF
      toast.info("Generating PDF...");
      try {
        const { data, error } = await supabase.functions.invoke("generate-invoice", {
          body: { paymentId: invoice?.payment_id, branchId: undefined, sendViaWhatsApp: false },
        });
        if (!error && data?.pdfUrl) {
          downloadPdf(data.pdfUrl, invoice?.invoice_number || "invoice");
          // Refresh invoice data to get the pdf_url
          fetchInvoice();
        } else {
          // Try fetching fresh data
          const { data: freshInvoice } = await supabase
            .from("invoices")
            .select("pdf_url")
            .eq("invoice_number", invoiceId)
            .maybeSingle();
          if (freshInvoice?.pdf_url) {
            downloadPdf(freshInvoice.pdf_url, invoice?.invoice_number || "invoice");
          } else {
            toast.error("PDF not available for this invoice");
          }
        }
      } catch {
        toast.error("Failed to generate PDF");
      }
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatPaymentMode = (mode: string | null) => {
    if (!mode) return "-";
    const modeMap: Record<string, string> = {
      cash: "Cash",
      online: "Online (Razorpay)",
      upi: "UPI",
      card: "Card",
      bank_transfer: "Bank Transfer",
    };
    return modeMap[mode] || mode;
  };

  const palette = {
    header: invoice?.invoice_palette?.header || "#1d4ed8",
    accent: invoice?.invoice_palette?.accent || "#dbeafe",
    text: invoice?.invoice_palette?.text || "#172554",
  };
  const brandName = invoice?.invoice_brand_name || invoice?.gym_name || "";
  const invoiceItems = useMemo(() => {
    if (!invoice) return [];

    const items: Array<{ description: string; duration: string; amount: number; qty?: number }> = [];

    if (invoice.gym_fee > 0) {
      items.push({
        description: invoice.package_name || "Gym Membership",
        duration:
          invoice.start_date && invoice.end_date
            ? `${formatDate(invoice.start_date)} – ${formatDate(invoice.end_date)}`
            : "-",
        amount: Number(invoice.gym_fee),
        qty: 1,
      });
    }

    if (invoice.joining_fee > 0) {
      items.push({ description: "Joining Fee", duration: "-", amount: Number(invoice.joining_fee), qty: 1 });
    }

    if (invoice.trainer_fee > 0) {
      items.push({
        description: "Personal Training Fee",
        duration:
          invoice.start_date && invoice.end_date
            ? `${formatDate(invoice.start_date)} – ${formatDate(invoice.end_date)}`
            : "-",
        amount: Number(invoice.trainer_fee),
        qty: 1,
      });
    }

    if (items.length === 0) {
      items.push({
        description: invoice.package_name || "Payment",
        duration: "-",
        amount: Number(invoice.amount),
        qty: 1,
      });
    }

    return items;
  }, [invoice]);

  const amountInWords = useMemo(() => {
    if (!invoice) return "Zero rupees only";

    const value = Math.round(Number(invoice.amount));
    if (!Number.isFinite(value) || value <= 0) return "Zero rupees only";

    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const toWords = (num: number): string => {
      if (num === 0) return "";
      if (num < 20) return ones[num];
      if (num < 100) return `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ""}`;
      if (num < 1000) {
        return `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ` ${toWords(num % 100)}` : ""}`;
      }
      if (num < 100000) {
        return `${toWords(Math.floor(num / 1000))} Thousand${num % 1000 ? ` ${toWords(num % 1000)}` : ""}`;
      }
      if (num < 10000000) {
        return `${toWords(Math.floor(num / 100000))} Lakh${num % 100000 ? ` ${toWords(num % 100000)}` : ""}`;
      }
      return `${toWords(Math.floor(num / 10000000))} Crore${num % 10000000 ? ` ${toWords(num % 10000000)}` : ""}`;
    };

    return `${toWords(value).trim()} rupees only`;
  }, [invoice]);

  const formatCurrency = (value: number) => `₹${Number(value).toLocaleString("en-IN")}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">Invoice Not Found</h1>
          <p className="text-sm text-muted-foreground">
            {error || "This invoice doesn't exist or has been removed."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Action Bar - Sticky top */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {invoice.invoice_number}
            </p>
            <p className="text-xs text-muted-foreground">
              {invoice.gym_name}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-1.5">
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </Button>
            <Button variant="default" size="sm" onClick={handleShareWhatsApp} disabled={sendingWhatsApp || !invoice.payment_id} className="gap-1.5">
              {sendingWhatsApp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{sendingWhatsApp ? "Sending..." : "WhatsApp"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Invoice Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 pb-24">
        <Card className="overflow-hidden border-border bg-card shadow-sm">
          <div className="border-b border-border" style={{ backgroundColor: palette.header, color: "white" }}>
            <div className="px-4 py-3 text-center text-lg font-bold sm:text-xl">
              {invoice.gym_gst ? "TAX INVOICE" : "INVOICE"}
            </div>
          </div>

          <div className="border-b border-border px-4 py-6 sm:px-8">
            <div className="flex flex-col items-center gap-3 text-center">
              {invoice.invoice_logo_url && (
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-background p-1">
                  <img src={invoice.invoice_logo_url} alt={`${brandName} logo`} className="h-full w-full object-contain" />
                </div>
              )}
              <div className="space-y-1">
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{brandName}</h1>
                {invoice.gym_address && <p className="text-sm text-muted-foreground">{invoice.gym_address}</p>}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {invoice.gym_phone && <span>{invoice.gym_phone}</span>}
                  {invoice.gym_email && <span>{invoice.gym_email}</span>}
                  {invoice.gym_gst && <span>GSTIN: {invoice.gym_gst}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 border-b border-border md:grid-cols-[1.1fr_0.9fr]">
            <div className="border-b border-border p-4 sm:p-6 md:border-b-0 md:border-r">
              <p className="mb-2 text-sm font-semibold text-foreground">Bill To:</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="text-lg font-semibold text-foreground">{invoice.customer_name}</p>
                {invoice.customer_phone && <p>Phone: {invoice.customer_phone}</p>}
                {invoice.member_id && <p>ID: {invoice.member_id.slice(0, 8).toUpperCase()}</p>}
                {invoice.branch_name && <p>Branch: {invoice.branch_name}</p>}
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Invoice No:</span>
                <span>{invoice.invoice_number}</span>
                <span className="font-medium text-foreground">Date:</span>
                <span>{formatDate(invoice.payment_date || invoice.created_at)}</span>
                <span className="font-medium text-foreground">Payment Mode:</span>
                <span>{formatPaymentMode(invoice.payment_mode)}</span>
                {invoice.transaction_id && (
                  <>
                    <span className="font-medium text-foreground">Transaction:</span>
                    <span className="break-all font-mono text-xs sm:text-sm">{invoice.transaction_id}</span>
                  </>
                )}
              </div>
              <div className="mt-4 inline-flex items-center gap-2 border border-border px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: palette.accent, color: palette.text }}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                PAID
              </div>
            </div>
          </div>

          <div className="overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1.7fr)_120px_90px_130px] border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid" style={{ backgroundColor: palette.accent, color: palette.text }}>
              <div className="border-r border-border px-4 py-3">Description</div>
              <div className="border-r border-border px-4 py-3 text-center">Duration</div>
              <div className="border-r border-border px-4 py-3 text-center">Qty</div>
              <div className="px-4 py-3 text-right">Amount</div>
            </div>

            <div className="divide-y divide-border">
              {invoiceItems.map((item, index) => (
                <div key={`${item.description}-${index}`} className="grid grid-cols-1 md:grid-cols-[minmax(0,1.7fr)_120px_90px_130px]">
                  <div className="px-4 py-4 md:border-r md:border-border">
                    <p className="text-sm font-medium text-foreground">{item.description}</p>
                  </div>
                  <div className="px-4 py-4 text-sm text-muted-foreground md:border-r md:border-border md:text-center">
                    <span className="md:hidden font-medium text-foreground">Duration: </span>
                    {item.duration}
                  </div>
                  <div className="px-4 py-4 text-sm text-muted-foreground md:border-r md:border-border md:text-center">
                    <span className="md:hidden font-medium text-foreground">Qty: </span>
                    {item.qty ?? 1}
                  </div>
                  <div className="px-4 py-4 text-sm font-semibold text-foreground md:text-right">
                    <span className="md:hidden font-medium">Amount: </span>
                    {formatCurrency(item.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 border-t border-border lg:grid-cols-[1.3fr_0.7fr]">
            <div className="border-b border-border p-4 sm:p-6 lg:border-b-0 lg:border-r">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-foreground">Terms & conditions</p>
                  <div className="min-h-28 whitespace-pre-wrap text-sm text-muted-foreground">
                    {invoice.invoice_terms || "1. Fees once paid are non-refundable unless approved by management.\n2. Keep this invoice for future reference.\n3. Package validity follows the dates listed above."}
                  </div>
                </div>

                <div className="border-t border-border pt-4 text-sm">
                  <p className="font-medium text-foreground">Total Amount (in words):</p>
                  <p className="mt-1 capitalize text-muted-foreground">{amountInWords}</p>
                </div>

                <div className="border-t border-border pt-6">
                  <p className="text-sm font-semibold text-foreground">For: {brandName}</p>
                  <div className="mt-12">
                    <p className="text-sm font-medium italic text-foreground">Authorised Signatory</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="overflow-hidden border border-border">
                <div className="grid grid-cols-[1fr_auto] border-b border-border px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">{formatCurrency(invoice.subtotal || invoice.amount)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="grid grid-cols-[1fr_auto] border-b border-border px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="font-medium text-foreground">-{formatCurrency(invoice.discount)}</span>
                  </div>
                )}
                {invoice.tax > 0 && (
                  <div className="grid grid-cols-[1fr_auto] border-b border-border px-4 py-3 text-sm">
                    <span className="text-muted-foreground">GST / Tax</span>
                    <span className="font-medium text-foreground">{formatCurrency(invoice.tax)}</span>
                  </div>
                )}
                <div className="grid grid-cols-[1fr_auto] px-4 py-3 text-sm font-bold" style={{ backgroundColor: palette.header, color: "white" }}>
                  <span>Grand Total</span>
                  <span>{formatCurrency(invoice.amount)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border px-4 py-5 text-center sm:px-8">
            {invoice.footer_message && (
              <p className="text-sm italic text-muted-foreground">"{invoice.footer_message}"</p>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground/70">
              This is a computer-generated invoice. No signature required.
            </p>
          </div>
        </Card>
      </div>

      <PoweredByBadge />
    </div>
  );
}
