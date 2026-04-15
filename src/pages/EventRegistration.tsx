import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { PaymentProcessingOverlay } from "@/components/ui/payment-processing-overlay";
import { format } from "date-fns";
import { Calendar, MapPin, CheckCircle2, ArrowLeft, ArrowRight, IndianRupee } from "lucide-react";
import PoweredByBadge from "@/components/PoweredByBadge";
import { cn } from "@/lib/utils";

type Step = "phone" | "details" | "payment";
type PaymentStage = "idle" | "verifying" | "processing" | "success";

declare global {
  interface Window {
    Razorpay: unknown;
  }
}

export default function EventRegistration() {
  const { eventId } = useParams<{ eventId: string }>();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null);
  const [selectedPricingId, setSelectedPricingId] = useState<string>("");
  const [customResponses, setCustomResponses] = useState<Record<string, string>>({});
  const [registered, setRegistered] = useState(false);
  const [phoneChecked, setPhoneChecked] = useState(false);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentStage, setPaymentStage] = useState<PaymentStage>("idle");

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ["public-event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, event_pricing_options(*), event_custom_fields(*)")
        .eq("id", eventId!)
        .eq("status", "published")
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  useEffect(() => {
    if (event?.event_pricing_options?.length && !selectedPricingId) {
      setSelectedPricingId(event.event_pricing_options[0].id);
    }
  }, [event]);

  const selectedPricing = event?.event_pricing_options?.find((p: any) => p.id === selectedPricingId);

  const checkPhone = async () => {
    if (phone.length !== 10 || !/^[6-9]/.test(phone)) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }
    const { data } = await supabase
      .from("members")
      .select("id, name, email")
      .eq("phone", phone)
      .eq("branch_id", event?.branch_id)
      .maybeSingle();
    
    if (data) {
      setName(data.name);
      setEmail(data.email || "");
      setExistingMemberId(data.id);
      toast.success("Member found! Details auto-filled.");
    }
    setPhoneChecked(true);
  };

  // Load Razorpay script
  const loadRazorpayScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  // Free registration mutation
  const registerFreeMutation = useMutation({
    mutationFn: async () => {
      if (!event || !eventId) throw new Error("Event not found");
      if (!name.trim()) throw new Error("Name is required");
      if (!selectedPricingId) throw new Error("Select a pricing option");

      if (selectedPricing?.capacity_limit) {
        const { count } = await supabase
          .from("event_registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("pricing_option_id", selectedPricingId)
          .eq("payment_status", "success");
        if ((count || 0) >= selectedPricing.capacity_limit) throw new Error("This option is fully booked!");
      }

      const customFields = event.event_custom_fields || [];
      for (const field of customFields) {
        if (field.is_required && !customResponses[field.id]) throw new Error(`${field.field_name} is required`);
      }

      const { error } = await supabase.from("event_registrations").insert({
        event_id: eventId,
        pricing_option_id: selectedPricingId,
        member_id: existingMemberId,
        name: name.trim(),
        phone,
        email: email.trim() || null,
        amount_paid: 0,
        payment_status: "success",
        custom_field_responses: customResponses,
      });
      if (error) throw error;

      try {
        await supabase.from("event_pricing_options")
          .update({ slots_filled: (selectedPricing?.slots_filled || 0) + 1 })
          .eq("id", selectedPricingId);
      } catch { /* non-critical */ }
    },
    onSuccess: () => setRegistered(true),
    onError: (err: any) => toast.error("Registration failed", { description: err.message }),
  });

  // Razorpay payment flow
  const handlePayment = async () => {
    if (!event || !eventId || !selectedPricing) return;
    const amount = Number(selectedPricing.price);
    if (amount <= 0) { registerFreeMutation.mutate(); return; }

    setIsPaymentLoading(true);
    setPaymentStage("idle");

    try {
      // Validate custom fields first
      const customFields = event.event_custom_fields || [];
      for (const field of customFields) {
        if (field.is_required && !customResponses[field.id]) throw new Error(`${field.field_name} is required`);
      }

      // Check capacity
      if (selectedPricing.capacity_limit) {
        const { count } = await supabase
          .from("event_registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("pricing_option_id", selectedPricingId)
          .eq("payment_status", "success");
        if ((count || 0) >= selectedPricing.capacity_limit) throw new Error("This option is fully booked!");
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) throw new Error("Failed to load payment gateway");

      // Create Razorpay order via edge function
      const { data: orderData, error: orderError } = await supabase.functions.invoke(
        "create-razorpay-order",
        {
          body: {
            amount,
            memberName: name.trim(),
            memberPhone: phone,
            isNewMember: !existingMemberId,
            branchId: event.branch_id,
          },
        }
      );

      if (orderError || !orderData) throw new Error(orderError?.message || "Failed to create order");

      // Open Razorpay checkout
      let isVerifying = false;
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: event.title,
        description: `${selectedPricing.name} - Event Registration`,
        order_id: orderData.orderId,
        prefill: { name: name.trim(), contact: phone },
        theme: { color: "#F97316" },
        handler: async function (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
          isVerifying = true;
          setPaymentStage("verifying");

          try {
            setPaymentStage("processing");

            // Verify payment
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
              "verify-razorpay-payment",
              {
                body: {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  memberId: existingMemberId,
                  memberName: name.trim(),
                  memberPhone: phone,
                  amount,
                  isNewMember: !existingMemberId,
                  branchId: event.branch_id,
                  // Skip member/subscription creation — this is event-only
                  skipMemberCreation: true,
                },
              }
            );

            if (verifyError) throw new Error(verifyError.message || "Payment verification failed");

            // Payment verified — now create the event registration with success status
            const { error: regError } = await supabase.from("event_registrations").insert({
              event_id: eventId,
              pricing_option_id: selectedPricingId,
              member_id: existingMemberId,
              name: name.trim(),
              phone,
              email: email.trim() || null,
              amount_paid: amount,
              payment_status: "success",
              payment_id: response.razorpay_payment_id,
              custom_field_responses: customResponses,
            });

            if (regError) throw regError;

            // Update slots
            try {
              await supabase.from("event_pricing_options")
                .update({ slots_filled: (selectedPricing.slots_filled || 0) + 1 })
                .eq("id", selectedPricingId);
            } catch { /* non-critical */ }

            setPaymentStage("success");
            setIsPaymentLoading(false);
            await new Promise((r) => setTimeout(r, 400));
            setRegistered(true);
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Payment verification failed";
            console.error("Verification error:", error);
            isVerifying = false;
            setIsPaymentLoading(false);
            setPaymentStage("idle");
            toast.error("Payment Verification Failed", { description: msg });
          }
        },
        modal: {
          ondismiss: function () {
            if (isVerifying) return;
            setIsPaymentLoading(false);
            setPaymentStage("idle");
          },
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const razorpay = new (window.Razorpay as any)(options);
      razorpay.on("payment.failed", function (resp: { error: { description: string } }) {
        console.error("Payment failed:", resp.error);
        toast.error("Payment Failed", { description: resp.error.description });
        setIsPaymentLoading(false);
        setPaymentStage("idle");
      });
      razorpay.open();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to initiate payment";
      console.error("Payment initiation error:", error);
      toast.error("Payment Error", { description: msg });
      setIsPaymentLoading(false);
      setPaymentStage("idle");
    }
  };

  if (eventLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-bold text-foreground mb-2">Event Not Found</h2>
            <p className="text-muted-foreground">This event may have ended or is no longer available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (registered) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-green-200 dark:border-green-800">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Registration Successful!</h2>
            <p className="text-muted-foreground">
              You've been registered for <strong>{event.title}</strong>. See you there!
            </p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>{format(new Date(event.event_date), "EEEE, dd MMM yyyy • hh:mm a")}</p>
              {event.location && <p>{event.location}</p>}
            </div>
          </CardContent>
        </Card>
        <PoweredByBadge />
      </div>
    );
  }

  const customFields = event.event_custom_fields || [];
  const pricingOptions = event.event_pricing_options || [];

  return (
    <div className="min-h-screen bg-background">
      <PaymentProcessingOverlay stage={paymentStage} isVisible={paymentStage !== "idle"} />

      {event.banner_image_url && (
        <div className="w-full h-48 sm:h-64 overflow-hidden">
          <img src={event.banner_image_url} alt={event.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-4">
        {/* Event Info */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{event.title}</h1>
          {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {format(new Date(event.event_date), "dd MMM yyyy, hh:mm a")}
            </div>
            {event.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {event.location}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {pricingOptions.map((p: any) => (
              <Badge key={p.id} variant="secondary" className="text-xs">
                {p.name}: {Number(p.price) === 0 ? "Free" : `₹${p.price}`}
                {p.capacity_limit && ` (${p.capacity_limit - p.slots_filled} spots left)`}
              </Badge>
            ))}
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 pt-2">
          {["phone", "details", "payment"].map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                step === s ? "bg-primary text-primary-foreground" :
                  (["phone", "details", "payment"].indexOf(step) > i ? "bg-green-500 text-white" : "bg-muted text-muted-foreground")
              )}>
                {["phone", "details", "payment"].indexOf(step) > i ? "✓" : i + 1}
              </div>
              {i < 2 && <div className="flex-1 h-0.5 bg-muted rounded" />}
            </div>
          ))}
        </div>

        {/* Step 1: Phone */}
        {step === "phone" && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold">Enter your phone number</h3>
              <div className="space-y-2">
                <Label>Phone Number *</Label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-muted rounded-l-xl text-sm text-muted-foreground">+91</span>
                  <Input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setPhoneChecked(false); }}
                    placeholder="Enter 10-digit number"
                    className="rounded-r-xl rounded-l-none"
                    maxLength={10}
                    inputMode="numeric"
                  />
                </div>
              </div>
              {phoneChecked && !existingMemberId && (
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="rounded-xl" />
                  <Label>Email (optional)</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="rounded-xl" type="email" />
                </div>
              )}
              {phoneChecked && existingMemberId && (
                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/10 text-sm">
                  <p className="font-medium text-green-700 dark:text-green-400">Welcome back, {name}!</p>
                </div>
              )}
              <Button
                onClick={() => {
                  if (!phoneChecked) { checkPhone(); return; }
                  if (!name.trim()) { toast.error("Name is required"); return; }
                  setStep("details");
                }}
                className="w-full rounded-xl gap-2"
              >
                {!phoneChecked ? "Check" : <>Next <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Details & Pricing */}
        {step === "details" && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold">Select Option & Fill Details</h3>
              
              <div className="space-y-2">
                <Label>Select Pricing *</Label>
                <div className="grid gap-2">
                  {pricingOptions.map((p: any) => {
                    const isFull = p.capacity_limit && p.slots_filled >= p.capacity_limit;
                    return (
                      <button
                        key={p.id}
                        disabled={isFull}
                        onClick={() => setSelectedPricingId(p.id)}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                          selectedPricingId === p.id
                            ? "border-primary bg-primary/5"
                            : "border-border/40 hover:border-primary/50",
                          isFull && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          {p.capacity_limit && (
                            <p className="text-xs text-muted-foreground">
                              {isFull ? "Sold out" : `${p.capacity_limit - p.slots_filled} spots left`}
                            </p>
                          )}
                        </div>
                        <span className="font-bold text-sm">
                          {Number(p.price) === 0 ? "Free" : `₹${p.price}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {customFields.length > 0 && (
                <div className="space-y-3">
                  {customFields.map((field: any) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label className="text-sm">
                        {field.field_name} {field.is_required && <span className="text-destructive">*</span>}
                      </Label>
                      {field.field_type === "select" ? (
                        <Select
                          value={customResponses[field.id] || ""}
                          onValueChange={(v) => setCustomResponses({ ...customResponses, [field.id]: v })}
                        >
                          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {(Array.isArray(field.options) ? field.options : []).map((opt: string) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={field.field_type === "number" ? "number" : "text"}
                          value={customResponses[field.id] || ""}
                          onChange={(e) => setCustomResponses({ ...customResponses, [field.id]: e.target.value })}
                          className="rounded-xl"
                          placeholder={field.field_name}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep("phone")} className="rounded-xl gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  onClick={() => {
                    for (const field of customFields) {
                      if (field.is_required && !customResponses[field.id]) {
                        toast.error(`${field.field_name} is required`);
                        return;
                      }
                    }
                    if (Number(selectedPricing?.price || 0) === 0) {
                      registerFreeMutation.mutate();
                    } else {
                      setStep("payment");
                    }
                  }}
                  className="flex-1 rounded-xl gap-2"
                >
                  {Number(selectedPricing?.price || 0) === 0 ? "Register (Free)" : <>Proceed to Pay <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Payment */}
        {step === "payment" && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold">Payment</h3>
              <div className="p-4 rounded-xl bg-muted/30 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{selectedPricing?.name}</span>
                  <span className="font-semibold">₹{selectedPricing?.price}</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-border/40">
                  <span>Total</span>
                  <span>₹{selectedPricing?.price}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("details")} className="rounded-xl gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  onClick={handlePayment}
                  disabled={isPaymentLoading}
                  className="flex-1 rounded-xl gap-2"
                >
                  {isPaymentLoading ? <><ButtonSpinner /> Processing...</> : (
                    <>
                      <IndianRupee className="w-4 h-4" /> Pay ₹{selectedPricing?.price}
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                Payment will be processed securely via Razorpay
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <PoweredByBadge />
    </div>
  );
}
