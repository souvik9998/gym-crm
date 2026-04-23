import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { useBranch } from "@/contexts/BranchContext";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { logStaffActivity } from "@/hooks/useStaffActivityLog";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  Plus, Search, Pencil, Trash2, Copy, TicketPercent,
  AlertTriangle, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount_cap: number | null;
  min_order_value: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  total_usage_limit: number | null;
  per_user_limit: number;
  usage_count: number;
  applicable_on: any;
  applicable_plan_ids: string[] | null;
  applicable_branch_ids: string[] | null;
  first_time_only: boolean;
  existing_members_only: boolean;
  expired_members_only: boolean;
  specific_member_ids: string[] | null;
  stackable: boolean;
  auto_apply: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  tenant_id: string | null;
  branch_id: string | null;
}

type CouponForm = {
  code: string;
  discount_type: string;
  discount_value: string;
  max_discount_cap: string;
  min_order_value: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  total_usage_limit: string;
  per_user_limit: string;
  coupon_target: "new_registration" | "renewal" | "event" | "pt_renewal";
  first_time_only: boolean;
  existing_members_only: boolean;
  expired_members_only: boolean;
  notes: string;
};

const defaultForm: CouponForm = {
  code: "",
  discount_type: "percentage",
  discount_value: "",
  max_discount_cap: "",
  min_order_value: "",
  start_date: new Date().toISOString().split("T")[0],
  end_date: "",
  is_active: true,
  total_usage_limit: "",
  per_user_limit: "1",
  coupon_target: "new_registration",
  first_time_only: false,
  existing_members_only: false,
  expired_members_only: false,
  notes: "",
};

const couponFormSchema = z.object({
  code: z.string().trim().min(1, "Coupon code is required").max(32, "Coupon code is too long").regex(/^[A-Z0-9_-]+$/, "Coupon code can only use letters, numbers, hyphens, and underscores"),
  discount_type: z.enum(["percentage", "flat", "free_days"]),
  discount_value: z.coerce.number().positive("Discount value must be positive"),
  max_discount_cap: z.union([z.literal(""), z.coerce.number().positive("Max discount cap must be positive")]),
  min_order_value: z.union([z.literal(""), z.coerce.number().min(0, "Minimum order value cannot be negative")]),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().optional(),
  total_usage_limit: z.union([z.literal(""), z.coerce.number().int().positive("Total usage limit must be positive")]),
  per_user_limit: z.coerce.number().int().positive("Per user limit must be at least 1"),
  coupon_target: z.enum(["new_registration", "renewal", "event", "pt_renewal"]),
  first_time_only: z.boolean(),
  existing_members_only: z.boolean(),
  expired_members_only: z.boolean(),
  is_active: z.boolean(),
  notes: z.string().max(500, "Notes must be 500 characters or fewer"),
}).superRefine((data, ctx) => {
  if (data.discount_type === "percentage" && data.discount_value > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discount_value"], message: "Percentage cannot exceed 100%" });
  }

  if (data.end_date && data.end_date < data.start_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "End date cannot be before start date" });
  }

  if (data.coupon_target === "new_registration") {
    if (data.existing_members_only || data.expired_members_only) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["coupon_target"], message: "Registration coupons cannot be restricted to existing or expired members" });
    }
  }

  if (data.coupon_target === "event") {
    if (data.first_time_only || data.existing_members_only || data.expired_members_only) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["coupon_target"], message: "Event coupons do not support member-condition filters" });
    }
  }

  if ((data.coupon_target === "renewal" || data.coupon_target === "pt_renewal") && data.first_time_only) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["first_time_only"], message: "Renewal coupons cannot be limited to first-time users" });
  }
});

const couponTargetOptions = [
  { value: "new_registration", label: "New Registration", description: "For brand-new member signups" },
  { value: "renewal", label: "Membership Renewal", description: "For gym membership renewals only" },
  { value: "event", label: "Event Registration", description: "For paid event bookings only" },
  { value: "pt_renewal", label: "PT Renewal", description: "For personal training renewals only" },
] as const;

