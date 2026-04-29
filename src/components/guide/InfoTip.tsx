import { ReactNode } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface InfoTipProps {
  /** Tip body — keep short (one sentence). */
  children: ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  /** Optional aria-label override */
  label?: string;
}

/**
 * Quiet (i) icon that opens a small tooltip. Use after a coachmark has
 * been dismissed to keep guidance discoverable without being noisy.
 */
export const InfoTip = ({ children, className, side = "top", label = "More info" }: InfoTipProps) => {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-primary",
              className
            )}
          >
            <InformationCircleIcon className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[220px] text-[11px] leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default InfoTip;
