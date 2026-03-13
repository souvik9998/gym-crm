import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Calendar, Phone, User, IndianRupee, Camera, Building2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import PoweredByBadge from "@/components/PoweredByBadge";
import { supabase } from "@/integrations/supabase/client";

interface SuccessState {
  memberName: string;
  phone: string;
  amount: number;
  endDate: string;
  isNewMember: boolean;
  branchName?: string;
  paymentId?: string;
  branchId?: string;
}

const DownloadInvoiceButton = ({ paymentId, branchId }: { paymentId: string; branchId?: string }) => {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      // Check if invoice already exists
      const { data: existing } = await supabase
        .from("invoices")
        .select("invoice_number, pdf_url")
        .eq("payment_id", paymentId)
        .maybeSingle();

      if (existing?.invoice_number) {
        window.open(`/invoice/${existing.invoice_number}`, "_blank");
        return;
      }

      // Generate invoice
      const { data, error } = await supabase.functions.invoke("generate-invoice", {
        body: { paymentId, branchId, sendViaWhatsApp: false },
      });

      if (error || !data?.success) {
        toast.error("Failed to generate invoice");
        return;
      }

      if (data.invoiceNumber) {
        window.open(`/invoice/${data.invoiceNumber}`, "_blank");
      }
    } catch {
      toast.error("Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="accent"
      size="lg"
      className="w-full gap-2"
      onClick={handleDownload}
      disabled={loading}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
      {loading ? "Generating Invoice..." : "View Invoice"}
    </Button>
  );
};

const Success = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as SuccessState;

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md mx-4 border">
          <CardContent className="p-8 text-center">
            <p>No payment information found.</p>
            <Button variant="accent" className="mt-4" onClick={() => navigate("/")}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName = state.branchName || "the gym";
  
  const whatsappMessage = encodeURIComponent(
    `Hi! I just ${state.isNewMember ? "registered" : "renewed my membership"} at ${state.branchName || "the gym"}. My membership is valid until ${state.endDate}.`
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full border">
        <CardContent className="p-8">
          {/* Success Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-success/20 rounded-full animate-ping" />
              <div className="relative w-20 h-20 bg-success rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-success-foreground" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-semibold text-center mb-2">
            Payment Successful!
          </h1>
          <p className="text-center text-muted-foreground mb-6">
            {state.isNewMember
              ? `Welcome to ${displayName}!`
              : "Your membership has been renewed!"}
          </p>
          
          {state.branchName && (
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {state.branchName}
              </p>
            </div>
          )}

          {/* Details Card */}
          <div className="bg-muted rounded-xl p-5 space-y-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Member Name</p>
                <p className="font-semibold">{state.memberName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                <Phone className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone Number</p>
                <p className="font-semibold">+91 {state.phone}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                <IndianRupee className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Amount Paid</p>
                <p className="font-semibold">₹{state.amount.toLocaleString("en-IN")}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valid Until</p>
                <p className="font-semibold text-success">{state.endDate}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {state.paymentId && (
              <DownloadInvoiceButton paymentId={state.paymentId} branchId={state.branchId} />
            )}
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => {
                toast.success("Take a screenshot now to save your receipt!");
              }}
            >
              <Camera className="w-4 h-4 mr-2" />
              Take Screenshot
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground mt-6">
            A confirmation message will be sent to your WhatsApp number.
          </p>
        </CardContent>
      </Card>
      <PoweredByBadge />
    </div>
  );
};

export default Success;