const getApplicableOnFromTarget = (target: CouponForm["coupon_target"]) => ({
  new_registration: target === "new_registration",
  renewal: target === "renewal",
  event: target === "event",
  pt_renewal: target === "pt_renewal",
});

const getCouponTarget = (applicableOn: any): CouponForm["coupon_target"] => {
  if (applicableOn?.pt_renewal) return "pt_renewal";
  if (applicableOn?.event) return "event";
  if (applicableOn?.renewal) return "renewal";
  return "new_registration";
};

const getCouponTargetLabel = (target: CouponForm["coupon_target"]) => {
  return couponTargetOptions.find((option) => option.value === target)?.label || "New Registration";
};

const generateCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

export const CouponsDiscountsTab = () => {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, staffUser } = useStaffAuth();

  const logCouponActivity = async (params: Parameters<typeof logAdminActivity>[0]) => {
    if (isStaffLoggedIn && staffUser) {
      await logStaffActivity({
        ...params,
        category: "settings",
        type: params.type as any,
        description: `Staff "${staffUser.fullName}" — ${params.description}`,
        staffId: staffUser.id,
        staffName: staffUser.fullName,
        staffPhone: staffUser.phone,
      });
    } else {
      await logAdminActivity(params);
    }
  };

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState<CouponForm>(defaultForm);
  const selectedTargetMeta = useMemo(
    () => couponTargetOptions.find((option) => option.value === form.coupon_target) ?? couponTargetOptions[0],
    [form.coupon_target]
  );
  const showFirstTimeCondition = form.coupon_target === "new_registration";
  const showExistingCondition = form.coupon_target === "renewal" || form.coupon_target === "pt_renewal";
  const showExpiredCondition = form.coupon_target === "renewal" || form.coupon_target === "pt_renewal";

  const fetchCoupons = useCallback(async () => {
    if (!currentBranch) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .or(`branch_id.eq.${currentBranch.id},branch_id.is.null`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCoupons(data || []);
    } catch (err: any) {
      toast.error("Failed to load coupons", { description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [currentBranch]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const getCouponStatus = (c: Coupon): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
    if (!c.is_active) return { label: "Disabled", variant: "secondary" };
    const today = new Date().toISOString().split("T")[0];
    if (c.start_date > today) return { label: "Scheduled", variant: "outline" };
    if (c.end_date && c.end_date < today) return { label: "Expired", variant: "destructive" };
    if (c.total_usage_limit && c.usage_count >= c.total_usage_limit) return { label: "Exhausted", variant: "destructive" };
    return { label: "Active", variant: "default" };
  };

  const filteredCoupons = coupons.filter(c => {
    if (searchQuery && !c.code.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter !== "all") {
      const status = getCouponStatus(c).label.toLowerCase();
      if (statusFilter === "active" && status !== "active") return false;
      if (statusFilter === "expired" && status !== "expired" && status !== "exhausted") return false;
      if (statusFilter === "disabled" && status !== "disabled") return false;
      if (statusFilter === "scheduled" && status !== "scheduled") return false;
    }
    return true;
  });

  const openEditForm = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      max_discount_cap: coupon.max_discount_cap ? String(coupon.max_discount_cap) : "",
      min_order_value: coupon.min_order_value ? String(coupon.min_order_value) : "",
      start_date: coupon.start_date,
      end_date: coupon.end_date || "",
      is_active: coupon.is_active,
      total_usage_limit: coupon.total_usage_limit ? String(coupon.total_usage_limit) : "",
      per_user_limit: String(coupon.per_user_limit),
      coupon_target: getCouponTarget(coupon.applicable_on),
      first_time_only: coupon.first_time_only,
      existing_members_only: coupon.existing_members_only,
      expired_members_only: coupon.expired_members_only,
      notes: coupon.notes || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!currentBranch) return;

    setIsSaving(true);
    try {
      const normalizedForm = {
        ...form,
        code: form.code.toUpperCase().trim(),
        notes: form.notes.trim(),
        first_time_only: showFirstTimeCondition ? form.first_time_only : false,
        existing_members_only: showExistingCondition ? form.existing_members_only : false,
        expired_members_only: showExpiredCondition ? form.expired_members_only : false,
      };

      const parsed = couponFormSchema.safeParse(normalizedForm);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message || "Please check the coupon details");
        return;
      }

      // Get tenant_id from branch
      const { data: branchData } = await supabase
        .from("branches")
        .select("tenant_id")
        .eq("id", currentBranch.id)
        .single();

      const payload = {
        code: parsed.data.code,
        discount_type: parsed.data.discount_type,
        discount_value: parsed.data.discount_value,
        max_discount_cap: parsed.data.max_discount_cap === "" ? null : parsed.data.max_discount_cap,
        min_order_value: parsed.data.min_order_value === "" ? 0 : parsed.data.min_order_value,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date || null,
        is_active: parsed.data.is_active,
        total_usage_limit: parsed.data.total_usage_limit === "" ? null : parsed.data.total_usage_limit,
        per_user_limit: parsed.data.per_user_limit,
        applicable_on: getApplicableOnFromTarget(parsed.data.coupon_target),
        first_time_only: parsed.data.first_time_only,
        existing_members_only: parsed.data.existing_members_only,
        expired_members_only: parsed.data.expired_members_only,
        stackable: false,
        auto_apply: false,
        notes: parsed.data.notes || null,
        branch_id: currentBranch.id,
        tenant_id: branchData?.tenant_id || null,
      };

      if (editingId) {
        const { error } = await supabase.from("coupons").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Coupon updated");
        await logCouponActivity({
          category: "settings", type: "coupon_updated",
          description: `Updated coupon ${payload.code}`,
          entityType: "coupon", entityId: editingId,
          entityName: payload.code, branchId: currentBranch.id,
        });
      } else {
        const { error } = await supabase.from("coupons").insert({ ...payload, created_by: "Admin" });
        if (error) {
          if (error.message.includes("duplicate") || error.message.includes("unique")) {
            toast.error("Coupon code already exists");
            return;
          }
          throw error;
        }
        toast.success("Coupon created");
        await logCouponActivity({
          category: "settings", type: "coupon_created",
          description: `Created coupon ${payload.code}`,
          entityType: "coupon", entityName: payload.code, branchId: currentBranch.id,
        });
      }

      setShowForm(false);
      setEditingId(null);
      setForm(defaultForm);
      fetchCoupons();
    } catch (err: any) {
      toast.error("Error saving coupon", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    setTogglingId(coupon.id);
    try {
      const { error } = await supabase.from("coupons").update({ is_active: !coupon.is_active }).eq("id", coupon.id);
      if (error) throw error;
      setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c));
      toast.success(coupon.is_active ? "Coupon disabled" : "Coupon enabled");
      await logCouponActivity({
        category: "settings", type: "coupon_updated",
        description: `${coupon.is_active ? "Disabled" : "Enabled"} coupon ${coupon.code}`,
        entityType: "coupon", entityId: coupon.id,
        entityName: coupon.code,
        oldValue: { is_active: coupon.is_active },
        newValue: { is_active: !coupon.is_active },
        branchId: currentBranch?.id,
      });
    } catch (err: any) {
      toast.error("Error", { description: err.message });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      const couponToDelete = coupons.find(c => c.id === id);
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
      setCoupons(prev => prev.filter(c => c.id !== id));
      toast.success("Coupon deleted");
      await logCouponActivity({
        category: "settings", type: "coupon_deleted",
        description: `Deleted coupon ${couponToDelete?.code || id}`,
        entityType: "coupon", entityId: id,
        entityName: couponToDelete?.code,
        branchId: currentBranch?.id,
      });
    } catch (err: any) {
      toast.error("Error deleting", { description: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  const discountLabel = (c: Coupon) => {
    if (c.discount_type === "percentage") return `${c.discount_value}%${c.max_discount_cap ? ` (max ₹${c.max_discount_cap})` : ""}`;
    if (c.discount_type === "flat") return `₹${c.discount_value}`;
    return `${c.discount_value} Free Days`;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <Card className="border border-border/40 shadow-sm">
        <CardHeader className="p-4 lg:p-6 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-accent/10 text-accent">
                <TicketPercent className="w-4 h-4 lg:w-5 lg:h-5" />
              </div>
              <div>
                <CardTitle className="text-base lg:text-xl">Coupons & Discounts</CardTitle>
                <CardDescription className="text-xs lg:text-sm">Create and manage coupon codes for memberships</CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => { setShowForm(true); setEditingId(null); setForm(defaultForm); }}
              className="rounded-xl gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Coupon</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search coupon code..."
                className="pl-9 h-9 text-sm rounded-lg"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9 text-sm rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      {showForm && (
        <Card className="border-2 border-accent/30 shadow-md animate-in slide-in-from-top-2 duration-300">
          <CardHeader className="p-4 lg:p-6 pb-3">
            <CardTitle className="text-base lg:text-lg">{editingId ? "Edit Coupon" : "Create New Coupon"}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 lg:p-6 pt-0 space-y-4">
            {/* Code & Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Coupon Code *</Label>
                <div className="flex gap-1.5">
                  <Input
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, "") }))}
                    placeholder="WELCOME20"
                    className="h-9 text-sm font-mono flex-1"
                  />
                  <Button variant="outline" size="sm" className="h-9 px-2" onClick={() => setForm(f => ({ ...f, code: generateCode() }))} title="Auto-generate">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Discount Type *</Label>
                <Select value={form.discount_type} onValueChange={v => setForm(f => ({ ...f, discount_type: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat Amount (₹)</SelectItem>
                    <SelectItem value="free_days">Free Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {form.discount_type === "percentage" ? "Percentage *" : form.discount_type === "flat" ? "Amount (₹) *" : "Free Days *"}
                </Label>
                <Input
                  type="number"
                  value={form.discount_value}
                  onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                  placeholder={form.discount_type === "percentage" ? "20" : form.discount_type === "flat" ? "500" : "7"}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Caps & Minimum */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {form.discount_type === "percentage" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Max Discount Cap (₹)</Label>
                  <Input
                    type="number"
                    value={form.max_discount_cap}
                    onChange={e => setForm(f => ({ ...f, max_discount_cap: e.target.value }))}
                    placeholder="e.g. 500"
                    className="h-9 text-sm"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Minimum Order Value (₹)</Label>
                <Input
                  type="number"
                  value={form.min_order_value}
                  onChange={e => setForm(f => ({ ...f, min_order_value: e.target.value }))}
                  placeholder="e.g. 1000"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Validity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Start Date *</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">End Date (optional)</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>

            {/* Usage Limits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Total Usage Limit (empty = unlimited)</Label>
                <Input type="number" value={form.total_usage_limit} onChange={e => setForm(f => ({ ...f, total_usage_limit: e.target.value }))} placeholder="e.g. 100" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Per User Limit</Label>
                <Input type="number" value={form.per_user_limit} onChange={e => setForm(f => ({ ...f, per_user_limit: e.target.value }))} placeholder="1" className="h-9 text-sm" />
              </div>
            </div>

            {/* Applicability */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coupon Type</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {couponTargetOptions.map((option) => {
                  const isSelected = form.coupon_target === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        coupon_target: option.value,
                        first_time_only: option.value === "new_registration" ? f.first_time_only : false,
                        existing_members_only: option.value === "renewal" || option.value === "pt_renewal" ? f.existing_members_only : false,
                        expired_members_only: option.value === "renewal" || option.value === "pt_renewal" ? f.expired_members_only : false,
                      }))}
                      className={`rounded-xl border px-3 py-3 text-left transition-all ${isSelected ? "border-accent bg-accent/10 shadow-sm" : "border-border bg-background hover:border-accent/40"}`}
                    >
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* User Conditions */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">User Conditions</Label>
              <div className="flex flex-wrap gap-4">
                {showFirstTimeCondition && (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.first_time_only} onCheckedChange={v => setForm(f => ({ ...f, first_time_only: v }))} />
                    First-time users only
                  </label>
                )}
                {showExistingCondition && (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.existing_members_only} onCheckedChange={v => setForm(f => ({ ...f, existing_members_only: v }))} />
                    Existing members only
                  </label>
                )}
                {showExpiredCondition && (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.expired_members_only} onCheckedChange={v => setForm(f => ({ ...f, expired_members_only: v }))} />
                    Expired members only
                  </label>
                )}
              </div>
              {!showFirstTimeCondition && !showExistingCondition && !showExpiredCondition ? (
                <p className="text-[11px] text-muted-foreground">No extra user conditions apply to {selectedTargetMeta.label.toLowerCase()} coupons.</p>
              ) : (form.first_time_only || form.existing_members_only || form.expired_members_only) && (
                <p className="text-[11px] text-muted-foreground italic pl-1">
                  💡 If multiple conditions are enabled, the coupon applies to members matching <strong>any one</strong> of them.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</Label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                Enabled
              </label>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Internal Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Admin-only notes..." className="text-sm min-h-[60px]" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving} className="flex-1 rounded-xl">
                {isSaving ? <><ButtonSpinner /> Saving...</> : editingId ? "Update Coupon" : "Create Coupon"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-xl">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coupon List */}
      {filteredCoupons.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <TicketPercent className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">{coupons.length === 0 ? "No coupons created yet" : "No coupons match your filters"}</p>
          <p className="text-xs mt-1">
            {coupons.length === 0 ? "Create your first coupon to offer discounts to members" : "Try adjusting your search or filter"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCoupons.map(coupon => {
            const status = getCouponStatus(coupon);
            const isExpanded = expandedId === coupon.id;
            return (
              <Card key={coupon.id} className="border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-3 lg:p-4">
                  {/* Delete confirm inline */}
                  {confirmDeleteId === coupon.id && (
                    <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 mb-3 animate-in fade-in duration-200">
                      <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                      <span className="text-xs text-destructive font-medium flex-1">Delete coupon "{coupon.code}"?</span>
                      <Button size="sm" variant="destructive" className="h-6 text-xs px-2 rounded-md" onClick={() => handleDelete(coupon.id)} disabled={deletingId === coupon.id}>
                        {deletingId === coupon.id ? <ButtonSpinner /> : "Delete"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 rounded-md" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 flex-shrink-0">
                        <TicketPercent className="w-4 h-4 text-accent" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold font-mono tracking-wider">{coupon.code}</span>
                          <Badge variant={status.variant} className="text-[10px] px-1.5 py-0">{status.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {discountLabel(coupon)} • Used {coupon.usage_count}{coupon.total_usage_limit ? `/${coupon.total_usage_limit}` : ""} times
                          {coupon.end_date ? ` • Expires ${format(new Date(coupon.end_date), "d MMM yyyy")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Switch
                        checked={coupon.is_active}
                        onCheckedChange={() => handleToggle(coupon)}
                        disabled={togglingId === coupon.id}
                        className="scale-75"
                      />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { navigator.clipboard.writeText(coupon.code); toast.success("Code copied!"); }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditForm(coupon)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteId(confirmDeleteId === coupon.id ? null : coupon.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <button onClick={() => setExpandedId(isExpanded ? null : coupon.id)} className="p-1">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/40 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-0.5">Type</p>
                        <p className="font-medium capitalize">{coupon.discount_type.replace("_", " ")}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-0.5">Min Order</p>
                        <p className="font-medium">{coupon.min_order_value ? `₹${coupon.min_order_value}` : "None"}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-0.5">Per User</p>
                        <p className="font-medium">{coupon.per_user_limit}x</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-0.5">Applies To</p>
                        <p className="font-medium">
                          {[coupon.applicable_on?.new_registration && "Registration", coupon.applicable_on?.renewal && "Renewal", coupon.applicable_on?.event && "Event"].filter(Boolean).join(", ") || "All"}
                        </p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-0.5">Conditions</p>
                        <p className="font-medium">
                          {[coupon.first_time_only && "First-time", coupon.existing_members_only && "Existing", coupon.expired_members_only && "Expired"].filter(Boolean).join(", ") || "None"}
                        </p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-0.5">Validity</p>
                        <p className="font-medium">{format(new Date(coupon.start_date), "d MMM")} — {coupon.end_date ? format(new Date(coupon.end_date), "d MMM yyyy") : "No end"}</p>
                      </div>
                      {coupon.notes && (
                        <div className="bg-muted/30 rounded-lg p-2 col-span-full">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-0.5">Notes</p>
                          <p className="font-medium">{coupon.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};