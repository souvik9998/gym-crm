import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Search, UserPlus, CheckCircle2, TicketPercent, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: any;
}

interface AppliedCoupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount_cap: number | null;
  discountAmount: number;
}

export function AdminEventRegisterDialog({ open, onOpenChange, event }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"search" | "new">("search");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedPricingId, setSelectedPricingId] = useState("");
  const [customResponses, setCustomResponses] = useState<Record<string, string>>({});
  const [foundMember, setFoundMember] = useState<any>(null);
  const [searchDone, setSearchDone] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"success" | "pending">("success");
  const [freeForExisting, setFreeForExisting] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  const pricingOptions = event?.event_pricing_options || [];
  const customFields = event?.event_custom_fields || [];

  useEffect(() => {
    if (open && pricingOptions.length > 0 && !selectedPricingId) {
      setSelectedPricingId(pricingOptions[0].id);
    }
  }, [open, pricingOptions]);

  // Recalculate coupon discount when pricing changes
  useEffect(() => {
    if (appliedCoupon) {
      const pricing = pricingOptions.find((p: any) => p.id === selectedPricingId);
      const basePrice = Number(pricing?.price || 0);
      const newDiscount = calculateDiscount(appliedCoupon, basePrice);
      setAppliedCoupon(prev => prev ? { ...prev, discountAmount: newDiscount } : null);
    }
  }, [selectedPricingId]);

  const calculateDiscount = (coupon: Omit<AppliedCoupon, 'discountAmount'>, basePrice: number): number => {
    if (basePrice <= 0) return 0;
    let discount = 0;
    if (coupon.discount_type === "percentage") {
      discount = (basePrice * coupon.discount_value) / 100;
      if (coupon.max_discount_cap && discount > coupon.max_discount_cap) {
        discount = coupon.max_discount_cap;
      }
    } else if (coupon.discount_type === "flat") {
      discount = coupon.discount_value;
    }
    return Math.min(discount, basePrice);
  };

  const selectedPricing = pricingOptions.find((p: any) => p.id === selectedPricingId);
  const basePrice = Number(selectedPricing?.price || 0);
  const isExistingMember = !!foundMember;
  const effectiveFree = freeForExisting && isExistingMember;
  const couponDiscount = effectiveFree ? 0 : (appliedCoupon?.discountAmount || 0);
  const finalAmount = effectiveFree ? 0 : Math.max(0, basePrice - couponDiscount);

  const resetForm = () => {
    setPhone("");
    setName("");
    setEmail("");
    setSelectedPricingId(pricingOptions[0]?.id || "");
    setCustomResponses({});
    setFoundMember(null);
    setSearchDone(false);
    setMode("search");
    setPaymentStatus("success");
    setFreeForExisting(false);
    setCouponCode("");
    setAppliedCoupon(null);
    setCouponError("");
  };

  const handleSearch = async () => {
    if (phone.length !== 10 || !/^[6-9]/.test(phone)) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }

    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id")
      .eq("event_id", event.id)
      .eq("phone", phone)
      .eq("payment_status", "success")
      .maybeSingle();

    if (existing) {
      toast.error("This phone number is already registered for this event");
      return;
    }

    const { data: member } = await supabase
      .from("members")
      .select("id, name, email, phone")
      .eq("phone", phone)
      .eq("branch_id", event.branch_id)
      .maybeSingle();

    if (member) {
      setFoundMember(member);
      setName(member.name);
      setEmail(member.email || "");
    } else {
      setFoundMember(null);
      setName("");
      setEmail("");
    }
    setSearchDone(true);
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

      // Check if applicable on events
      const applicableOn = coupon.applicable_on as any;
      if (!applicableOn?.event) {
        setCouponError("This coupon is not valid for events");
        return;
      }

      // Check date validity
      const today = new Date().toISOString().split("T")[0];
      if (coupon.start_date > today) { setCouponError("Coupon is not yet active"); return; }
      if (coupon.end_date && coupon.end_date < today) { setCouponError("Coupon has expired"); return; }

      // Check usage limit
      if (coupon.total_usage_limit && coupon.usage_count >= coupon.total_usage_limit) {
        setCouponError("Coupon usage limit reached");
        return;
      }

      // Check branch
      if (coupon.branch_id && coupon.branch_id !== event.branch_id) {
        setCouponError("Coupon not valid for this branch");
        return;
      }

      const discountAmount = calculateDiscount(coupon, basePrice);

      setAppliedCoupon({
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        max_discount_cap: coupon.max_discount_cap,
        discountAmount,
      });
    } catch (err: any) {
      setCouponError(err.message || "Failed to validate coupon");
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      if (!phone || phone.length !== 10) throw new Error("Valid phone number is required");
      if (!selectedPricingId) throw new Error("Select a pricing option");

      // Check capacity
      if (selectedPricing?.capacity_limit) {
        const { count } = await supabase
          .from("event_registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id)
          .eq("pricing_option_id", selectedPricingId)
          .eq("payment_status", "success");
        if ((count || 0) >= selectedPricing.capacity_limit) {
          throw new Error("This pricing option is fully booked!");
        }
      }

      // Validate required custom fields
      for (const field of customFields) {
        if (field.is_required && !customResponses[field.id]) {
          throw new Error(`${field.field_name} is required`);
        }
      }

      const amountToPay = finalAmount;
      const effectivePaymentStatus = amountToPay === 0 ? "success" : paymentStatus;

      const { error } = await supabase.from("event_registrations").insert({
        event_id: event.id,
        pricing_option_id: selectedPricingId,
        member_id: foundMember?.id || null,
        name: name.trim(),
        phone,
        email: email.trim() || null,
        amount_paid: effectivePaymentStatus === "success" ? amountToPay : 0,
        payment_status: effectivePaymentStatus,
        custom_field_responses: Object.keys(customResponses).length > 0 ? customResponses : null,
      });
      if (error) throw error;

      // Update slots filled
      if (effectivePaymentStatus === "success") {
        try {
          await supabase
            .from("event_pricing_options")
            .update({ slots_filled: (selectedPricing?.slots_filled || 0) + 1 })
            .eq("id", selectedPricingId);
        } catch { /* non-critical */ }
      }

      // Increment coupon usage
      if (appliedCoupon && !effectiveFree) {
        try {
          await supabase
            .from("coupons")
            .update({ usage_count: (appliedCoupon as any).usage_count ? (appliedCoupon as any).usage_count + 1 : 1 })
            .eq("id", appliedCoupon.id);
        } catch { /* non-critical */ }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-registrations", event.id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Member registered successfully!");
      resetForm();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Registration failed", { description: err.message }),
  });

  const handleClose = (val: boolean) => {
    if (!val) resetForm();
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Register for {event?.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "search" ? "default" : "outline"}
              className="flex-1 rounded-xl text-xs"
              onClick={() => { setMode("search"); resetForm(); }}
            >
              <Search className="w-3.5 h-3.5 mr-1.5" /> Search Existing
            </Button>
            <Button
              size="sm"
              variant={mode === "new" ? "default" : "outline"}
              className="flex-1 rounded-xl text-xs"
              onClick={() => { setMode("new"); setFoundMember(null); setSearchDone(false); setFreeForExisting(false); }}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" /> New Person
            </Button>
          </div>

          {/* Search mode */}
          {mode === "search" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone Number</Label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-muted rounded-l-xl text-sm text-muted-foreground">+91</span>
                  <Input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setSearchDone(false); setFoundMember(null); setFreeForExisting(false); }}
                    placeholder="Enter 10-digit number"
                    className="rounded-r-xl rounded-l-none"
                    maxLength={10}
                    inputMode="numeric"
                  />
                  <Button size="sm" onClick={handleSearch} disabled={phone.length !== 10} className="rounded-xl">
                    Search
                  </Button>
                </div>
              </div>

              {searchDone && foundMember && (
                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">Member Found</span>
                  </div>
                  <p className="text-sm text-foreground">{foundMember.name}</p>
                  {foundMember.email && <p className="text-xs text-muted-foreground">{foundMember.email}</p>}
                </div>
              )}

              {searchDone && !foundMember && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-700 dark:text-amber-400">No member found. Fill in details below:</p>
                </div>
              )}
            </div>
          )}

          {/* Name & Email - show if new mode or search didn't find member */}
          {(mode === "new" || (searchDone && !foundMember)) && (
            <div className="space-y-3">
              {mode === "new" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone Number *</Label>
                  <div className="flex gap-2">
                    <span className="flex items-center px-3 bg-muted rounded-l-xl text-sm text-muted-foreground">+91</span>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Enter 10-digit number"
                      className="rounded-r-xl rounded-l-none"
                      maxLength={10}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter full name" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email (optional)</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="rounded-xl" type="email" />
              </div>
            </div>
          )}

          {/* Pricing selection */}
          {pricingOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Pricing Option *</Label>
              <div className="grid gap-2">
                {pricingOptions.map((p: any) => {
                  const spotsLeft = p.capacity_limit ? p.capacity_limit - (p.slots_filled || 0) : null;
                  const isFull = spotsLeft !== null && spotsLeft <= 0;
                  return (
                    <button
                      key={p.id}
                      disabled={isFull}
                      onClick={() => setSelectedPricingId(p.id)}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border text-left transition-colors",
                        selectedPricingId === p.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-primary/30",
                        isFull && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div>
                        <span className="text-sm font-medium">{p.name}</span>
                        {spotsLeft !== null && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({isFull ? "Full" : `${spotsLeft} spots left`})
                          </span>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {Number(p.price) === 0 ? "Free" : `₹${p.price}`}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Free for existing member toggle */}
          {isExistingMember && basePrice > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
              <div>
                <p className="text-sm font-medium">Free for Existing Member</p>
                <p className="text-xs text-muted-foreground">Waive the fee for this gym member</p>
              </div>
              <Switch checked={freeForExisting} onCheckedChange={(v) => { setFreeForExisting(v); if (v) removeCoupon(); }} />
            </div>
          )}

          {/* Coupon code section */}
          {basePrice > 0 && !effectiveFree && (
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <TicketPercent className="w-3.5 h-3.5" /> Coupon Code
              </Label>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div>
                      <span className="text-sm font-mono font-bold">{appliedCoupon.code}</span>
                      <span className="text-xs text-green-600 ml-2">-₹{appliedCoupon.discountAmount}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={removeCoupon}>
                    <X className="w-3.5 h-3.5" />
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
                    className="rounded-xl px-4"
                  >
                    {couponLoading ? <ButtonSpinner /> : "Apply"}
                  </Button>
                </div>
              )}
              {couponError && <p className="text-xs text-destructive">{couponError}</p>}
            </div>
          )}

          {/* Price summary */}
          {basePrice > 0 && (
            <div className="p-3 rounded-xl bg-muted/30 border border-border/50 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Base Price</span>
                <span>₹{basePrice}</span>
              </div>
              {effectiveFree && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>Existing Member Discount</span>
                  <span>-₹{basePrice}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>Coupon ({appliedCoupon?.code})</span>
                  <span>-₹{couponDiscount}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold pt-1 border-t border-border/40">
                <span>Total</span>
                <span>{finalAmount === 0 ? "Free" : `₹${finalAmount}`}</span>
              </div>
            </div>
          )}

          {/* Custom fields */}
          {customFields.length > 0 && (
            <div className="space-y-3">
              <Label className="text-xs font-medium text-muted-foreground">Additional Fields</Label>
              {customFields
                .sort((a: any, b: any) => a.sort_order - b.sort_order)
                .map((field: any) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="text-xs">
                      {field.field_name} {field.is_required && <span className="text-destructive">*</span>}
                    </Label>
                    {field.field_type === "select" ? (
                      <Select
                        value={customResponses[field.id] || ""}
                        onValueChange={(val) => setCustomResponses((prev) => ({ ...prev, [field.id]: val }))}
                      >
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {((field.options as any)?.choices || []).map((opt: string) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={field.field_type === "number" ? "number" : "text"}
                        value={customResponses[field.id] || ""}
                        onChange={(e) => setCustomResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={`Enter ${field.field_name.toLowerCase()}`}
                        className="rounded-xl"
                      />
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Payment status - only for paid non-free registrations */}
          {finalAmount > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Status</Label>
              <Select value={paymentStatus} onValueChange={(val) => setPaymentStatus(val as "success" | "pending")}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="success">Paid (Offline / Cash)</SelectItem>
                  <SelectItem value="pending">Pending Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            onClick={() => registerMutation.mutate()}
            disabled={registerMutation.isPending || !name.trim() || !phone || phone.length !== 10}
            className="w-full rounded-xl gap-2"
          >
            {registerMutation.isPending ? <ButtonSpinner /> : <UserPlus className="w-4 h-4" />}
            Register Member {finalAmount > 0 ? `• ₹${finalAmount}` : finalAmount === 0 && basePrice > 0 ? "• Free" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
