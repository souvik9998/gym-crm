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
    selector: "[data-tour='next-step']",
    title: "Setup checklist",
    description:
      "Tracks your onboarding progress — Plan, Trainer, First Member. Click the action to jump straight to the missing step.",
    side: "bottom",
  },
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
    const update = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
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

  return (
    <>
      {/* Soft scrim so the rest of the UI dims slightly */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[55] bg-foreground/10 backdrop-blur-[1px] animate-fade-in"
      />

      {/* Spotlight ring around the anchor */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60]"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
        }}
      >
        <span className="absolute inset-0 rounded-2xl ring-2 ring-primary/80 animate-[coachmark-pulse_1.6s_ease-out_infinite]" />
        <span className="absolute inset-0 rounded-2xl ring-1 ring-primary/40" />
      </div>

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
