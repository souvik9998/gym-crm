import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircleIcon,
  UserPlusIcon,
  CreditCardIcon,
  UserGroupIcon,
  ArrowRightIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { isFirstTimeUser, markFirstRunSeen } from "@/hooks/useCoachmarks";

const DISMISS_KEY = "gymkloud:nextstep:dismissed";

interface SetupState {
  hasPlan: boolean;
  hasTrainer: boolean;
  hasMember: boolean;
  loading: boolean;
}

interface NextStep {
  key: "plan" | "trainer" | "member";
  title: string;
  description: string;
  cta: string;
  href: string;
  icon: typeof CreditCardIcon;
  accent: string;
}

const STEP_DEFINITIONS: Record<NextStep["key"], NextStep> = {
  plan: {
    key: "plan",
    title: "Create your first plan",
    description: "Plans set member duration, price, and renewal cadence.",
    cta: "Add a plan",
    href: "/admin/settings?tab=packages",
    icon: CreditCardIcon,
    accent: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
  },
  trainer: {
    key: "trainer",
    title: "Add your first trainer",
    description: "Trainers run time slots and earn a share of PT revenue.",
    cta: "Add a trainer",
    href: "/admin/staff",
    icon: UserGroupIcon,
    accent: "from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400",
  },
  member: {
    key: "member",
    title: "Add your first member",
    description: "Use the Add Member wizard to enroll in under a minute.",
    cta: "Add a member",
    href: "/admin/dashboard?tab=members",
    icon: UserPlusIcon,
    accent: "from-primary/20 to-primary/5 text-primary",
  },
};

export const RecommendedNextStep = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();
  const [state, setState] = useState<SetupState>({
    hasPlan: false,
    hasTrainer: false,
    hasMember: false,
    loading: true,
  });
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      // Honor a previous "skip" and only auto-show on the very first session.
      if (localStorage.getItem(DISMISS_KEY) === "1") return true;
      // For returning users (any non-first session), don't auto-show.
      if (!isFirstTimeUser()) return true;
      return false;
    } catch {
      return false;
    }
  });

  const handleDismiss = (persist: boolean) => {
    setDismissed(true);
    if (persist) {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        // ignore
      }
    }
    markFirstRunSeen();
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!currentBranch?.id) return;
      setState((s) => ({ ...s, loading: true }));

      const [plansRes, trainersRes, membersRes] = await Promise.all([
        supabase
          .from("monthly_packages")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", currentBranch.id)
          .eq("is_active", true),
        supabase
          .from("personal_trainers")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", currentBranch.id),
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", currentBranch.id),
      ]);

      if (cancelled) return;
      setState({
        hasPlan: (plansRes.count ?? 0) > 0,
        hasTrainer: (trainersRes.count ?? 0) > 0,
        hasMember: (membersRes.count ?? 0) > 0,
        loading: false,
      });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [currentBranch?.id]);

  if (state.loading) return null;

  const allDone = state.hasPlan && state.hasTrainer && state.hasMember;

  // Once everything is set up, hide for this branch (don't clutter the dashboard)
  if (allDone) return null;
  if (dismissed) return null;

  // Recommendation order: plan → trainer → member
  let nextKey: NextStep["key"] = "member";
  if (!state.hasPlan) nextKey = "plan";
  else if (!state.hasTrainer) nextKey = "trainer";
  else if (!state.hasMember) nextKey = "member";

  const step = STEP_DEFINITIONS[nextKey];
  const Icon = step.icon;

  const completed = [state.hasPlan, state.hasTrainer, state.hasMember].filter(Boolean).length;
  const progressPct = (completed / 3) * 100;

  const checklist: { label: string; done: boolean; key: string }[] = [
    { label: "Plan created", done: state.hasPlan, key: "plan" },
    { label: "Trainer added", done: state.hasTrainer, key: "trainer" },
    { label: "First member added", done: state.hasMember, key: "member" },
  ];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 bg-card",
        "p-3 md:p-4 animate-fade-in shadow-sm"
      )}
    >
      {/* Animated gradient backdrop */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80",
          step.accent
        )}
      />
      <div className="pointer-events-none absolute -top-12 -right-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        {/* Icon */}
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="relative shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-sm border border-border/40">
              <Icon className="h-5 w-5 text-foreground" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="secondary"
                className="h-5 gap-1 rounded-md text-[10px] font-medium uppercase tracking-wide"
              >
                <SparklesIcon className="h-2.5 w-2.5" />
                Recommended Next Step
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {completed}/3 done
              </span>
            </div>
            <p className="mt-1 text-sm md:text-base font-semibold text-foreground leading-tight">
              {step.title}
            </p>
            <p className="mt-0.5 text-[11px] md:text-xs text-muted-foreground leading-relaxed">
              {step.description}
            </p>

            {/* Mini checklist */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {checklist.map((item) => (
                <span
                  key={item.key}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    item.done
                      ? "bg-success/10 text-success"
                      : item.key === step.key
                        ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {item.done && <CheckCircleIcon className="h-2.5 w-2.5" />}
                  {item.label}
                </span>
              ))}
            </div>

            {/* Progress bar */}
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-2 md:flex-col md:items-stretch md:gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={() => {
              markFirstRunSeen();
              navigate(step.href);
            }}
            className="h-9 gap-1.5 rounded-lg text-xs"
          >
            {step.cta}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Button>
          <div className="flex items-center gap-2 md:justify-center">
            <button
              type="button"
              onClick={() => handleDismiss(false)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Hide
            </button>
            <span className="text-[10px] text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={() => handleDismiss(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecommendedNextStep;
