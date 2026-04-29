import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  UsersIcon,
  UserGroupIcon,
  CreditCardIcon,
  ClockIcon,
  ChartBarIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  SparklesIcon,
  LightBulbIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";
import { resetAllCoachmarks } from "@/hooks/useCoachmarks";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

interface GuideDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GuideStep {
  title: string;
  body: string;
}

interface GuideSection {
  id: string;
  icon: typeof UsersIcon;
  title: string;
  summary: string;
  href?: string;
  steps: GuideStep[];
  tip?: string;
}

const SECTIONS: GuideSection[] = [
  {
    id: "members",
    icon: UsersIcon,
    title: "Members",
    summary: "Add, renew, search, and manage every member.",
    href: "/admin/dashboard?tab=members",
    steps: [
      {
        title: "Open the Members tab",
        body: "Dashboard → Members. You'll see every active, expired, and expiring-soon member with status pills, plan name, and remaining days. Use the search bar to find anyone by name or 10-digit phone instantly — fuzzy match is enabled.",
      },
      {
        title: "Click 'Add Member' to launch the 4-step wizard",
        body: "Step 1 captures phone, name, gender (pill selector) and DOB (segmented input). Step 2 collects address (min 3 chars), email, and optional emergency contact. Step 3 picks the plan + start date. Step 4 confirms payment mode (Cash, UPI, or Razorpay link).",
      },
      {
        title: "Phone is identity — used for login & WhatsApp",
        body: "Members log in to /member with this phone. We auto-detect duplicates across the branch. Phone must be exactly 10 digits — international prefixes are added automatically when sending WhatsApp.",
      },
      {
        title: "Plan defines revenue, expiry, and reminders",
        body: "Plan duration sets the expiry date (existing_end_date + 1 for renewals). Price hits the ledger as Income. Expiring-Soon badge fires within 7 days. After 30 days past expiry, status flips to Inactive automatically.",
      },
      {
        title: "Renew, edit, or assign a trainer",
        body: "Click any member row to open Profile → Renew (same wizard, plan-only), Edit details, Assign Personal Trainer (replace mode deactivates existing PT subscription), view full payment history, or send a manual WhatsApp.",
      },
      {
        title: "Export to Excel anytime",
        body: "Use the download icon at the top-right of the Members table. Exports respect the current search filter and date range.",
      },
    ],
    tip: "Members appear instantly via optimistic UI. If you hit your plan's member cap, the Add Member button shows a clear limit-reached dialog with upgrade options.",
  },
  {
    id: "staff",
    icon: UserGroupIcon,
    title: "Staff Control",
    summary: "Trainers, managers, permissions, and revenue splits.",
    href: "/admin/staff",
    steps: [
      {
        title: "Add a staff member",
        body: "Staff → Add Staff. Capture name, phone (login identity), role (Trainer / Manager / Receptionist), and an initial password. Staff sign in at /admin/login — no separate portal.",
      },
      {
        title: "Configure 9 granular permission modules",
        body: "Per-staff toggles for: Members (view/edit), Payments, Daily Pass, Time Slots, Settings, Ledger, WhatsApp send, Analytics, and Member Access scope (All vs Assigned-only). Changes apply on the staff's next page load.",
      },
      {
        title: "Assigned-only access for trainers",
        body: "Set Member Access to 'Assigned' so a trainer only sees members linked to them via PT subscription. Their dashboard, search, and analytics are filtered automatically — strict tenant isolation enforced server-side.",
      },
      {
        title: "Set the trainer revenue split %",
        body: "On the trainer card, configure their cut on PT subscriptions (e.g. 60%). Each PT payment auto-creates a ledger entry for the trainer's earnings — no manual reconciliation needed.",
      },
      {
        title: "Multi-branch staff",
        body: "If the same phone exists in multiple branches, the staff member can switch branches from the header dropdown. Permissions are scoped per branch.",
      },
      {
        title: "Edit, deactivate, or delete",
        body: "Deletion preserves activity logs (ON DELETE SET NULL). Trainer assignments cascade — members with that PT will need a new trainer assigned.",
      },
    ],
    tip: "WhatsApp send is opt-in per staff (can_send_whatsapp). Useful for receptionists who handle reminders without full member-edit access.",
  },
  {
    id: "plans",
    icon: CreditCardIcon,
    title: "Plans, Payments & Ledger",
    summary: "Pricing, transactions, taxes, and full books.",
    href: "/admin/settings?tab=packages",
    steps: [
      {
        title: "Create monthly & custom plans",
        body: "Settings → Packages. Set name, duration (months or custom days), price, optional joining fee, and active/inactive flag. Plans appear in the Add Member wizard and in public registration.",
      },
      {
        title: "Track payments in real time",
        body: "Dashboard → Payments tab lists every transaction with date (IST), mode (Cash/UPI/Razorpay), member, plan, and invoice number (CASH-[Short-ID] for offline, RZP-[id] for Razorpay).",
      },
      {
        title: "Razorpay auto-reconciles via webhook",
        body: "Once Razorpay credentials are added in Super Admin, online payments sync automatically. Test mode supports ₹1 orders. No manual entry required.",
      },
      {
        title: "Open the Ledger for full books",
        body: "Sidebar → Ledger. Branch-scoped Income / Expense view with trainer-split breakdown. Add expenses (rent, electricity, equipment) directly. Reverse-calculated tax on every entry.",
      },
      {
        title: "Configure auto-invoicing & WhatsApp",
        body: "Settings → Notifications. Toggle whether payment_details + invoice PDF are sent automatically before the registration confirmation message.",
      },
      {
        title: "Export reports",
        body: "Members and Payments tables both support Excel export. Automated daily reports email/WhatsApp at 9 AM IST when configured in Super Admin.",
      },
    ],
    tip: "All times shown are IST (Asia/Kolkata). Ledger entries are immutable once created — corrections require an offsetting entry.",
  },
  {
    id: "timeslots",
    icon: ClockIcon,
    title: "Time Slots",
    summary: "Gym hours, trainer assignments, and bookings.",
    href: "/admin/time-slots",
    steps: [
      {
        title: "Create a slot",
        body: "Time Slots → Add Slot. Pick start/end time (12-hour picker), capacity (max members), and the assigned trainer. Slots can repeat daily or on specific weekdays.",
      },
      {
        title: "Assign exactly one trainer per slot",
        body: "Each slot belongs to one trainer. Members pick the slot during PT signup — the trainer is auto-linked to their PT subscription (single source of truth).",
      },
      {
        title: "Capacity caps bookings",
        body: "Once a slot fills, members can't pick it. Adjust capacity anytime — existing bookings are preserved. Use Slot Members tab to see who's in each window.",
      },
      {
        title: "Notify members of changes",
        body: "Use 'Notify Members' on the Holiday Calendar or Slot detail to send a WhatsApp blast. Pick all members in the slot or use checkboxes to select specific people.",
      },
      {
        title: "Track attendance per slot",
        body: "Slot Members tab shows booked members + their check-in status. Combined with biometric/QR attendance for verified presence.",
      },
    ],
    tip: "If you change a trainer on a slot, existing PT subscriptions stay linked to the original trainer until manually re-assigned via the member's profile.",
  },
  {
    id: "dashboard",
    icon: ChartBarIcon,
    title: "Dashboard & Analytics",
    summary: "Live KPIs, growth charts, and smart insights.",
    href: "/admin/dashboard",
    steps: [
      {
        title: "Read the four KPI tiles",
        body: "Total Members · Active · Expiring Soon (next 7 days) · This Month's Revenue. Refreshed live with 30-second cache. Click the refresh icon (top right) to force a re-pull.",
      },
      {
        title: "Recommended Next Step widget",
        body: "Appears for new accounts when setup is incomplete (no plan, trainer, or first member). Shows progress 1/3, 2/3, 3/3 and disappears once you finish — or hide/skip it manually.",
      },
      {
        title: "Switch dashboard tabs",
        body: "Members · Payments · Daily Pass · Daily Activity. All four share the same date-range selector at the top. Daily Pass uses a separate table and is excluded from member stats.",
      },
      {
        title: "Deep analytics",
        body: "Sidebar → Analytics. Member growth chart, revenue trends, package sales mix, trainer performance, and AI-powered Insights Panel highlighting anomalies.",
      },
      {
        title: "Branch Analytics (Super Admin)",
        body: "Multi-branch owners get a cross-branch comparison view — revenue, headcount, and renewal rates side-by-side.",
      },
    ],
    tip: "Optimistic toggles update the UI instantly and revert on server error. Caching: static data 1hr, dynamic 30s — refresh icon bypasses cache.",
  },
];

