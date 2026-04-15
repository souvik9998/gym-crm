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
import { Calendar, MapPin, CheckCircle2, ArrowLeft, ArrowRight, IndianRupee, User, Phone, Mail, Ticket, TicketPercent, X } from "lucide-react";
import PoweredByBadge from "@/components/PoweredByBadge";
import { cn } from "@/lib/utils";

interface AppliedCoupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount_cap: number | null;
  discountAmount: number;
}

type Step = "phone" | "details" | "payment";
type PaymentStage = "idle" | "verifying" | "processing" | "success";

declare global {
  interface Window {
    Razorpay: unknown;
  }
}

// Send WhatsApp for free event registrations
async function sendEventWhatsApp(params: {
  phone: string;
  name: string;
  eventTitle: string;
  eventDate: string;
  location?: string | null;
  amount: number;
  branchId: string;
  memberId?: string | null;
}) {
  try {
    await supabase.functions.invoke("send-whatsapp", {
      body: {
        phone: params.phone,
        name: params.name,
        type: "event_registration",
        branchId: params.branchId,
        customMessage:
          `🎉 *Event Registration Confirmed!*\n\n` +
          `Hi ${params.name}, 👋\n\n` +
          `You've been successfully registered for *${params.eventTitle}*!\n\n` +
          `📅 *Date:* ${new Date(params.eventDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}\n` +
          `🕐 *Time:* ${new Date(params.eventDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` +
          (params.location ? `\n📍 *Venue:* ${params.location}` : "") +
          `\n💰 *Amount:* ${params.amount === 0 ? "Free" : `₹${params.amount}`}\n\n` +
          `We look forward to seeing you there! 🔥`,
        memberIds: params.memberId ? [params.memberId] : undefined,
      },
    });
  } catch (e) {
    console.error("WhatsApp event notification error:", e);
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

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  const calculateCouponDiscount = (coupon: Omit<AppliedCoupon, 'discountAmount'>, basePrice: number): number => {
    if (basePrice <= 0) return 0;
    let discount = 0;
    if (coupon.discount_type === "percentage") {
      discount = (basePrice * coupon.discount_value) / 100;
      if (coupon.max_discount_cap && discount > coupon.max_discount_cap) discount = coupon.max_discount_cap;
    } else if (coupon.discount_type === "flat") {
      discount = coupon.discount_value;
    }
    return Math.min(Math.round(discount), basePrice);
  };

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError("Enter a coupon code"); return; }
    setCouponLoading(true);
    setCouponError("");
    try {
      const { data: coupon, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!coupon) { setCouponError("Invalid coupon code"); return; }
      const applicableOn = coupon.applicable_on as any;
      if (!applicableOn?.event) { setCouponError("This coupon is not valid for events"); return; }
      const today = new Date().toISOString().split("T")[0];
      if (coupon.start_date > today) { setCouponError("Coupon is not yet active"); return; }
      if (coupon.end_date && coupon.end_date < today) { setCouponError("Coupon has expired"); return; }
      if (coupon.total_usage_limit && coupon.usage_count >= coupon.total_usage_limit) { setCouponError("Coupon usage limit reached"); return; }
      if (coupon.applicable_branch_ids?.length > 0 && !coupon.applicable_branch_ids.includes(event?.branch_id)) { setCouponError("Coupon not valid for this branch"); return; }
      const basePrice = Number(selectedPricing?.price || 0);
      const discountAmount = calculateCouponDiscount(coupon, basePrice);
      setAppliedCoupon({ id: coupon.id, code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value, max_discount_cap: coupon.max_discount_cap, discountAmount });
    } catch (err: any) {
      setCouponError(err.message || "Failed to validate coupon");
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => { setAppliedCoupon(null); setCouponCode(""); setCouponError(""); };

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

    // Check for duplicate registration
    const { data: existingReg } = await supabase
      .from("event_registrations")
      .select("id")
      .eq("event_id", eventId!)
      .eq("phone", phone)
      .eq("payment_status", "success")
      .maybeSingle();

    if (existingReg) {
      toast.error("You are already registered for this event");
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

      // Send WhatsApp for free registration
      if (event.whatsapp_notify_on_register) {
        sendEventWhatsApp({
          phone,
          name: name.trim(),
          eventTitle: event.title,
          eventDate: event.event_date,
          location: event.location,
          amount: 0,
          branchId: event.branch_id,
          memberId: existingMemberId,
        });
      }
    },
    onSuccess: () => setRegistered(true),
    onError: (err: any) => toast.error("Registration failed", { description: err.message }),
  });

  // Razorpay payment flow
  const handlePayment = async () => {
    if (!event || !eventId || !selectedPricing) return;
    const baseAmount = Number(selectedPricing.price);
    const couponDisc = appliedCoupon?.discountAmount || 0;
    const amount = Math.max(0, baseAmount - couponDisc);
    if (amount <= 0) {
      // Coupon made it free - register directly
      registerFreeMutation.mutate();
      return;
    }

    setIsPaymentLoading(true);
    setPaymentStage("idle");

    try {
      const customFields = event.event_custom_fields || [];
      for (const field of customFields) {
        if (field.is_required && !customResponses[field.id]) throw new Error(`${field.field_name} is required`);
      }

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

            const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
              "finalize-event-payment",
              {
                body: {
                  eventId,
                  pricingOptionId: selectedPricingId,
                  branchId: event.branch_id,
                  memberId: existingMemberId,
                  name: name.trim(),
                  phone,
                  email: email.trim() || null,
                  amount,
                  customResponses,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                },
              }
            );

            if (verifyError || !verifyData?.success) {
              throw new Error(verifyError?.message || verifyData?.error || "Payment verification failed");
            }

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
        <Card className="max-w-lg w-full border-green-200 dark:border-green-800">
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
  const stepIndex = ["phone", "details", "payment"].indexOf(step);
  const payBasePrice = Number(selectedPricing?.price || 0);
  const payDiscount = appliedCoupon?.discountAmount || 0;
  const payTotal = Math.max(0, payBasePrice - payDiscount);

  return (
    <div className="min-h-screen bg-background">
      {paymentStage !== "idle" && (
        <PaymentProcessingOverlay stage={paymentStage as "verifying" | "processing" | "success"} isVisible={true} />
      )}

      {/* Hero Banner */}
      {event.banner_image_url && (
        <div className="w-full h-48 sm:h-56 lg:h-72 overflow-hidden relative">
          <img src={event.banner_image_url} alt={event.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Event Header */}
        <div className="space-y-3">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{event.title}</h1>
          {event.description && <p className="text-sm lg:text-base text-muted-foreground leading-relaxed">{event.description}</p>}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              {format(new Date(event.event_date), "dd MMM yyyy, hh:mm a")}
            </div>
            {event.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                {event.location}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {pricingOptions.map((p: any) => (
              <Badge key={p.id} variant="secondary" className="text-xs px-3 py-1">
                {p.name}: {Number(p.price) === 0 ? "Free" : `₹${p.price}`}
                {p.capacity_limit && ` (${Math.max(0, p.capacity_limit - p.slots_filled)} spots left)`}
              </Badge>
            ))}
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-0">
          {["Phone", "Details", "Payment"].map((label, i) => (
            <div key={label} className="flex items-center flex-1">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  stepIndex === i ? "bg-primary text-primary-foreground shadow-md" :
                    stepIndex > i ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                )}>
                  {stepIndex > i ? "✓" : i + 1}
                </div>
                <span className={cn(
                  "text-xs font-medium hidden sm:block",
                  stepIndex === i ? "text-foreground" : "text-muted-foreground"
                )}>{label}</span>
              </div>
              {i < 2 && <div className={cn(
                "flex-1 h-0.5 mx-3 rounded-full transition-colors",
                stepIndex > i ? "bg-green-500" : "bg-muted"
              )} />}
            </div>
          ))}
        </div>

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Main form area */}
          <div className="lg:col-span-3">
            {/* Step 1: Phone */}
            {step === "phone" && (
              <Card className="border border-border/50">
                <CardContent className="p-5 sm:p-6 space-y-5">
                  <div className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-lg">Your Phone Number</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Phone Number *</Label>
                      <div className="flex">
                        <span className="flex items-center px-4 bg-muted border border-r-0 border-input rounded-l-lg text-sm text-muted-foreground font-medium">+91</span>
                        <Input
                          value={phone}
                          onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setPhoneChecked(false); }}
                          placeholder="Enter 10-digit number"
                          className="rounded-l-none"
                          maxLength={10}
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    {phoneChecked && !existingMemberId && (
                      <div className="space-y-4 animate-fade-in">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Full Name *</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="pl-10" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Email (optional)</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="pl-10" type="email" />
                          </div>
                        </div>
                      </div>
                    )}
                    {phoneChecked && existingMemberId && (
                      <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <p className="font-medium text-green-700 dark:text-green-400">Welcome back, {name}!</p>
                        </div>
                        <p className="text-xs text-green-600 dark:text-green-500 mt-1 ml-7">Your details have been auto-filled</p>
                      </div>
                    )}
                    <Button
                      onClick={() => {
                        if (!phoneChecked) { checkPhone(); return; }
                        if (!name.trim()) { toast.error("Name is required"); return; }
                        setStep("details");
                      }}
                      className="w-full rounded-xl gap-2 h-12"
                      size="lg"
                    >
                      {!phoneChecked ? "Continue" : <>Next <ArrowRight className="w-4 h-4" /></>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Details & Pricing */}
            {step === "details" && (
              <Card className="border border-border/50">
                <CardContent className="p-5 sm:p-6 space-y-5">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-lg">Select Option & Fill Details</h3>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Select Pricing *</Label>
                    <div className="grid gap-2">
                      {pricingOptions.map((p: any) => {
                        const isFull = p.capacity_limit && p.slots_filled >= p.capacity_limit;
                        return (
                          <button
                            key={p.id}
                            disabled={isFull}
                            onClick={() => setSelectedPricingId(p.id)}
                            className={cn(
                              "flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left",
                              selectedPricingId === p.id
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border/40 hover:border-primary/50",
                              isFull && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <div>
                              <p className="font-medium">{p.name}</p>
                              {p.capacity_limit && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {isFull ? "Sold out" : `${Math.max(0, p.capacity_limit - p.slots_filled)} spots left`}
                                </p>
                              )}
                            </div>
                            <span className="font-bold text-lg">
                              {Number(p.price) === 0 ? "Free" : `₹${p.price}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {customFields.length > 0 && (
                    <div className="space-y-4 pt-2">
                      <p className="text-sm font-medium text-muted-foreground">Additional Information</p>
                      {customFields.map((field: any) => (
                        <div key={field.id} className="space-y-1.5">
                          <Label className="text-sm font-medium">
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

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => setStep("phone")} className="rounded-xl gap-2 h-12">
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
                      className="flex-1 rounded-xl gap-2 h-12"
                      size="lg"
                    >
                      {Number(selectedPricing?.price || 0) === 0 ? "Register (Free)" : <>Proceed to Pay <ArrowRight className="w-4 h-4" /></>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Payment */}
            {step === "payment" && (
              <Card className="border border-border/50">
                <CardContent className="p-5 sm:p-6 space-y-5">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-lg">Complete Payment</h3>
                  </div>

                  {/* Coupon section */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <TicketPercent className="w-4 h-4" /> Have a Coupon?
                    </Label>
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between p-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <span className="text-sm font-mono font-bold">{appliedCoupon.code}</span>
                          <span className="text-xs text-green-600">-₹{appliedCoupon.discountAmount}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={removeCoupon}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          value={couponCode}
                          onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                          placeholder="Enter coupon code"
                          className="rounded-xl font-mono text-sm"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleApplyCoupon}
                          disabled={couponLoading || !couponCode.trim()}
                          className="rounded-xl px-4 h-10"
                        >
                          {couponLoading ? <ButtonSpinner /> : "Apply"}
                        </Button>
                      </div>
                    )}
                    {couponError && <p className="text-xs text-destructive">{couponError}</p>}
                  </div>

                  {/* Price summary */}
                  <div className="p-5 rounded-xl bg-muted/30 border border-border/40 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{selectedPricing?.name}</span>
                      <span className="font-medium">₹{payBasePrice}</span>
                    </div>
                    {payDiscount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Coupon ({appliedCoupon?.code})</span>
                        <span>-₹{payDiscount}</span>
                      </div>
                    )}
                    <div className="border-t border-border/40" />
                    <div className="flex justify-between text-base font-bold">
                      <span>Total</span>
                      <span className="text-primary">{payTotal === 0 ? "Free" : `₹${payTotal}`}</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep("details")} className="rounded-xl gap-2 h-12">
                      <ArrowLeft className="w-4 h-4" /> Back
                    </Button>
                    <Button
                      onClick={handlePayment}
                      disabled={isPaymentLoading}
                      className="flex-1 rounded-xl gap-2 h-12"
                      size="lg"
                    >
                      {isPaymentLoading ? <><ButtonSpinner /> Processing...</> : (
                        <>
                          <IndianRupee className="w-4 h-4" /> {payTotal === 0 ? "Register (Free)" : `Pay ₹${payTotal}`}
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Payment will be processed securely via Razorpay
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar summary on desktop */}
          <div className="hidden lg:block lg:col-span-2">
            <Card className="border border-border/50 sticky top-6">
              <CardContent className="p-5 space-y-4">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Registration Summary</h4>
                <div className="space-y-3 text-sm">
                  {name && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{name}</span>
                    </div>
                  )}
                  {phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">+91 {phone}</span>
                    </div>
                  )}
                  {selectedPricing && (
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{selectedPricing.name}</span>
                    </div>
                  )}
                </div>
                {selectedPricing && (
                  <div className="pt-3 border-t border-border/40 space-y-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{selectedPricing.name}</span>
                      <span>₹{payBasePrice}</span>
                    </div>
                    {payDiscount > 0 && (
                      <div className="flex justify-between items-center text-sm text-green-600">
                        <span>Coupon</span>
                        <span>-₹{payDiscount}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="text-lg font-bold text-primary">
                        {payTotal === 0 ? "Free" : `₹${payTotal}`}
                      </span>
                    </div>
                  </div>
                )}
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/40">
                  <p className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(event.event_date), "dd MMM yyyy, hh:mm a")}
                  </p>
                  {event.location && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {event.location}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <PoweredByBadge />
    </div>
  );
}
