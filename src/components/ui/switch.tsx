import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Shows a subtle spinner inside the thumb while an async operation is pending */
  loading?: boolean;
}

/**
 * Production-grade toggle switch with optimistic UI behavior.
 *
 * Key design decisions:
 * - Internal `localChecked` state drives the visual immediately on click (optimistic).
 * - Parent `checked` prop is synced only when it intentionally differs (e.g. revert on API failure).
 * - Fixed 46×26 px dimensions — never resizes.
 * - Thumb moves via `transform: translateX()` only — no layout shift.
 * - 250ms ease-in-out transition on transform + background color.
 * - Blocks clicks while `loading` is true.
 * - Tiny spinner rendered inside thumb during loading (never conditionally unmounts thumb).
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked,
      defaultChecked = false,
      onCheckedChange,
      loading = false,
      disabled = false,
      ...props
    },
    ref,
  ) => {
    // Determine if we are controlled or uncontrolled
    const isControlled = checked !== undefined;
    const [internalChecked, setInternalChecked] = React.useState(
      isControlled ? checked : defaultChecked,
    );

    // Track the previous `checked` prop to detect intentional parent changes
    const prevCheckedRef = React.useRef(checked);

    // Sync from parent only when the prop genuinely changes
    // (e.g. parent reverts after API failure)
    React.useEffect(() => {
      if (isControlled && prevCheckedRef.current !== checked) {
        prevCheckedRef.current = checked;
        setInternalChecked(checked);
      }
    }, [checked, isControlled]);

    const isOn = internalChecked;

    const handleClick = React.useCallback(() => {
      if (disabled || loading) return;

      const next = !isOn;
      // Optimistic: flip local state instantly
      setInternalChecked(next);
      prevCheckedRef.current = next; // prevent sync-back from stale parent prop
      onCheckedChange?.(next);
    }, [disabled, loading, isOn, onCheckedChange]);

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isOn}
        data-state={isOn ? "checked" : "unchecked"}
        disabled={disabled || loading}
        onClick={handleClick}
        className={cn(
          // ── Fixed dimensions ──
          "relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full",
          "border-2 border-transparent outline-none",
          // ── Smooth background transition ──
          "transition-[background-color] duration-[250ms] ease-in-out",
          isOn
            ? "bg-primary"
            : "bg-muted-foreground/25",
          // ── Focus ring ──
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          // ── Disabled / loading ──
          disabled || loading
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer",
          // ── Hover ──
          !disabled &&
            !loading &&
            (isOn
              ? "hover:bg-primary/85"
              : "hover:bg-muted-foreground/35"),
          className,
        )}
        style={{ willChange: "background-color" }}
        {...props}
      >
        {/* ── Thumb ── */}
        <span
          className="pointer-events-none relative flex items-center justify-center h-[20px] w-[20px] rounded-full bg-background"
          style={{
            willChange: "transform",
            transition: "transform 250ms ease-in-out, box-shadow 200ms ease",
            transform: isOn ? "translateX(20px)" : "translateX(1px)",
            boxShadow: isOn
              ? "0 2px 6px rgba(0,0,0,0.22)"
              : "0 1px 3px rgba(0,0,0,0.18)",
          }}
        >
          {/* ── Loading spinner (always mounted, opacity-controlled) ── */}
          <svg
            className={cn(
              "h-[10px] w-[10px] text-muted-foreground transition-opacity duration-200",
              loading ? "opacity-100 animate-spin" : "opacity-0",
            )}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </span>
      </button>
    );
  },
);

Switch.displayName = "Switch";

export { Switch };