export const GuideDrawer = ({ open, onOpenChange }: GuideDrawerProps) => {
  const navigate = useNavigate();

  const handleGo = (href?: string) => {
    if (!href) return;
    onOpenChange(false);
    setTimeout(() => navigate(href), 80);
  };

  const handleReplay = () => {
    resetAllCoachmarks();
    toast.success("Tour reset", {
      description: "Helpful tips will appear again the next time you visit each page.",
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 overflow-hidden flex flex-col gap-0"
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-border/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <SheetHeader className="relative px-5 pt-5 pb-4 space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <SparklesIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base lg:text-lg font-semibold text-left">Guide</SheetTitle>
                <SheetDescription className="text-xs text-left">
                  Quick, contextual tips for every section.
                </SheetDescription>
              </div>
              <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] gap-1">
                <LightBulbIcon className="h-3 w-3" />
                {SECTIONS.length} sections
              </Badge>
            </div>
          </SheetHeader>
        </div>

        {/* Body */}
        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-3">
            <Accordion type="single" collapsible defaultValue="members" className="space-y-2">
              {SECTIONS.map((section, idx) => {
                const Icon = section.icon;
                return (
                  <AccordionItem
                    key={section.id}
                    value={section.id}
                    className={cn(
                      "rounded-xl border border-border/40 bg-card overflow-hidden",
                      "data-[state=open]:border-primary/30 data-[state=open]:shadow-sm",
                      "transition-all duration-200"
                    )}
                  >
                    <AccordionTrigger
                      className={cn(
                        "px-3 py-3 hover:no-underline group",
                        "[&[data-state=open]>div>div:first-child]:bg-primary",
                        "[&[data-state=open]>div>div:first-child]:text-primary-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 w-full text-left">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {section.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {section.summary}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] font-medium text-muted-foreground/80">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3">
                      <ol className="relative ml-1 space-y-2.5 border-l border-dashed border-border/60 pl-4">
                        {section.steps.map((step, i) => (
                          <li
                            key={i}
                            className="relative animate-fade-in"
                            style={{ animationDelay: `${i * 40}ms` }}
                          >
                            <span className="absolute -left-[21px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                              {i + 1}
                            </span>
                            <p className="text-[12px] font-medium text-foreground leading-snug">
                              {step.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                              {step.body}
                            </p>
                          </li>
                        ))}
                      </ol>

                      {section.tip && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-2">
                          <LightBulbIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <p className="text-[11px] text-foreground/80 leading-relaxed">
                            {section.tip}
                          </p>
                        </div>
                      )}

                      {section.href && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGo(section.href)}
                          className="mt-3 h-8 w-full gap-1.5 rounded-lg text-xs"
                        >
                          Take me there
                          <ArrowRightIcon className="h-3 w-3" />
                        </Button>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {/* Footer card */}
            <div className="mt-4 rounded-xl border border-border/40 bg-muted/30 p-3">
              <div className="flex items-start gap-2.5">
                <CheckBadgeIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-foreground">
                    Want the welcome tour again?
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                    Replay all the in-app tips you’ve dismissed.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleReplay}
                size="sm"
                variant="outline"
                className="mt-2.5 h-8 w-full gap-1.5 rounded-lg text-xs"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                Replay tour
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default GuideDrawer;
