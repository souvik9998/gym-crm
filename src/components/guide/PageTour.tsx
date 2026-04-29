import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon, SparklesIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { isFirstTimeUser, markFirstRunSeen } from "@/hooks/useCoachmarks";

export interface TourStep {
  /** CSS selector for the anchor element */
  selector: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
  /** Optional: dispatched as a side-effect before this step renders.
   *  Useful to switch a tab so the next anchor exists in the DOM. */
  beforeShow?: () => void;
}

interface PageTourProps {
  /** Stable id used for localStorage "done" key + replay event */
  tourId: string;
  steps: TourStep[];
  /** If true, the tour auto-starts for first-time users. Default: true. */
  autoStart?: boolean;
}

/**
 * Generic, reusable in-app tour. Spotlights anchors via a 4-panel cutout
 * scrim and shows a contextual bubble. Listens for a custom event
 * `gymkloud:tour:{tourId}:replay` to (re)start the tour from the Guide.
 */
export const PageTour = ({ tourId, steps, autoStart = true }: PageTourProps) => {
  const TOUR_KEY = `gymkloud:tour:${tourId}:done`;
  const REPLAY_EVT = `gymkloud:tour:${tourId}:replay`;

  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // First-run auto-start
  useEffect(() => {
    if (!autoStart) return;
    let done = false;
    try {
      done = localStorage.getItem(TOUR_KEY) === "1";
    } catch {
      // ignore
    }
    if (done) return;
    if (!isFirstTimeUser()) return;
    const t = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(t);
  }, [TOUR_KEY, autoStart]);

  // Replay event from the Guide drawer
  useEffect(() => {
    const onReplay = () => {
      try {
        localStorage.removeItem(TOUR_KEY);
      } catch {
        // ignore
      }
      setStepIdx(0);
      // Slight delay so any navigation/route change can settle.
      setTimeout(() => setActive(true), 350);
    };
    window.addEventListener(REPLAY_EVT, onReplay);
    return () => window.removeEventListener(REPLAY_EVT, onReplay);
  }, [REPLAY_EVT, TOUR_KEY]);

  // Run beforeShow side-effect when stepping
  useEffect(() => {
    if (!active) return;
    const step = steps[stepIdx];
    if (step?.beforeShow) {
      try {
        step.beforeShow();
      } catch {
        // ignore
      }
    }
  }, [active, stepIdx, steps]);

  // Track the anchor's position
  useEffect(() => {
    if (!active) return;
    const step = steps[stepIdx];
    if (!step) return;

    const pickVisible = (sel: string): HTMLElement | null => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(sel));
      for (const n of nodes) {
        const r = n.getBoundingClientRect();
        const style = window.getComputedStyle(n);
        const visible =
          r.width > 0 &&
          r.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none";
        if (visible) return n;
      }
      return nodes[0] ?? null;
    };

    let scrolled = false;
    const update = () => {
      const el = pickVisible(step.selector);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (!scrolled && (r.top < 90 || r.bottom > window.innerHeight - 90)) {
        scrolled = true;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      setRect(el.getBoundingClientRect());
    };
    // Give the DOM a moment after beforeShow / nav to settle.
    const startT = setTimeout(update, 60);
    const interval = setInterval(update, 350);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(startT);
      clearInterval(interval);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [active, stepIdx, steps]);

  const finish = () => {
    setActive(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // ignore
    }
    markFirstRunSeen();
  };

  const goNext = () => {
    if (stepIdx >= steps.length - 1) finish();
    else setStepIdx((i) => i + 1);
  };

  if (!active) return null;
  const step = steps[stepIdx];
  if (!step) return null;
  if (!rect) return null;

  return createPortal(
    <TourBubble
      rect={rect}
      side={step.side ?? "bottom"}
      title={step.title}
      description={step.description}
      stepLabel={`Step ${stepIdx + 1} of ${steps.length}`}
      isLast={stepIdx === steps.length - 1}
      onSkipStep={goNext}
      onNext={goNext}
      onEnd={finish}
    />,
    document.body
  );
};

interface BubbleProps {
  rect: DOMRect;
  side: "top" | "bottom" | "left" | "right";
  title: string;
  description: string;
  stepLabel: string;
  isLast: boolean;
  onSkipStep: () => void;
  onNext: () => void;
  onEnd: () => void;
}

const TourBubble = ({
  rect,
  side,
  title,
  description,
  stepLabel,
  isLast,
  onSkipStep,
  onNext,
  onEnd,
}: BubbleProps) => {
  const BUBBLE_W = 290;
  const GAP = 12;

  let top = rect.bottom + GAP;
  let left = rect.left + rect.width / 2 - BUBBLE_W / 2;

  if (side === "top") {
    top = rect.top - GAP - 140;
  } else if (side === "left") {
    top = rect.top + rect.height / 2 - 70;
    left = rect.left - BUBBLE_W - GAP;
  } else if (side === "right") {
    top = rect.top + rect.height / 2 - 70;
    left = rect.right + GAP;
  }

  const padding = 8;
  if (left < padding) left = padding;
  if (left + BUBBLE_W > window.innerWidth - padding) {
    left = window.innerWidth - BUBBLE_W - padding;
  }
  if (top + 160 > window.innerHeight - padding) {
    top = Math.max(padding, rect.top - 170);
  }
  if (top < padding) top = padding;

  // Cutout-style scrim — match UI radius (rounded-xl, ~12px).
  const PAD = 6;
  const cutTop = Math.max(0, rect.top - PAD);
  const cutBottom = Math.min(window.innerHeight, rect.bottom + PAD);
  const cutLeft = Math.max(0, rect.left - PAD);
  const cutRight = Math.min(window.innerWidth, rect.right + PAD);

  return (
    <>
      {/* Cutout scrim */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[55] animate-fade-in">
        <div
          className="absolute left-0 right-0 top-0 bg-foreground/45 transition-[height] duration-300 ease-out"
          style={{ height: cutTop }}
        />
        <div
          className="absolute left-0 right-0 bottom-0 bg-foreground/45 transition-[top] duration-300 ease-out"
          style={{ top: cutBottom }}
        />
        <div
          className="absolute bg-foreground/45 transition-all duration-300 ease-out"
          style={{ top: cutTop, bottom: window.innerHeight - cutBottom, left: 0, width: cutLeft }}
        />
        <div
          className="absolute bg-foreground/45 transition-all duration-300 ease-out"
          style={{ top: cutTop, bottom: window.innerHeight - cutBottom, left: cutRight, right: 0 }}
        />
      </div>

      {/* Spotlight glow — softer radius matches UI */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60] rounded-xl animate-coachmark-pulse"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          transition:
            "top 360ms cubic-bezier(0.22, 1, 0.36, 1), left 360ms cubic-bezier(0.22, 1, 0.36, 1), width 360ms cubic-bezier(0.22, 1, 0.36, 1), height 360ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />

      {/* Bubble */}
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "fixed z-[61] w-[290px] rounded-xl border border-border/60 bg-card shadow-2xl",
          "p-3.5 animate-fade-in"
        )}
        style={{ top, left }}
      >
        <div className="flex items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SparklesIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
              {stepLabel}
            </p>
            <p className="text-[13px] font-semibold leading-tight text-foreground">
              {title}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onEnd}
            aria-label="End tour"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkipStep}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Skip this step
          </button>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            {isLast ? "Finish" : "Next"}
            {!isLast && <ArrowRightIcon className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </>
  );
};

export default PageTour;
