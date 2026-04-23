import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { logStaffActivity } from "@/hooks/useStaffActivityLog";
import { createEventRegistrationIncomeEntry } from "@/hooks/useLedger";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  const { isStaffLoggedIn, staffUser } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const [mode, setMode] = useState<"search" | "new">("search");
  const [memberSearch, setMemberSearch] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedPricingId, setSelectedPricingId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [customResponses, setCustomResponses] = useState<Record<string, string>>({});
  const [foundMember, setFoundMember] = useState<any>(null);
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"success" | "pending">("success");
  const [freeForExisting, setFreeForExisting] = useState(false);
  const [notifyMember, setNotifyMember] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  const isMultiSelect = event?.selection_mode === "multiple";
  const rawPricingOptions = event?.event_pricing_options || [];
  const customFields = event?.event_custom_fields || [];

  const { data: regCounts = {} } = useQuery({
    queryKey: ["event-reg-counts", event?.id],
    queryFn: async () => {
      if (isMultiSelect) {
        const { data: regs } = await supabase
          .from("event_registrations")
          .select("id")
          .eq("event_id", event.id)
          .eq("payment_status", "success");
        const regIds = (regs || []).map((r: any) => r.id);
        if (regIds.length === 0) return {};
        const { data: items } = await supabase
          .from("event_registration_items")
          .select("pricing_option_id")
          .in("registration_id", regIds);
        const countMap: Record<string, number> = {};
        (items || []).forEach((r: any) => {
          countMap[r.pricing_option_id] = (countMap[r.pricing_option_id] || 0) + 1;
        });
        return countMap;
      } else {
        const { data } = await supabase
          .from("event_registrations")
          .select("pricing_option_id")
          .eq("event_id", event.id)
          .eq("payment_status", "success");
        const countMap: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          countMap[r.pricing_option_id] = (countMap[r.pricing_option_id] || 0) + 1;
        });
        return countMap;
      }
    },
    enabled: !!event?.id && open,
  });

  const pricingOptions = useMemo(() =>
    rawPricingOptions
      .filter((p: any) => p.is_active !== false)
      .map((p: any) => ({ ...p, slots_filled: regCounts[p.id] || 0 })),
    [rawPricingOptions, regCounts]
  );

  useEffect(() => {
    if (open && pricingOptions.length > 0 && !selectedPricingId && !isMultiSelect) {
      setSelectedPricingId(pricingOptions[0].id);
    }
  }, [open, pricingOptions, isMultiSelect]);

  useEffect(() => {
    if (!open || mode !== "search") return;

    const searchValue = memberSearch.trim();

    if (searchValue.length < 2) {
      setMemberResults([]);
      setSearchDone(false);
      setIsSearchingMembers(false);
      if (!foundMember || memberSearch !== `${foundMember.name} • ${foundMember.phone}`) {
        setFoundMember(null);
      }
      return;
    }

    if (foundMember && searchValue === `${foundMember.name} • ${foundMember.phone}`) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      handleSearch(true);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [memberSearch, mode, open]);

  const selectedItems = useMemo(() => {
    if (isMultiSelect) {
      return pricingOptions.filter((p: any) => selectedItemIds.has(p.id));
    }
    const found = pricingOptions.find((p: any) => p.id === selectedPricingId);
    return found ? [found] : [];
  }, [isMultiSelect, selectedItemIds, selectedPricingId, pricingOptions]);

  const basePrice = useMemo(() =>
    selectedItems.reduce((sum: number, p: any) => sum + Number(p.price || 0), 0),
    [selectedItems]
  );

  useEffect(() => {
    if (appliedCoupon) {
      const newDiscount = calculateDiscount(appliedCoupon, basePrice);
      setAppliedCoupon(prev => prev ? { ...prev, discountAmount: newDiscount } : null);
    }
  }, [basePrice]);

  const calculateDiscount = (coupon: Omit<AppliedCoupon, 'discountAmount'>, bp: number): number => {
    if (bp <= 0) return 0;
    let discount = 0;
    if (coupon.discount_type === "percentage") {
      discount = (bp * coupon.discount_value) / 100;
      if (coupon.max_discount_cap && discount > coupon.max_discount_cap) discount = coupon.max_discount_cap;
    } else if (coupon.discount_type === "flat") {
      discount = coupon.discount_value;
    }
    return Math.min(discount, bp);
  };

  const isExistingMember = !!foundMember;
  const effectiveFree = freeForExisting && isExistingMember;
  const couponDiscount = effectiveFree ? 0 : (appliedCoupon?.discountAmount || 0);
  const finalAmount = effectiveFree ? 0 : Math.max(0, basePrice - couponDiscount);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setMemberSearch(""); setPhone(""); setName(""); setEmail("");
    setSelectedPricingId(pricingOptions[0]?.id || "");
    setSelectedItemIds(new Set());
    setCustomResponses({}); setFoundMember(null); setMemberResults([]); setIsSearchingMembers(false);
    setSearchDone(false); setMode("search");
    setPaymentStatus("success"); setFreeForExisting(false);
    setNotifyMember(false);
    setCouponCode(""); setAppliedCoupon(null); setCouponError("");
  };

  const formatEventDateTime = () => {
    if (!event?.event_date) return { dateLabel: "TBA", timeLabel: "TBA" };

    const start = new Date(event.event_date);
    const end = event.event_end_date ? new Date(event.event_end_date) : null;

    const dateLabel = start.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const startTime = start.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const endTime = end
      ? end.toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : null;

    return {
      dateLabel,
      timeLabel: endTime ? `${startTime} – ${endTime}` : startTime,
    };
  };

  const buildRegistrationWhatsAppMessage = (effectivePaymentStatus: "success" | "pending", amountToPay: number) => {
    const { dateLabel, timeLabel } = formatEventDateTime();
    const selectedItemLabel = selectedItems.length > 0
      ? selectedItems.map((item: any) => `${item.name}${Number(item.price) > 0 ? ` — ₹${item.price}` : " — Free"}`).join("\n• ")
      : "General Admission";

    const locationLine = event?.location ? `📍 *Location:* ${event.location}\n` : "";
    const paymentLine = effectivePaymentStatus === "success"
      ? `💰 *Amount Paid:* ${amountToPay === 0 ? "Free" : `₹${amountToPay}`}\n✅ *Status:* Confirmed`
      : `💰 *Amount Due:* ₹${amountToPay}\n⏳ *Status:* Registration saved, payment pending`;

    return [
      `🎉 *Event Registration ${effectivePaymentStatus === "success" ? "Confirmed" : "Created"}!*`,
      ``,
      `Hi ${name.trim()}, 👋`,
      ``,
      `You have been registered for *${event?.title || "this event"}*.`,
      ``,
      `📅 *Date:* ${dateLabel}`,
      `🕐 *Time:* ${timeLabel}`,
      `${locationLine}`.trimEnd(),
      `🎫 *Selected Option${selectedItems.length > 1 ? "s" : ""}:*`,
      `• ${selectedItemLabel}`,
      ``,
      paymentLine,
      ``,
      `Please keep this message for your reference.`,
    ].filter(Boolean).join("\n");
  };

  const handleSearch = async (silent = false) => {
    const searchValue = memberSearch.trim();
    if (searchValue.length < 2) {
      if (!silent) toast.error("Enter at least 2 characters to search");
      return;
    }

    setIsSearchingMembers(true);
    setSearchDone(false);
    setFoundMember(null);
    setMemberResults([]);
    setFreeForExisting(false);

    try {
      const normalizedDigits = searchValue.replace(/\D/g, "").slice(0, 10);
      let query = supabase
        .from("members")
        .select("id, name, email, phone")
        .eq("branch_id", event.branch_id)
        .limit(8);

      query = normalizedDigits.length >= 2
        ? query.or(`name.ilike.%${searchValue}%,phone.ilike.%${normalizedDigits}%`)
        : query.ilike("name", `%${searchValue}%`);

      const { data: members, error } = await query.order("name", { ascending: true });
      if (error) throw error;

      const results = members || [];
      setMemberResults(results);

      if (results.length === 0) {
        setPhone(normalizedDigits);
        setName("");
        setEmail("");
      }

      setSearchDone(true);
    } catch (err: any) {
      if (!silent) {
        toast.error("Member search failed", { description: err.message });
      }
    } finally {
      setIsSearchingMembers(false);
    }
  };

  const handleSelectMember = async (member: any) => {
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id")
      .eq("event_id", event.id)
      .eq("phone", member.phone)
      .eq("payment_status", "success")
      .maybeSingle();

    if (existing) {
      toast.error("This member is already registered for this event");
      return;
    }

    setFoundMember(member);
    setPhone(member.phone || "");
    setName(member.name || "");
    setEmail(member.email || "");
    setMemberSearch(`${member.name} • ${member.phone}`);
    setMemberResults([]);
    setSearchDone(true);
  };

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError("Enter a coupon code"); return; }
    setCouponLoading(true); setCouponError("");
    try {
      const { data: coupon, error } = await supabase.from("coupons").select("*").eq("code", code).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!coupon) { setCouponError("Invalid coupon code"); return; }
      const applicableOn = coupon.applicable_on as any;
      if (!applicableOn?.event) { setCouponError("This coupon is not valid for events"); return; }
      const today = new Date().toISOString().split("T")[0];
      if (coupon.start_date > today) { setCouponError("Coupon is not yet active"); return; }
      if (coupon.end_date && coupon.end_date < today) { setCouponError("Coupon has expired"); return; }
      if (coupon.total_usage_limit && coupon.usage_count >= coupon.total_usage_limit) { setCouponError("Coupon usage limit reached"); return; }
      if (coupon.branch_id && coupon.branch_id !== event.branch_id) { setCouponError("Coupon not valid for this branch"); return; }
      const discountAmount = calculateDiscount(coupon, basePrice);
      setAppliedCoupon({ id: coupon.id, code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value, max_discount_cap: coupon.max_discount_cap, discountAmount });
    } catch (err: any) { setCouponError(err.message || "Failed to validate coupon"); }
    finally { setCouponLoading(false); }
  };

  const removeCoupon = () => { setAppliedCoupon(null); setCouponCode(""); setCouponError(""); };

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      if (!phone || phone.length !== 10) throw new Error("Valid phone number is required");
      if (isMultiSelect && selectedItemIds.size === 0) throw new Error("Select at least one item");
      if (!isMultiSelect && !selectedPricingId) throw new Error("Select a pricing option");

      const { data: existingReg } = await supabase
        .from("event_registrations").select("id")
        .eq("event_id", event.id).eq("phone", phone).eq("payment_status", "success").maybeSingle();
      if (existingReg) throw new Error("This phone number is already registered for this event");

      // Check capacity for selected items
      for (const item of selectedItems) {
        if (item.capacity_limit) {
          const spotsLeft = item.capacity_limit - (item.slots_filled || 0);
          if (spotsLeft <= 0) throw new Error(`"${item.name}" is fully booked!`);
        }
      }

      for (const field of customFields) {
        if (field.is_required && !customResponses[field.id]) throw new Error(`${field.field_name} is required`);
      }

      const amountToPay = finalAmount;
      const effectivePaymentStatus = amountToPay === 0 ? "success" : paymentStatus;

      const { data: reg, error } = await supabase.from("event_registrations").insert({
        event_id: event.id,
        pricing_option_id: isMultiSelect ? null : selectedPricingId,
        member_id: foundMember?.id || null,
        name: name.trim(),
        phone,
        email: email.trim() || null,
        amount_paid: effectivePaymentStatus === "success" ? amountToPay : 0,
        payment_status: effectivePaymentStatus,
        custom_field_responses: Object.keys(customResponses).length > 0 ? customResponses : null,
      }).select("id").single();
      if (error) throw error;

      // Insert registration items for multi-select
      if (isMultiSelect && selectedItems.length > 0) {
        const items = selectedItems.map((p: any) => ({
          registration_id: reg.id,
          pricing_option_id: p.id,
          amount_paid: Number(p.price || 0),
        }));
        await supabase.from("event_registration_items").insert(items);
      }

      if (appliedCoupon && !effectiveFree) {
        try {
          await supabase.from("coupons")
            .update({ usage_count: (appliedCoupon as any).usage_count ? (appliedCoupon as any).usage_count + 1 : 1 })
            .eq("id", appliedCoupon.id);
        } catch { /* non-critical */ }
      }

      // Ledger: record event registration income (only when payment is recorded as success)
      if (effectivePaymentStatus === "success" && amountToPay > 0) {
        try {
          await createEventRegistrationIncomeEntry({
            amount: amountToPay,
            eventTitle: event.title,
            registrantName: name.trim(),
            memberId: foundMember?.id || undefined,
            branchId: event.branch_id,
          });
        } catch (ledgerErr) {
          console.error("Ledger entry (event registration) failed:", ledgerErr);
        }

        // Record the cash payment so it appears in the Payments tab
        try {
          const { data: payRow } = await supabase.from("payments").insert({
            member_id: foundMember?.id || null,
            amount: amountToPay,
            payment_mode: "cash",
            status: "success",
            payment_type: "event_registration",
            branch_id: event.branch_id,
            notes: `Event registration cash payment via admin — ${event.title} (${name.trim()})`,
          }).select("id").single();

          if (payRow?.id) {
            await supabase.from("event_registrations")
              .update({ payment_id: payRow.id })
              .eq("id", reg.id);
          }
        } catch (payErr) {
          console.error("Payment record (event registration) failed:", payErr);
        }
      }

      let notifyFailed = false;
      if (notifyMember) {
        try {
          const customMessage = buildRegistrationWhatsAppMessage(effectivePaymentStatus, amountToPay);
          const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp", {
            body: {
              type: "custom",
              isManual: true,
              branchId: event.branch_id,
              phone,
              name: name.trim(),
              memberIds: foundMember?.id ? [foundMember.id] : undefined,
              customMessage,
            },
          });

          if (whatsappError) throw whatsappError;
        } catch (whatsappErr) {
          notifyFailed = true;
          console.error("Admin event registration WhatsApp failed:", whatsappErr);
        }
      }

      return { notifyFailed, notifyAttempted: notifyMember };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["event-registrations", event.id] });
      queryClient.invalidateQueries({ queryKey: ["event-reg-counts", event.id] });
      queryClient.invalidateQueries({ queryKey: ["event-detail", event.id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Member registered successfully!");
      if (result?.notifyAttempted) {
        if (result.notifyFailed) {
          toast.error("Registration saved, but WhatsApp notification failed");
        } else {
          toast.success("WhatsApp notification sent");
        }
      }

      const desc = `${isStaffLoggedIn ? `Staff "${staffUser?.fullName}"` : "Admin"} registered "${name}" for event "${event.title}"`;
      if (isStaffLoggedIn && staffUser) {
        logStaffActivity({
          category: "events", type: "event_registration_added", description: desc,
          entityType: "event_registrations", entityName: name,
          newValue: { name, phone, event_title: event.title, amount: finalAmount },
          branchId: event.branch_id, staffId: staffUser.id, staffName: staffUser.fullName, staffPhone: staffUser.phone,
        });
      } else if (isAdmin) {
        logAdminActivity({
          category: "events", type: "event_registration_added", description: desc,
          entityType: "event_registrations", entityName: name,
          newValue: { name, phone, event_title: event.title, amount: finalAmount },
          branchId: event.branch_id,
        });
      }

      resetForm();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Registration failed", { description: err.message }),
  });

  const handleClose = (val: boolean) => { if (!val) resetForm(); onOpenChange(val); };

  const renderPricingSelection = () => {
    if (isMultiSelect) {
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Select Items * <span className="text-muted-foreground">(multiple)</span></Label>
          <div className="grid gap-2">
            {pricingOptions.map((p: any) => {
              const spotsLeft = p.capacity_limit ? p.capacity_limit - (p.slots_filled || 0) : null;
              const isFull = spotsLeft !== null && spotsLeft <= 0;
              const isSelected = selectedItemIds.has(p.id);
              return (
                <button
                  key={p.id}
                  disabled={isFull}
                  onClick={() => toggleItemSelection(p.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                    isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/30",
                    isFull && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Checkbox checked={isSelected} disabled={isFull} className="flex-shrink-0" />
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{p.name}</span>
                      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                      {spotsLeft !== null && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({isFull ? "Full" : `${spotsLeft} spots left`})
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      {Number(p.price) === 0 ? "Free" : `₹${p.price}`}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedItems.length > 0 && (
            <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/20 text-xs space-y-1">
              {selectedItems.map((p: any) => (
                <div key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="font-medium">{Number(p.price) === 0 ? "Free" : `₹${p.price}`}</span>
                </div>
              ))}
              <div className="border-t border-primary/20 pt-1 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary">{basePrice === 0 ? "Free" : `₹${basePrice}`}</span>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
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
                  selectedPricingId === p.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/30",
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
    );
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
            <Button size="sm" variant={mode === "search" ? "default" : "outline"} className="flex-1 rounded-xl text-xs"
              onClick={() => { setMode("search"); resetForm(); }}>
              <Search className="w-3.5 h-3.5 mr-1.5" /> Search Existing
            </Button>
            <Button size="sm" variant={mode === "new" ? "default" : "outline"} className="flex-1 rounded-xl text-xs"
              onClick={() => { setMode("new"); setFoundMember(null); setSearchDone(false); setFreeForExisting(false); }}>
              <UserPlus className="w-3.5 h-3.5 mr-1.5" /> New Person
            </Button>
          </div>

          {/* Search mode */}
          {mode === "search" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Search Member</Label>
                <div className="flex gap-2">
                  <Input
                    value={memberSearch}
                    onChange={(e) => {
                      setMemberSearch(e.target.value);
                      setSearchDone(false);
                      setFoundMember(null);
                      setMemberResults([]);
                      setFreeForExisting(false);
                    }}
                    placeholder="Search by member name or phone"
                    className="rounded-xl"
                  />
                  <Button
                    size="sm"
                    onClick={handleSearch}
                    disabled={isSearchingMembers || memberSearch.trim().length < 2}
                    className="rounded-xl"
                  >
                    {isSearchingMembers ? <ButtonSpinner /> : "Search"}
                  </Button>
                </div>
              </div>
              {memberResults.length > 0 && !foundMember && (
                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-2">
                  {memberResults.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => handleSelectMember(member)}
                      className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">+91 {member.phone}{member.email ? ` • ${member.email}` : ""}</p>
                      </div>
                      <span className="text-xs font-medium text-primary">Select</span>
                    </button>
                  ))}
                </div>
              )}
              {searchDone && foundMember && (
                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">Member Found</span>
                  </div>
                  <p className="text-sm text-foreground">{foundMember.name}</p>
                  <p className="text-xs text-muted-foreground">+91 {foundMember.phone}</p>
                  {foundMember.email && <p className="text-xs text-muted-foreground">{foundMember.email}</p>}
                </div>
              )}
              {searchDone && !foundMember && memberResults.length === 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-700 dark:text-amber-400">No member found. Fill in details below:</p>
                </div>
              )}
            </div>
          )}

          {/* Name & Email */}
          {(mode === "new" || (searchDone && !foundMember)) && (
            <div className="space-y-3">
              {mode === "new" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone Number *</Label>
                  <div className="flex gap-2">
                    <span className="flex items-center px-3 bg-muted rounded-l-xl text-sm text-muted-foreground">+91</span>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Enter 10-digit number" className="rounded-r-xl rounded-l-none" maxLength={10} inputMode="numeric" />
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
          {pricingOptions.length > 0 && renderPricingSelection()}

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
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={removeCoupon}><X className="w-3.5 h-3.5" /></Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input value={couponCode} onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                    placeholder="Enter coupon code" className="rounded-xl font-mono text-sm" />
                  <Button size="sm" variant="outline" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()} className="rounded-xl px-4">
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
              {customFields.sort((a: any, b: any) => a.sort_order - b.sort_order).map((field: any) => (
                <div key={field.id} className="space-y-1.5">
                  <Label className="text-xs">
                    {field.field_name} {field.is_required && <span className="text-destructive">*</span>}
                  </Label>
                  {field.field_type === "select" ? (
                    <Select value={customResponses[field.id] || ""} onValueChange={(val) => setCustomResponses(prev => ({ ...prev, [field.id]: val }))}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {((field.options as any)?.choices || (Array.isArray(field.options) ? field.options : [])).map((opt: string) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type={field.field_type === "number" ? "number" : "text"} value={customResponses[field.id] || ""}
                      onChange={(e) => setCustomResponses(prev => ({ ...prev, [field.id]: e.target.value }))}
                      placeholder={`Enter ${field.field_name.toLowerCase()}`} className="rounded-xl" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Payment status */}
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

          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Notify Member</p>
              <p className="text-xs text-muted-foreground">Send event registration details on WhatsApp after saving</p>
            </div>
            <Switch checked={notifyMember} onCheckedChange={setNotifyMember} />
          </div>

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
