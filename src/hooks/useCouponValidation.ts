/**
 * Coupon validation hook for registration and payment flows
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ValidatedCoupon {
  id: string;
  code: string;
  discount_type: string; // 'percentage' | 'flat' | 'free_days'
  discount_value: number;
  max_discount_cap: number | null;
  min_order_value: number | null;
  applicable_on: Record<string, boolean>;
  first_time_only: boolean;
  existing_members_only: boolean;
  expired_members_only: boolean;
  per_user_limit: number;
  total_usage_limit: number | null;
  usage_count: number;
  applicable_plan_ids: string[] | null;
  applicable_branch_ids: string[] | null;
  specific_member_ids: string[] | null;
}

export interface CouponDiscount {
  coupon: ValidatedCoupon;
  discountAmount: number;
  freeDays: number;
}

export type CouponContext = "new_registration" | "renewal" | "event" | "pt_renewal";

interface UseCouponValidationProps {
  branchId?: string;
  isNewMember: boolean;
  memberId?: string;
  subtotal: number;
  /**
   * Context the coupon is being applied in. Defaults are inferred from
   * `isNewMember` for backward compatibility:
   *   - true  → "new_registration"
   *   - false → "renewal"
   * Pass "event" or "pt_renewal" explicitly when needed.
   */
  context?: CouponContext;
}

