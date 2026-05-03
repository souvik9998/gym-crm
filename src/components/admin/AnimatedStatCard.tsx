import { memo, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AnimatedStatCardProps {
  value: number | string;
  label: string;
  icon: React.ElementType;
  colorClass?: string;
  bgClass?: string;
  iconClass?: string;
  hoverBorderClass?: string;
  index?: number;
  loading?: boolean;
  onClick?: () => void;
}

/**
 * Modern, interactive stat card.
 * - Animated count-up for numeric values
 * - Hover lift + gradient sheen
 * - Icon wiggle/scale on hover
 * - Active press scale + subtle ring
 */
const useCountUp = (target: number, durationMs = 700, enabled = true) => {
  const [display, setDisplay] = useState(enabled ? 0 : target);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplay(target);
      return;
    }
    fromRef.current = display;
    startRef.current = null;

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(fromRef.current + (target - fromRef.current) * eased);
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enabled]);

  return display;
};

export const AnimatedStatCard = memo(
  ({
    value,
    label,
    icon: Icon,
    colorClass = "text-foreground",
    bgClass = "bg-primary/10",
    iconClass = "text-primary",
    index = 0,
    loading = false,
    onClick,
  }: AnimatedStatCardProps) => {
    // Detect numeric vs string (₹X) values
    const numericTarget =
      typeof value === "number"
        ? value
        : (() => {
            const m = String(value).match(/-?\d[\d,]*/);
            return m ? Number(m[0].replace(/,/g, "")) : NaN;
          })();
    const isNumeric = !loading && Number.isFinite(numericTarget);
    const animated = useCountUp(isNumeric ? numericTarget : 0, 700, isNumeric);

    const renderValue = () => {
      if (!isNumeric) return value;
      if (typeof value === "string") {
        // Preserve prefix like "₹"
        const prefix = value.match(/^[^0-9-]*/)?.[0] ?? "";
        return `${prefix}${animated.toLocaleString("en-IN")}`;
      }
      return animated.toLocaleString("en-IN");
    };

    const interactive = !!onClick;

    return (
      <Card
        onClick={onClick}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        className={cn(
          "group relative overflow-hidden border border-border/60 shadow-sm h-full rounded-xl",
          "transition-all duration-300 ease-out will-change-transform",
          "hover:-translate-y-1 hover:shadow-xl hover:border-primary/30",
          "active:translate-y-0 active:scale-[0.98]",
          interactive && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "animate-fade-in",
        )}
        style={{ animationDelay: `${index * 70}ms` }}
      >
        {/* Soft radial glow follows the icon color */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl",
            "opacity-0 group-hover:opacity-70 transition-opacity duration-500",
            bgClass,
          )}
        />
        {/* Diagonal sheen sweep on hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[900ms] ease-out bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent"
        />

        {/* Mobile/Tablet layout */}
        <CardContent className="p-2.5 md:p-3 lg:hidden flex items-center justify-between gap-2 relative">
          <div className="flex-1 min-w-0">
            {loading ? (
              <Skeleton className="h-5 md:h-6 w-12 md:w-16 rounded-md" />
            ) : (
              <p
                className={cn(
                  "text-base md:text-xl font-bold leading-tight break-words tracking-tight tabular-nums",
                  colorClass,
                  "transition-transform duration-300 group-hover:scale-[1.04] origin-left",
                )}
              >
                {renderValue()}
              </p>
            )}
            <p className="text-[10px] md:text-xs text-muted-foreground leading-tight mt-0.5 font-medium truncate">
              {label}
            </p>
          </div>
          <div
            className={cn(
              "w-7 h-7 md:w-9 md:h-9 rounded-lg flex items-center justify-center flex-shrink-0",
              "transition-all duration-300 group-hover:scale-110 group-hover:rotate-[-4deg]",
              bgClass,
            )}
          >
            <Icon className={cn("w-3.5 h-3.5 md:w-[18px] md:h-[18px]", iconClass)} strokeWidth={1.75} />
          </div>
        </CardContent>

        {/* Desktop layout */}
        <CardContent className="hidden lg:block lg:p-4 relative">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              {loading ? (
                <Skeleton className="h-7 w-20 rounded-md" />
              ) : (
                <p
                  className={cn(
                    "text-2xl font-bold truncate tabular-nums",
                    colorClass,
                    "transition-transform duration-300 group-hover:scale-[1.06] origin-left",
                  )}
                >
                  {renderValue()}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 transition-colors group-hover:text-foreground/80">
                {label}
              </p>
            </div>
            <div
              className={cn(
                "p-2.5 rounded-xl flex-shrink-0 ml-2",
                "transition-all duration-300 group-hover:scale-110 group-hover:-rotate-[6deg]",
                bgClass,
              )}
            >
              <Icon className={cn("w-5 h-5", iconClass)} strokeWidth={1.75} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  },
);
AnimatedStatCard.displayName = "AnimatedStatCard";
