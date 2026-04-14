import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TicketPercent, X, Loader2, Check, AlertCircle } from "lucide-react";

interface CouponInputProps {
  couponCode: string;
  onCouponCodeChange: (code: string) => void;
  onApply: () => void;
  onRemove: () => void;
  isValidating: boolean;
  appliedCoupon: {
    coupon: { code: string; discount_type: string; discount_value: number; max_discount_cap: number | null };
    discountAmount: number;
    freeDays: number;
  } | null;
  error: string | null;
  compact?: boolean;
}

const CouponInput = ({
  couponCode,
  onCouponCodeChange,
  onApply,
  onRemove,
  isValidating,
  appliedCoupon,
  error,
  compact = false,
}: CouponInputProps) => {
  const textSm = compact ? "text-[10px] md:text-xs" : "text-xs md:text-sm";
  const textXs = compact ? "text-[9px] md:text-[10px]" : "text-[10px] md:text-xs";
  const inputH = compact ? "h-7 md:h-8" : "h-8 md:h-10";
  const btnH = compact ? "h-7 md:h-8" : "h-8 md:h-10";
  const iconSz = compact ? "w-3 h-3" : "w-3.5 h-3.5 md:w-4 md:h-4";

  if (appliedCoupon) {
    return (
      <div className="bg-success/10 border border-success/20 rounded-lg p-2 md:p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Check className={`${iconSz} text-success`} />
            <span className={`font-medium text-success ${textSm}`}>
              {appliedCoupon.coupon.code}
            </span>
            <Badge variant="outline" className={`border-success/30 text-success ${textXs}`}>
              {appliedCoupon.coupon.discount_type === "percentage"
                ? `${appliedCoupon.coupon.discount_value}% off`
                : appliedCoupon.coupon.discount_type === "flat"
                ? `₹${appliedCoupon.coupon.discount_value} off`
                : `${appliedCoupon.freeDays} free days`}
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
        {appliedCoupon.discountAmount > 0 && (
          <p className={`${textXs} text-success mt-1 ml-5 md:ml-6`}>
            You save ₹{appliedCoupon.discountAmount.toLocaleString("en-IN")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 md:gap-2">
        <TicketPercent className={`${iconSz} text-muted-foreground`} />
        <span className={`${textSm} font-medium text-muted-foreground`}>Have a coupon code?</span>
      </div>
      <div className="flex gap-1.5 md:gap-2">
        <Input
          placeholder="Enter coupon code"
          value={couponCode}
          onChange={(e) => onCouponCodeChange(e.target.value.toUpperCase())}
          className={`${inputH} ${textSm} flex-1 uppercase tracking-wider`}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onApply())}
        />
        <Button
          type="button"
          variant="outline"
          onClick={onApply}
          disabled={isValidating || !couponCode.trim()}
          className={`${btnH} px-2.5 md:px-4 ${textSm}`}
        >
          {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
        </Button>
      </div>
      {error && (
        <div className="flex items-center gap-1 text-destructive">
          <AlertCircle className="w-3 h-3" />
          <span className={textXs}>{error}</span>
        </div>
      )}
    </div>
  );
};

export default CouponInput;
