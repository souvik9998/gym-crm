import { cn } from "@/lib/utils";

interface ButtonSpinnerProps {
  className?: string;
}

/**
 * Prix-clip ring spinner: a rotating ring with an animated clip-path arc.
 * Inherits color via `currentColor` (border uses text color).
 */
export const ButtonSpinner = ({ className }: ButtonSpinnerProps) => (
  <span
    className={cn(
      "relative inline-block h-3.5 w-3.5 lg:h-4 lg:w-4 shrink-0 rounded-full",
      "animate-[spinner-orbit_1s_linear_infinite]",
      className
    )}
    role="status"
    aria-label="Loading"
  >
    <span
      className={cn(
        "absolute inset-0 box-border rounded-full border-2 border-current",
        "animate-[prix-clip-fix_2s_linear_infinite]"
      )}
    />
  </span>
);
