import { useEffect, useState } from "react";
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
  pdf_url: string | null;
  footer_message: string | null;
  created_at: string;
  member_id: string | null;
  payment_id: string | null;
}

export default function Invoice() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!invoiceId) {
      setError("Invalid invoice link");
      setLoading(false);
      return;
    }

    // Validate format
    if (!/^[A-Za-z0-9-]+$/.test(invoiceId)) {
      setError("Invalid invoice ID");
      setLoading(false);
      return;
    }

    fetchInvoice();
  }, [invoiceId]);

  const fetchInvoice = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("invoices")
        .select("*")
        .eq("invoice_number", invoiceId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!data) {
        setError("Invoice not found");
        return;
      }

      setInvoice(data as InvoiceData);
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

  const handleShareWhatsApp = () => {
    const url = window.location.href;
    const text = `Invoice ${invoice?.invoice_number} - ₹${Number(invoice?.amount).toLocaleString("en-IN")}\n\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
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
          body: { paymentId: invoice?.id, branchId: undefined, sendViaWhatsApp: false },
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
            <Button variant="default" size="sm" onClick={handleShareWhatsApp} className="gap-1.5 bg-[#25D366] hover:bg-[#20BD5A] text-white">
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Invoice Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="bg-primary p-6 sm:p-8 text-primary-foreground">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                  {invoice.gym_name}
                </h1>
                {invoice.gym_address && (
                  <p className="text-sm mt-1 opacity-80">{invoice.gym_address}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs opacity-70">
                  {invoice.gym_phone && <span>📞 {invoice.gym_phone}</span>}
                  {invoice.gym_email && <span>✉️ {invoice.gym_email}</span>}
                  {invoice.gym_gst && <span>GST: {invoice.gym_gst}</span>}
                </div>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <p className="text-lg sm:text-xl font-bold tracking-widest opacity-90">INVOICE</p>
                <p className="text-sm font-mono mt-1">{invoice.invoice_number}</p>
                <p className="text-xs mt-1 opacity-70">
                  {formatDate(invoice.payment_date || invoice.created_at)}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Payment Status Badge */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-success/10 text-success px-3 py-1.5 rounded-full text-xs font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                PAID
              </div>
              <span className="text-sm text-muted-foreground">
                via {formatPaymentMode(invoice.payment_mode)}
              </span>
            </div>

            <Separator />

            {/* Bill To */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Bill To
                </p>
                <p className="font-semibold text-foreground">{invoice.customer_name}</p>
                {invoice.customer_phone && (
                  <p className="text-sm text-muted-foreground mt-0.5">📞 {invoice.customer_phone}</p>
                )}
                {invoice.member_id && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    ID: {invoice.member_id.slice(0, 8).toUpperCase()}
                  </p>
                )}
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Invoice Info
                </p>
                <p className="text-sm text-muted-foreground">
                  Date: <span className="text-foreground font-medium">{formatDate(invoice.payment_date || invoice.created_at)}</span>
                </p>
                {invoice.transaction_id && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Txn: <span className="text-foreground font-mono text-xs">{invoice.transaction_id}</span>
                  </p>
                )}
                {invoice.branch_name && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Branch: <span className="text-foreground">{invoice.branch_name}</span>
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Items Table */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Membership Details
              </p>
              <div className="border rounded-lg overflow-hidden">
                {/* Table Header */}
                <div className="bg-muted/50 px-4 py-2.5 grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground uppercase">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-3 text-center">Duration</div>
                  <div className="col-span-3 text-right">Amount</div>
                </div>

                {/* Gym Fee Row */}
                {invoice.gym_fee > 0 && (
                  <div className="px-4 py-3 grid grid-cols-12 gap-2 items-center border-t text-sm">
                    <div className="col-span-6 font-medium text-foreground">
                      {invoice.package_name || "Gym Membership"}
                    </div>
                    <div className="col-span-3 text-center text-muted-foreground text-xs">
                      {invoice.start_date && invoice.end_date
                        ? `${formatDate(invoice.start_date)} – ${formatDate(invoice.end_date)}`
                        : "-"}
                    </div>
                    <div className="col-span-3 text-right font-medium">
                      ₹{Number(invoice.gym_fee).toLocaleString("en-IN")}
                    </div>
                  </div>
                )}

                {/* Joining Fee Row */}
                {invoice.joining_fee > 0 && (
                  <div className="px-4 py-3 grid grid-cols-12 gap-2 items-center border-t text-sm">
                    <div className="col-span-6 text-foreground">Joining Fee</div>
                    <div className="col-span-3 text-center text-muted-foreground text-xs">-</div>
                    <div className="col-span-3 text-right font-medium">
                      ₹{Number(invoice.joining_fee).toLocaleString("en-IN")}
                    </div>
                  </div>
                )}

                {/* Trainer Fee Row */}
                {invoice.trainer_fee > 0 && (
                  <div className="px-4 py-3 grid grid-cols-12 gap-2 items-center border-t text-sm">
                    <div className="col-span-6 text-foreground">Personal Training Fee</div>
                    <div className="col-span-3 text-center text-muted-foreground text-xs">
                      {invoice.start_date && invoice.end_date
                        ? `${formatDate(invoice.start_date)} – ${formatDate(invoice.end_date)}`
                        : "-"}
                    </div>
                    <div className="col-span-3 text-right font-medium">
                      ₹{Number(invoice.trainer_fee).toLocaleString("en-IN")}
                    </div>
                  </div>
                )}

                {/* If no breakdown, show single line */}
                {invoice.gym_fee === 0 && invoice.joining_fee === 0 && invoice.trainer_fee === 0 && (
                  <div className="px-4 py-3 grid grid-cols-12 gap-2 items-center border-t text-sm">
                    <div className="col-span-6 font-medium text-foreground">
                      {invoice.package_name || "Payment"}
                    </div>
                    <div className="col-span-3 text-center text-muted-foreground text-xs">-</div>
                    <div className="col-span-3 text-right font-medium">
                      ₹{Number(invoice.amount).toLocaleString("en-IN")}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="flex justify-end">
              <div className="w-full sm:w-64 space-y-2">
                {invoice.subtotal > 0 && invoice.subtotal !== invoice.amount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{Number(invoice.subtotal).toLocaleString("en-IN")}</span>
                  </div>
                )}
                {invoice.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="text-success">-₹{Number(invoice.discount).toLocaleString("en-IN")}</span>
                  </div>
                )}
                {invoice.tax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>₹{Number(invoice.tax).toLocaleString("en-IN")}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between items-center pt-1">
                  <span className="font-semibold text-foreground">Total Paid</span>
                  <span className="text-xl font-bold text-foreground">
                    ₹{Number(invoice.amount).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Message */}
            {invoice.footer_message && (
              <>
                <Separator />
                <div className="text-center py-2">
                  <p className="text-sm text-muted-foreground italic">
                    "{invoice.footer_message}"
                  </p>
                </div>
              </>
            )}

            {/* Auto-generated note */}
            <div className="text-center pt-2">
              <p className="text-[10px] text-muted-foreground/60">
                This is a computer-generated invoice. No signature required.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <PoweredByBadge />
    </div>
  );
}
