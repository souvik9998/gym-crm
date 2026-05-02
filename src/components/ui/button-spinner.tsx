import { cn } from "@/lib/utils";

interface ButtonSpinnerProps {
  className?: string;
}

/**
 * Modern dual-ring spinner with a fast outer orbit and a counter-rotating
 * inner accent. Designed for in-button loading states.
 */
export const ButtonSpinner = ({ className }: ButtonSpinnerProps) => (
  <span
    className={cn(
      "relative inline-flex h-3.5 w-3.5 lg:h-4 lg:w-4 shrink-0",
      className
    )}
    role="status"
    aria-label="Loading"
  >
    <span
      className={cn(
        "absolute inset-0 rounded-full border-2 border-current/25",
        "border-t-current animate-[spinner-orbit_0.7s_linear_infinite]"
      )}
    />
    <span
      className={cn(
        "absolute inset-[3px] rounded-full border border-current/40",
        "border-b-current animate-[spinner-orbit_1.1s_linear_infinite_reverse]"
      )}
    />
  </span>
);