export function useCouponValidation({ branchId, isNewMember, memberId, subtotal, context }: UseCouponValidationProps) {
  const effectiveContext: CouponContext =
    context ?? (isNewMember ? "new_registration" : "renewal");
  const [couponCode, setCouponCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponDiscount | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const calculateDiscount = useCallback((coupon: ValidatedCoupon, amount: number): { discountAmount: number; freeDays: number } => {
    if (coupon.discount_type === "free_days") {
      return { discountAmount: 0, freeDays: coupon.discount_value };
    }

    if (coupon.discount_type === "percentage") {
      let discount = Math.round((amount * coupon.discount_value) / 100);
      if (coupon.max_discount_cap && discount > coupon.max_discount_cap) {
        discount = coupon.max_discount_cap;
      }
      return { discountAmount: discount, freeDays: 0 };
    }

    // flat
    return { discountAmount: Math.min(coupon.discount_value, amount), freeDays: 0 };
  }, []);

  const validateCoupon = useCallback(async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponError("Enter a coupon code");
      return;
    }

    setIsValidating(true);
    setCouponError(null);

    try {
      // Fetch coupon
      const { data: coupon, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      if (!coupon) {
        setCouponError("Invalid coupon code");
        return;
      }

      // Validity dates
      const today = new Date().toISOString().split("T")[0];
      if (coupon.start_date > today) {
        setCouponError("This coupon is not active yet");
        return;
      }
      if (coupon.end_date && coupon.end_date < today) {
        setCouponError("This coupon has expired");
        return;
      }

      // Usage limit
      if (coupon.total_usage_limit && coupon.usage_count >= coupon.total_usage_limit) {
        setCouponError("This coupon has reached its usage limit");
        return;
      }

      // Branch check
      if (coupon.applicable_branch_ids && coupon.applicable_branch_ids.length > 0 && branchId) {
        if (!coupon.applicable_branch_ids.includes(branchId)) {
          setCouponError("This coupon is not valid for this branch");
          return;
        }
      }

      // Parse applicable_on JSON
      const applicableOn = (typeof coupon.applicable_on === "string"
        ? JSON.parse(coupon.applicable_on)
        : coupon.applicable_on) as Record<string, boolean>;

      // Applicable on check
      if (effectiveContext === "new_registration" && applicableOn.new_registration === false) {
        setCouponError("This coupon is not valid for new registrations");
        return;
      }
      if (effectiveContext === "renewal" && applicableOn.renewal === false) {
        setCouponError("This coupon is not valid for renewals");
        return;
      }
      if (effectiveContext === "event" && applicableOn.event !== true) {
        setCouponError("This coupon is not valid for event registration");
        return;
      }
      if (effectiveContext === "pt_renewal" && applicableOn.pt_renewal !== true) {
        setCouponError("This coupon is not valid for PT renewals");
        return;
      }

      const contextSupportsFirstTime = effectiveContext === "new_registration";
      const contextSupportsExisting = effectiveContext === "renewal" || effectiveContext === "pt_renewal";
      const contextSupportsExpired = effectiveContext === "renewal" || effectiveContext === "pt_renewal";

      // User condition checks — only enforced when meaningful for the selected context.
      const userCondToggles = [
        contextSupportsFirstTime && coupon.first_time_only,
        contextSupportsExisting && coupon.existing_members_only,
        contextSupportsExpired && coupon.expired_members_only,
      ].filter(Boolean).length;

      if (userCondToggles > 0) {
        const conditionResults: boolean[] = [];

        if (contextSupportsFirstTime && coupon.first_time_only) {
          conditionResults.push(isNewMember === true);
        }
        if (contextSupportsExisting && coupon.existing_members_only) {
          conditionResults.push(isNewMember === false && !!memberId);
        }
        if (contextSupportsExpired && coupon.expired_members_only) {
          // Member must have a most-recent subscription whose end_date is in the past
          if (!memberId) {
            conditionResults.push(false);
          } else {
            const { data: latestSub } = await supabase
              .from("subscriptions")
              .select("end_date")
              .eq("member_id", memberId)
              .order("end_date", { ascending: false })
              .limit(1)
              .maybeSingle();

            const today = new Date().toISOString().split("T")[0];
            conditionResults.push(!!latestSub?.end_date && latestSub.end_date < today);
          }
        }

        if (!conditionResults.some(Boolean)) {
          // Build a friendly message describing what's required
          const labels: string[] = [];
          if (contextSupportsFirstTime && coupon.first_time_only) labels.push("first-time users");
          if (contextSupportsExisting && coupon.existing_members_only) labels.push("existing members");
          if (contextSupportsExpired && coupon.expired_members_only) labels.push("expired members");
          setCouponError(`This coupon is only for ${labels.join(" / ")}`);
          return;
        }
      }

      // Per-user limit (if member is known)
      if (memberId && coupon.per_user_limit > 0) {
        const { count } = await supabase
          .from("coupon_usage")
          .select("*", { count: "exact", head: true })
          .eq("coupon_id", coupon.id)
          .eq("member_id", memberId);
        
        if (count !== null && count >= coupon.per_user_limit) {
          setCouponError("You've already used this coupon the maximum number of times");
          return;
        }
      }

      // Specific member check
      if (coupon.specific_member_ids && coupon.specific_member_ids.length > 0 && memberId) {
        if (!coupon.specific_member_ids.includes(memberId)) {
          setCouponError("This coupon is not available for your account");
          return;
        }
      }

      // Min order value
      if (coupon.min_order_value && subtotal < coupon.min_order_value) {
        setCouponError(`Minimum order value of ₹${coupon.min_order_value} required`);
        return;
      }

      const validated: ValidatedCoupon = {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
        max_discount_cap: coupon.max_discount_cap ? Number(coupon.max_discount_cap) : null,
        min_order_value: coupon.min_order_value ? Number(coupon.min_order_value) : null,
        applicable_on: applicableOn,
        first_time_only: coupon.first_time_only,
        existing_members_only: coupon.existing_members_only,
        expired_members_only: coupon.expired_members_only,
        per_user_limit: coupon.per_user_limit,
        total_usage_limit: coupon.total_usage_limit,
        usage_count: coupon.usage_count,
        applicable_plan_ids: coupon.applicable_plan_ids,
        applicable_branch_ids: coupon.applicable_branch_ids,
        specific_member_ids: coupon.specific_member_ids,
      };

      const { discountAmount, freeDays } = calculateDiscount(validated, subtotal);
      setAppliedCoupon({ coupon: validated, discountAmount, freeDays });
      setCouponError(null);
    } catch (err: any) {
      setCouponError(err.message || "Failed to validate coupon");
    } finally {
      setIsValidating(false);
    }
  }, [couponCode, branchId, isNewMember, memberId, subtotal, calculateDiscount]);

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }, []);

  // Recalculate discount when subtotal changes
  const recalculateDiscount = useCallback((newSubtotal: number) => {
    if (!appliedCoupon) return;
    const { discountAmount, freeDays } = calculateDiscount(appliedCoupon.coupon, newSubtotal);
    setAppliedCoupon(prev => prev ? { ...prev, discountAmount, freeDays } : null);
  }, [appliedCoupon, calculateDiscount]);

  return {
    couponCode,
    setCouponCode,
    isValidating,
    appliedCoupon,
    couponError,
    validateCoupon,
    removeCoupon,
    recalculateDiscount,
  };
}
