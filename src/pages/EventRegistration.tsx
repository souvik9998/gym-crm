import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { logUserActivity } from "@/hooks/useUserActivityLog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveEventId } from "@/lib/slugResolver";
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
import { Checkbox } from "@/components/ui/checkbox";

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

async function sendEventWhatsApp(params: {
  phone: string;
  name: string;
  eventTitle: string;
  eventDate: string;
  eventEndDate?: string | null;
  location?: string | null;
  amount: number;
  branchId: string;
  branchName?: string | null;
  memberId?: string | null;
  selectedItems?: { name: string; price: number }[];
}) {
  try {
    const dateStr = new Date(params.eventDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const timeStr = new Date(params.eventDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const endDateStr = params.eventEndDate
      ? new Date(params.eventEndDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      : null;
    const gymName = params.branchName || "Your Gym";

    let message =
      `🎉 *Event Registration Confirmed!*\n\n` +
      `Hi ${params.name}, 👋\n\n` +
      `You've been successfully registered for *${params.eventTitle}*!\n\n` +
      `📅 *Date:* ${dateStr}${endDateStr ? ` — ${endDateStr}` : ""}\n` +
      `🕐 *Time:* ${timeStr}`;

    if (params.location) {
      message += `\n📍 *Venue:* ${params.location}`;
    }

    // Add selected sub-events / pricing options
    if (params.selectedItems && params.selectedItems.length > 0) {
      message += `\n\n🎫 *Registered For:*`;
      params.selectedItems.forEach((item) => {
        message += `\n  • ${item.name}${item.price > 0 ? ` — ₹${item.price}` : " — Free"}`;
      });
    }

    message += `\n💰 *Total Amount:* ${params.amount === 0 ? "Free" : `₹${params.amount}`}\n\n`;
    message += `We look forward to seeing you there! 🔥\n\n`;
    message += `— Team ${gymName}`;

    await supabase.functions.invoke("send-whatsapp", {
      body: {
        phone: params.phone,
        name: params.name,
        type: "event_registration",
        branchId: params.branchId,
        branchName: params.branchName,
        customMessage: message,
        memberIds: params.memberId ? [params.memberId] : undefined,
        eventDetails: {
          title: params.eventTitle,
          date: dateStr,
          time: timeStr,
          venue: params.location || "TBA",
          amount: params.amount,
        },
      },
    });
  } catch (e) {
    console.error("WhatsApp event notification error:", e);
  }
}

export default function EventRegistration() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const [eventId, setEventId] = useState<string | null>(null);
  const [slugResolving, setSlugResolving] = useState(true);

  // Resolve slug/UUID to event ID
  useEffect(() => {
    if (!eventSlug) { setSlugResolving(false); return; }
    setSlugResolving(true);
    resolveEventId(eventSlug).then((id) => {
      setEventId(id || eventSlug);
      setSlugResolving(false);
    });
  }, [eventSlug]);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null);
  // For single mode
  const [selectedPricingId, setSelectedPricingId] = useState<string>("");
  // For multiple mode
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [customResponses, setCustomResponses] = useState<Record<string, string>>({});
  const [registered, setRegistered] = useState(false);
  const [phoneChecked, setPhoneChecked] = useState(false);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentStage, setPaymentStage] = useState<PaymentStage>("idle");

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

      const memberConditionResults: boolean[] = [];
      if (coupon.first_time_only) {
        memberConditionResults.push(!existingMemberId);
      }
      if (coupon.existing_members_only) {
        memberConditionResults.push(!!existingMemberId);
      }
      if (coupon.expired_members_only) {
        if (!existingMemberId) {
          memberConditionResults.push(false);
        } else {
          const { data: latestSub } = await supabase
            .from("subscriptions")
            .select("end_date")
            .eq("member_id", existingMemberId)
            .order("end_date", { ascending: false })
            .limit(1)
            .maybeSingle();

          memberConditionResults.push(!!latestSub?.end_date && latestSub.end_date < today);
        }
      }

      if (memberConditionResults.length > 0 && !memberConditionResults.some(Boolean)) {
        const labels: string[] = [];
        if (coupon.first_time_only) labels.push("first-time users");
        if (coupon.existing_members_only) labels.push("existing members");
        if (coupon.expired_members_only) labels.push("expired members");
        setCouponError(`This coupon is only for ${labels.join(" / ")}`);
        return;
      }

      if (existingMemberId && coupon.per_user_limit > 0) {
        const { count } = await supabase
          .from("coupon_usage")
          .select("*", { count: "exact", head: true })
          .eq("coupon_id", coupon.id)
          .eq("member_id", existingMemberId);

        if (count !== null && count >= coupon.per_user_limit) {
          setCouponError("You've already used this coupon the maximum number of times");
          return;
        }
      }

      const discountAmount = calculateCouponDiscount(coupon, totalBasePrice);
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
        .select("*, event_pricing_options(*), event_custom_fields(*), branches(name)")
        .eq("id", eventId!)
        .eq("status", "published")
        .single();
      if (error) throw error;

      if (data?.event_pricing_options?.length) {
        const { data: regCounts } = await supabase
          .from("event_registrations")
          .select("pricing_option_id")
          .eq("event_id", eventId!)
          .eq("payment_status", "success");

        // Also count from registration_items for multi-select events
        const { data: itemCounts } = await supabase
          .from("event_registration_items" as any)
          .select("pricing_option_id")
          .in("registration_id", 
            (await supabase.from("event_registrations").select("id").eq("event_id", eventId!).eq("payment_status", "success")).data?.map((r: any) => r.id) || []
          );

        const countMap: Record<string, number> = {};
        
        if ((data as any).selection_mode === "multiple" && itemCounts) {
          (itemCounts as any[] || []).forEach((r: any) => {
            countMap[r.pricing_option_id] = (countMap[r.pricing_option_id] || 0) + 1;
          });
        } else {
          (regCounts || []).forEach((r: any) => {
            if (r.pricing_option_id) countMap[r.pricing_option_id] = (countMap[r.pricing_option_id] || 0) + 1;
          });
        }

        data.event_pricing_options = data.event_pricing_options
          .map((p: any) => ({
            ...p,
            slots_filled: countMap[p.id] || 0,
          }))
          .sort((a: any, b: any) => a.sort_order - b.sort_order);
      }

      return data;
    },
    enabled: !!eventId,
  });

  const isMultiSelect = (event as any)?.selection_mode === "multiple";
  const pricingOptions = useMemo(() => {
    const allOptions = event?.event_pricing_options || [];
    const isLegacyPlaceholderOption = (option: any) => {
      if (allOptions.length <= 1) return false;
      const normalizedName = String(option?.name || "").trim().toLowerCase();
      if (normalizedName !== "general") return false;

      return allOptions.some((other: any) =>
        other?.id !== option?.id &&
        other?.price === option?.price &&
        other?.capacity_limit === option?.capacity_limit
      );
    };

    return allOptions.filter((p: any) => p.is_active !== false && !isLegacyPlaceholderOption(p));
  }, [event?.event_pricing_options]);

  useEffect(() => {
    if (pricingOptions.length > 0 && !selectedPricingId && !isMultiSelect) {
      setSelectedPricingId(pricingOptions[0].id);
    }
  }, [pricingOptions, isMultiSelect]);

  // Compute totals
  const selectedItems = useMemo(() => {
    if (isMultiSelect) {
      return pricingOptions.filter((p: any) => selectedItemIds.has(p.id));
    }
    const found = pricingOptions.find((p: any) => p.id === selectedPricingId);
    return found ? [found] : [];
  }, [isMultiSelect, selectedItemIds, selectedPricingId, pricingOptions]);

  const totalBasePrice = useMemo(() => 
    selectedItems.reduce((sum: number, p: any) => sum + Number(p.price || 0), 0),
    [selectedItems]
  );

  // Recalculate coupon when selection changes
  useEffect(() => {
    if (appliedCoupon) {
      const newDiscount = calculateCouponDiscount(appliedCoupon, totalBasePrice);
      setAppliedCoupon(prev => prev ? { ...prev, discountAmount: newDiscount } : null);
    }
  }, [totalBasePrice]);

  const payDiscount = appliedCoupon?.discountAmount || 0;
  const payTotal = Math.max(0, totalBasePrice - payDiscount);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const checkPhone = async () => {
    if (phone.length !== 10 || !/^[6-9]/.test(phone)) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }
    if (!event?.branch_id) {
      toast.error("Event details still loading. Please try again.");
      return;
    }
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
    // Use secure RPC for public member lookup (RLS-safe for anonymous users)
    const { data: rpcData, error: rpcError } = await supabase.rpc("check_phone_exists", {
      phone_number: phone,
      p_branch_id: event.branch_id,
    });
    if (rpcError) {
      console.error("Member lookup error:", rpcError);
    }
    const member = rpcData?.[0];
    if (member?.member_exists) {
      setName(member.member_name || "");
      setEmail(member.member_email || "");
      setExistingMemberId(member.member_id);
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

  const validateSelection = () => {
    if (isMultiSelect) {
      if (selectedItemIds.size === 0) { toast.error("Select at least one item"); return false; }
    } else {
      if (!selectedPricingId) { toast.error("Select an option"); return false; }
    }
    return true;
  };

  const validateCapacity = async () => {
    for (const item of selectedItems) {
      if (item.capacity_limit) {
        const spotsLeft = item.capacity_limit - (item.slots_filled || 0);
        if (spotsLeft <= 0) {
          throw new Error(`"${item.name}" is fully booked!`);
        }
      }
    }
  };

  const insertRegistrationItems = async (registrationId: string) => {
    if (isMultiSelect && selectedItems.length > 0) {
      const items = selectedItems.map((p: any) => ({
        registration_id: registrationId,
        pricing_option_id: p.id,
        amount_paid: Number(p.price || 0),
      }));
      await supabase.from("event_registration_items" as any).insert(items);
    }
  };

  // Free registration
  const registerFreeMutation = useMutation({
    mutationFn: async () => {
      if (!event || !eventId) throw new Error("Event not found");
      if (!name.trim()) throw new Error("Name is required");
      if (!validateSelection()) throw new Error("Select an option");

      const { data: dupReg } = await supabase.from("event_registrations").select("id").eq("event_id", eventId).eq("phone", phone).eq("payment_status", "success").maybeSingle();
      if (dupReg) throw new Error("You are already registered for this event");

      await validateCapacity();

      const customFields = event.event_custom_fields || [];
      for (const field of customFields) {
        if (field.is_required && !customResponses[field.id]) throw new Error(`${field.field_name} is required`);
      }

      const { data: reg, error } = await supabase.from("event_registrations").insert({
        event_id: eventId,
        pricing_option_id: isMultiSelect ? null : selectedPricingId,
        member_id: existingMemberId,
        name: name.trim(),
        phone,
        email: email.trim() || null,
        amount_paid: 0,
        payment_status: "success",
        custom_field_responses: customResponses,
      }).select("id").single();
      if (error) throw error;

      await insertRegistrationItems(reg.id);

      if (event.whatsapp_notify_on_register) {
        sendEventWhatsApp({
          phone, name: name.trim(), eventTitle: event.title,
          eventDate: event.event_date, eventEndDate: event.event_end_date,
          location: event.location, amount: 0, branchId: event.branch_id,
          branchName: (event as any).branches?.name,
          memberId: existingMemberId,
          selectedItems: selectedItems.map((p: any) => ({ name: p.name, price: Number(p.price || 0) })),
        });
      }
    },
    onSuccess: () => {
      setRegistered(true);
      logUserActivity({
        type: "event_registration",
        description: `User "${name}" registered for event "${event?.title}" (free)`,
        memberName: name.trim(),
        memberPhone: phone,
        amount: 0,
        branchId: event?.branch_id,
        metadata: { event_id: eventId, event_title: event?.title, payment_type: "free" },
      });
    },
    onError: (err: any) => toast.error("Registration failed", { description: err.message }),
  });

  // Razorpay payment flow
  const handlePayment = async () => {
    if (!event || !eventId) return;
    if (!validateSelection()) return;

    const amount = payTotal;
    if (amount <= 0) {
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
      await validateCapacity();

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) throw new Error("Failed to load payment gateway");

      const { data: orderData, error: orderError } = await supabase.functions.invoke(
        "create-razorpay-order",
        { body: { amount, memberName: name.trim(), memberPhone: phone, isNewMember: !existingMemberId, branchId: event.branch_id } }
      );
      if (orderError || !orderData) throw new Error(orderError?.message || "Failed to create order");

      const selectedItemsList = selectedItems.map((p: any) => ({ id: p.id, price: Number(p.price) }));
      
      let isVerifying = false;
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: event.title,
        description: selectedItems.map((p: any) => p.name).join(", "),
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
                  pricingOptionId: isMultiSelect ? null : selectedPricingId,
                  selectedItems: isMultiSelect ? selectedItemsList : undefined,
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
            logUserActivity({
              type: "event_registration",
              description: `User "${name}" registered for event "${event?.title}" (paid ₹${amount})`,
              memberName: name.trim(),
              memberPhone: phone,
              amount,
              branchId: event?.branch_id,
              metadata: { event_id: eventId, event_title: event?.title, payment_type: "razorpay", razorpay_payment_id: response.razorpay_payment_id },
            });
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Payment verification failed";
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

      const razorpay = new (window.Razorpay as any)(options);
      razorpay.on("payment.failed", function (resp: { error: { description: string } }) {
        toast.error("Payment Failed", { description: resp.error.description });
        setIsPaymentLoading(false);
        setPaymentStage("idle");
      });
      razorpay.open();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to initiate payment";
      toast.error("Payment Error", { description: msg });
      setIsPaymentLoading(false);
      setPaymentStage("idle");
    }
  };

  if (slugResolving || eventLoading) {
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
            {selectedItems.length > 0 && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium">Selected: {selectedItems.map((p: any) => p.name).join(", ")}</p>
              </div>
            )}
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
  const stepIndex = ["phone", "details", "payment"].indexOf(step);

  // Render item selection based on mode
  const renderItemSelection = () => {
    if (isMultiSelect) {
      return (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Select Items *</Label>
          <p className="text-xs text-muted-foreground">You can select multiple items</p>
          <div className="grid gap-2">
            {pricingOptions.map((p: any) => {
              const isFull = p.capacity_limit && p.slots_filled >= p.capacity_limit;
              const isSelected = selectedItemIds.has(p.id);
              return (
                <button
                  key={p.id}
                  disabled={isFull}
                  onClick={() => toggleItemSelection(p.id)}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/40 hover:border-primary/50",
                    isFull && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Checkbox checked={isSelected} className="mt-0.5" disabled={isFull} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{p.name}</p>
                      <span className="font-bold text-lg flex-shrink-0 ml-2">
                        {Number(p.price) === 0 ? "Free" : `₹${p.price}`}
                      </span>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                    {p.capacity_limit && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isFull ? (
                          <Badge variant="destructive" className="text-[10px] py-0">Sold Out</Badge>
                        ) : (
                          `${Math.max(0, p.capacity_limit - p.slots_filled)} spots left`
                        )}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {selectedItems.length > 0 && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Selected ({selectedItems.length})</p>
              {selectedItems.map((p: any) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="font-medium">{Number(p.price) === 0 ? "Free" : `₹${p.price}`}</span>
                </div>
              ))}
              <div className="border-t border-primary/20 mt-2 pt-2 flex justify-between font-bold text-sm">
                <span>Total</span>
                <span className="text-primary">{totalBasePrice === 0 ? "Free" : `₹${totalBasePrice}`}</span>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Single select (radio style)
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Select Option *</Label>
        <div className="grid gap-2">
          {pricingOptions.map((p: any) => {
            const isFull = p.capacity_limit && p.slots_filled >= p.capacity_limit;
            return (
              <button
                key={p.id}
                disabled={isFull}
                onClick={() => setSelectedPricingId(p.id)}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left",
                  selectedPricingId === p.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border/40 hover:border-primary/50",
                  isFull && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center",
                  selectedPricingId === p.id ? "border-primary" : "border-muted-foreground/40"
                )}>
                  {selectedPricingId === p.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{p.name}</p>
                    <span className="font-bold text-lg flex-shrink-0 ml-2">
                      {Number(p.price) === 0 ? "Free" : `₹${p.price}`}
                    </span>
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                  {p.capacity_limit && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isFull ? (
                        <Badge variant="destructive" className="text-[10px] py-0">Sold Out</Badge>
                      ) : (
                        `${Math.max(0, p.capacity_limit - p.slots_filled)} spots left`
                      )}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {paymentStage !== "idle" && (
        <PaymentProcessingOverlay stage={paymentStage as "verifying" | "processing" | "success"} isVisible={true} />
      )}

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
            {pricingOptions.map((p: any) => {
              const isFull = p.capacity_limit && p.slots_filled >= p.capacity_limit;
              return (
                <Badge key={p.id} variant={isFull ? "destructive" : "secondary"} className="text-xs px-3 py-1">
                  {p.name}: {Number(p.price) === 0 ? "Free" : `₹${p.price}`}
                  {isFull ? " (Sold Out)" : p.capacity_limit ? ` (${Math.max(0, p.capacity_limit - p.slots_filled)} left)` : ""}
                </Badge>
              );
            })}
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

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
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
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                      setPhoneChecked(false);
                      setExistingMemberId(null);
                      setAppliedCoupon(null);
                      setCouponError("");
                    }}
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

            {/* Step 2: Details & Selection */}
            {step === "details" && (
              <Card className="border border-border/50">
                <CardContent className="p-5 sm:p-6 space-y-5">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-lg">Select {isMultiSelect ? "Items" : "Option"} & Fill Details</h3>
                  </div>

                  {renderItemSelection()}

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
                        if (!validateSelection()) return;
                        for (const field of customFields) {
                          if (field.is_required && !customResponses[field.id]) {
                            toast.error(`${field.field_name} is required`);
                            return;
                          }
                        }
                        if (totalBasePrice === 0) {
                          registerFreeMutation.mutate();
                        } else {
                          setStep("payment");
                        }
                      }}
                      className="flex-1 rounded-xl gap-2 h-12"
                      size="lg"
                    >
                      {totalBasePrice === 0 ? "Register (Free)" : <>Proceed to Pay <ArrowRight className="w-4 h-4" /></>}
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
                        <Button size="sm" variant="outline" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()} className="rounded-xl px-4 h-10">
                          {couponLoading ? <ButtonSpinner /> : "Apply"}
                        </Button>
                      </div>
                    )}
                    {couponError && <p className="text-xs text-destructive">{couponError}</p>}
                  </div>

                  {/* Price summary */}
                  <div className="p-5 rounded-xl bg-muted/30 border border-border/40 space-y-3">
                    {selectedItems.map((p: any) => (
                      <div key={p.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{p.name}</span>
                        <span className="font-medium">₹{Number(p.price)}</span>
                      </div>
                    ))}
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
                  {selectedItems.length > 0 && selectedItems.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{p.name}</span>
                    </div>
                  ))}
                </div>
                {selectedItems.length > 0 && (
                  <div className="pt-3 border-t border-border/40 space-y-1">
                    {selectedItems.map((p: any) => (
                      <div key={p.id} className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">{p.name}</span>
                        <span>₹{Number(p.price)}</span>
                      </div>
                    ))}
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