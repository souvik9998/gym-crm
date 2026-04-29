import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { useCoachmark, skipAllCoachmarks } from "@/hooks/useCoachmarks";

interface CoachmarkProps {
  /** Stable id (e.g. "members.add") used for localStorage dismissal */
  id: string;
  /** Anchor element (the button/field the coachmark points to) */
  children: ReactNode;
  /** Headline shown in the bubble */
  title: string;
  /** Body text — keep under ~120 chars */
  description: string;
  /** Where the bubble appears relative to the anchor */
  side?: "top" | "bottom" | "left" | "right";
  /** Disable the coachmark entirely (e.g. when a dialog is open) */
  disabled?: boolean;
}

/**
 * One-time coachmark: spotlights an element with a pulsing ring + bubble
 * tip. Dismisses on click outside, on the close button, or when the user
 * interacts with the anchor itself.
 */
export const Coachmark = ({
  id,
  children,
  title,
  description,
  side = "bottom",
  disabled = false,
}: CoachmarkProps) => {
  const { visible, dismiss } = useCoachmark(id);
  const handleSkipAll = () => {
    skipAllCoachmarks();
    dismiss();
  };
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const active = visible && !disabled;

  useEffect(() => {
    if (!active) return;
    const update = () => {
      const el = wrapperRef.current;
      if (!el) return;
      // Use the first interactive child if present, otherwise the wrapper itself
      const anchor = (el.firstElementChild as HTMLElement) || el;
      setRect(anchor.getBoundingClientRect());
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const interval = setInterval(update, 600); // catch layout shifts
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      clearInterval(interval);
    };
  }, [active]);

  // Dismiss when the user clicks the anchor (they got the hint)
  const handleAnchorPointerDown = () => {
    if (active) dismiss();
  };

  return (
    <>
      <span
        ref={wrapperRef}
        onPointerDownCapture={handleAnchorPointerDown}
        className="contents"
      >
        {children}
      </span>

      {active && rect && typeof document !== "undefined" &&
        createPortal(
          <CoachmarkBubble
            rect={rect}
            side={side}
            title={title}
            description={description}
            onDismiss={dismiss}
            onSkipAll={handleSkipAll}
          />,
          document.body
        )}
    </>
  );
};

interface BubbleProps {
  rect: DOMRect;
  side: "top" | "bottom" | "left" | "right";
  title: string;
  description: string;
  onDismiss: () => void;
  onSkipAll: () => void;
}

const CoachmarkBubble = ({ rect, side, title, description, onDismiss, onSkipAll }: BubbleProps) => {
  // Bubble dimensions guess — clamp to viewport
  const BUBBLE_W = 260;
  const GAP = 12;

  let top = rect.bottom + GAP;
  let left = rect.left + rect.width / 2 - BUBBLE_W / 2;

  if (side === "top") {
    top = rect.top - GAP - 8;
  } else if (side === "left") {
    top = rect.top + rect.height / 2;
    left = rect.left - BUBBLE_W - GAP;
  } else if (side === "right") {
    top = rect.top + rect.height / 2;
    left = rect.right + GAP;
  }

  // Clamp horizontally
  const padding = 8;
  if (left < padding) left = padding;
  if (left + BUBBLE_W > window.innerWidth - padding) {
    left = window.innerWidth - BUBBLE_W - padding;
  }
  // Clamp vertically (bottom side fallback)
  if (top + 100 > window.innerHeight - padding) {
    top = Math.max(padding, rect.top - 100 - GAP);
  }

  return (
    <>
      {/* Pulsing ring around the anchor */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60]"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      >
        <span className="absolute inset-0 rounded-xl ring-2 ring-primary/70 animate-[coachmark-pulse_1.6s_ease-out_infinite]" />
        <span className="absolute inset-0 rounded-xl ring-1 ring-primary/40" />
      </div>

      {/* Bubble */}
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "fixed z-[61] w-[260px] rounded-2xl border border-border/60 bg-card shadow-2xl",
          "p-3 animate-fade-in"
        )}
        style={{ top, left }}
      >
        <div className="flex items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SparklesIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-foreground">{title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss tip"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkipAll}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
};

export default Coachmark;
