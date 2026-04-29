import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon, SparklesIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { isFirstTimeUser, markFirstRunSeen } from "@/hooks/useCoachmarks";

const TOUR_KEY = "gymkloud:tour:dashboard:done";

interface Step {
  /** CSS selector for the anchor element on the dashboard */
  selector: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
}

const STEPS: Step[] = [
  {
    selector: "[data-tour='stats-grid']",
    title: "Live gym stats",
    description:
      "At-a-glance counts: Total members, Active, Expiring Soon (7 days), and this month's revenue. Tap a card to filter.",
    side: "bottom",
  },
  {
    selector: "[data-tour='tabs-list']",
    title: "Switch what you're managing",
    description:
      "Members are full subscribers. Daily Passes are walk-ins. Payments shows every transaction across both.",
    side: "bottom",
  },
  {
    selector: "[data-tour='search']",
    title: "Find anyone fast",
    description:
      "Search by name or phone. Results update as you type — works on Members and Daily Passes.",
    side: "bottom",
  },
  {
    selector: "[data-tour='filters']",
    title: "Filter & segment",
    description:
      "Filter by status (Active / Expiring / Expired), assigned trainer, time slot, or time-of-day bucket.",
    side: "bottom",
  },
  {
    selector: "[data-tour='export']",
    title: "Export to Excel",
    description:
      "Download the current tab (members, passes, or payments) as an .xlsx file for accounting or sharing.",
    side: "bottom",
  },
  {
    selector: "[data-tour='add-member']",
    title: "Add a new member",
    description:
      "Opens a 4-step wizard: phone → details → plan & PT → payment. Phone is checked for duplicates first.",
    side: "bottom",
  },
];

export const DashboardTour = () => {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Decide whether to start the tour (first-time users only, once per device)
  useEffect(() => {
    let done = false;
    try {
      done = localStorage.getItem(TOUR_KEY) === "1";
    } catch {
      // ignore
    }
    if (done) return;
    if (!isFirstTimeUser()) return;

    // Wait a beat for the dashboard to render, then start
    const t = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Listen for "Replay tour" event from the Guide drawer
  useEffect(() => {
    const onReplay = () => {
      try {
        localStorage.removeItem(TOUR_KEY);
      } catch {
        // ignore
      }
      setStepIdx(0);
      setActive(true);
    };
    window.addEventListener("gymkloud:tour:dashboard:replay", onReplay);
    return () =>
      window.removeEventListener("gymkloud:tour:dashboard:replay", onReplay);
  }, []);

  // Track the anchor's position
  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIdx];
    if (!step) return;

    let frame = 0;
    // Pick the FIRST visible match — the dashboard renders both mobile
    // and desktop variants of the same anchor, and only one is on screen.
    const pickVisible = (sel: string): HTMLElement | null => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(sel)
      );
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
    const update = () => {
      const el = pickVisible(step.selector);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // Only auto-scroll if anchor is off-screen
      if (r.top < 80 || r.bottom > window.innerHeight - 80) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      setRect(el.getBoundingClientRect());
    };
    update();
    const interval = setInterval(update, 400);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      clearInterval(interval);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [active, stepIdx]);

  const finish = () => {
    setActive(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // ignore
    }
    markFirstRunSeen();
  };

  const skipStep = () => {
    if (stepIdx >= STEPS.length - 1) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
    }
  };

  const next = () => {
    if (stepIdx >= STEPS.length - 1) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
    }
  };

  if (!active) return null;
  const step = STEPS[stepIdx];
  if (!step) return null;

  // If anchor isn't on screen, auto-skip after a short grace period
  if (!rect) {
    return null;
  }

  return createPortal(
    <TourBubble
      rect={rect}
      side={step.side ?? "bottom"}
      title={step.title}
      description={step.description}
      stepLabel={`Step ${stepIdx + 1} of ${STEPS.length}`}
      isLast={stepIdx === STEPS.length - 1}
      onSkipStep={skipStep}
      onNext={next}
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
  const BUBBLE_W = 280;
  const GAP = 12;

  let top = rect.bottom + GAP;
  let left = rect.left + rect.width / 2 - BUBBLE_W / 2;

  if (side === "top") {
    top = rect.top - GAP - 120;
  } else if (side === "left") {
    top = rect.top + rect.height / 2 - 60;
    left = rect.left - BUBBLE_W - GAP;
  } else if (side === "right") {
    top = rect.top + rect.height / 2 - 60;
    left = rect.right + GAP;
  }

  const padding = 8;
  if (left < padding) left = padding;
  if (left + BUBBLE_W > window.innerWidth - padding) {
    left = window.innerWidth - BUBBLE_W - padding;
  }
  if (top + 140 > window.innerHeight - padding) {
    top = Math.max(padding, rect.top - 150);
  }
  if (top < padding) top = padding;

  // Cutout-style scrim: 4 dim panels around the anchor (top/bottom/left/right).
  // No blur — keeps the UI crisp while drawing focus to the spotlighted area.
  const PAD = 6;
  const cutTop = Math.max(0, rect.top - PAD);
  const cutBottom = Math.min(window.innerHeight, rect.bottom + PAD);
  const cutLeft = Math.max(0, rect.left - PAD);
  const cutRight = Math.min(window.innerWidth, rect.right + PAD);

  return (
    <>
      {/* Cutout scrim — dims everything EXCEPT the spotlight rectangle */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[55] animate-fade-in">
        <div className="absolute left-0 right-0 top-0 bg-foreground/40" style={{ height: cutTop }} />
        <div className="absolute left-0 right-0 bottom-0 bg-foreground/40" style={{ top: cutBottom }} />
        <div className="absolute bg-foreground/40" style={{ top: cutTop, bottom: window.innerHeight - cutBottom, left: 0, width: cutLeft }} />
        <div className="absolute bg-foreground/40" style={{ top: cutTop, bottom: window.innerHeight - cutBottom, left: cutRight, right: 0 }} />
      </div>

      {/* Spotlight glow around the anchor — soft, breathing, no jarring border */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60] rounded-2xl animate-coachmark-pulse"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          transition: "top 360ms cubic-bezier(0.22, 1, 0.36, 1), left 360ms cubic-bezier(0.22, 1, 0.36, 1), width 360ms cubic-bezier(0.22, 1, 0.36, 1), height 360ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />

      {/* Bubble */}
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "fixed z-[61] w-[280px] rounded-2xl border border-border/60 bg-card shadow-2xl",
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
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            {isLast ? "Finish" : "Next"}
            {!isLast && <ArrowRightIcon className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </>
  );
};

export default DashboardTour;
