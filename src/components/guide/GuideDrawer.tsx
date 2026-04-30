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
  Cog6ToothIcon,
  ClockIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  PlayCircleIcon,
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
  /** If set, dispatches `gymkloud:tour:{tourEvent}:replay` after navigation. */
  tourEvent?: string;
  steps: GuideStep[];
  tip?: string;
}

const SECTIONS: GuideSection[] = [
  {
    id: "dashboard",
    icon: ChartBarIcon,
    title: "Dashboard",
    summary: "Live KPIs, member table, payments, and quick actions.",
    href: "/admin/dashboard",
    tourEvent: "dashboard",
    steps: [
      {
        title: "Read the four KPI tiles",
        body: "Total Members · Active · Expiring Soon (next 7 days) · This Month's Revenue. Refreshes every 30s — tap a card to filter the table below.",
      },
      {
        title: "Switch tabs to manage what you need",
        body: "Members are full subscribers. Daily Pass tracks walk-ins (excluded from member counts). Payments lists every transaction. Daily Activity shows check-ins.",
      },
      {
        title: "Search & filter to slice your list",
        body: "Search by name or 10-digit phone (fuzzy matching). Filter by status, trainer, time slot or time-of-day bucket — combine for precise lists.",
      },
      {
        title: "Add a member in 4 steps",
        body: "Phone (login id) → personal details → plan & PT → payment mode. Phone duplicates are auto-detected. Hits your plan cap? You'll see an upgrade dialog.",
      },
      {
        title: "Export anything to Excel",
        body: "The download icon at top-right exports the active tab as an .xlsx, respecting current filters and search — perfect for accounting.",
      },
    ],
    tip: "Click 'Take me there' to jump to the Dashboard and replay the full guided spotlight tour.",
  },
  {
    id: "members",
    icon: UsersIcon,
    title: "Members",
    summary: "Add, renew, search, and manage every member.",
    href: "/admin/dashboard?tab=members",
    tourEvent: "dashboard",
    steps: [
      {
        title: "Open the Members tab",
        body: "Dashboard → Members. Status pills show Active / Expiring / Expired with remaining days. The search bar matches name or phone instantly.",
      },
      {
        title: "Click 'Add Member' to launch the 4-step wizard",
        body: "Step 1 captures phone, name, gender (pill selector) and DOB (segmented input). Step 2 collects address (min 3 chars), email, optional emergency contact. Step 3 picks plan + start date. Step 4 confirms payment mode.",
      },
      {
        title: "Phone is identity — used for login & WhatsApp",
        body: "Members log in to /member with this phone. Duplicates are detected per branch. International prefixes are added automatically when sending WhatsApp.",
      },
      {
        title: "Plan defines revenue, expiry, and reminders",
        body: "Plan duration sets the expiry (existing_end_date + 1 for renewals). Price hits the ledger as Income. Expiring-Soon badge fires within 7 days. After 30 days past expiry, status flips to Inactive automatically.",
      },
      {
        title: "Renew, edit, or assign a trainer",
        body: "Click any member row to open Profile → Renew (plan-only wizard), Edit details, Assign Personal Trainer (replace mode deactivates existing PT), view payment history, or send a manual WhatsApp.",
      },
    ],
    tip: "Hit your plan's member cap? The Add Member button surfaces a clear limit-reached dialog with upgrade options.",
  },
  {
    id: "staff",
    icon: UserGroupIcon,
    title: "Staff Control",
    summary: "Trainers, managers, permissions, and revenue splits.",
    href: "/admin/staff",
    tourEvent: "staff",
    steps: [
      {
        title: "Add a staff member",
        body: "Staff → Add Staff. Capture name, phone (login identity), role (Trainer / Manager / Receptionist) and an initial password. Staff sign in at /admin/login.",
      },
      {
        title: "Configure 9 granular permission modules",
        body: "Per-staff toggles: Members (view/edit), Payments, Daily Pass, Time Slots, Settings, Ledger, WhatsApp send, Analytics, and Member Access scope (All vs Assigned-only). Changes apply on next page load.",
      },
      {
        title: "Assigned-only access for trainers",
        body: "Set Member Access to 'Assigned' so a trainer only sees members linked to them via PT subscription. Their dashboard, search, and analytics are filtered server-side.",
      },
      {
        title: "Set the trainer revenue split %",
        body: "On the trainer card, configure their cut on PT subscriptions (e.g. 60%). Each PT payment auto-creates a ledger entry — no manual reconciliation needed.",
      },
      {
        title: "Multi-branch staff",
        body: "Same phone in multiple branches? The staff member can switch branches from the header dropdown. Permissions are scoped per branch.",
      },
      {
        title: "Edit, deactivate, or delete",
        body: "Deletion preserves activity logs (ON DELETE SET NULL). Trainer assignments cascade — members with that PT need a new trainer assigned.",
      },
    ],
    tip: "WhatsApp send is opt-in per staff (can_send_whatsapp). Useful for receptionists handling reminders without full member-edit access.",
  },
  {
    id: "settings",
    icon: Cog6ToothIcon,
    title: "Settings",
    summary: "Plans, registration, WhatsApp, gym profile, coupons, backup.",
    href: "/admin/settings",
    tourEvent: "settings",
    steps: [
      {
        title: "Packages — your pricing engine",
        body: "Settings → Packages. Create monthly or custom-day plans, set price + joining fee, toggle active state. Plans surface in the Add Member wizard and public registration.",
      },
      {
        title: "Registration fields",
        body: "Settings → Registration. Toggle which fields appear during member self-registration. Includes the 'Member Self-Select Trainer' switch for PT-led signups.",
      },
      {
        title: "Assessment fields",
        body: "Settings → Assessment. Configure the on-onboarding fitness assessment captured per member — height, weight, goals, medical notes.",
      },
      {
        title: "WhatsApp automations",
        body: "Settings → WhatsApp. Pick templates, set the daily reminder time (default 9 AM IST), and choose which events auto-trigger a message: registration, renewal, expiry, payment.",
      },
      {
        title: "Gym profile (General)",
        body: "Settings → General. Branch name, logo, contact, address. This data appears on invoices, public registration, and WhatsApp messages.",
      },
      {
        title: "Coupons & discounts",
        body: "Settings → Coupons. Create promo codes (percentage or flat off) with validity windows and usage caps. Members enter them at checkout.",
      },
      {
        title: "Subscription & Backup",
        body: "Subscription tab shows your platform plan, member cap and renewal date. Backup & Restore (when enabled) lets you export/import the full branch dataset as a zip.",
      },
    ],
    tip: "Each tab saves independently — there's no global Save button. View-only staff see a banner explaining their access.",
  },
  {
    id: "timeslots",
    icon: ClockIcon,
    title: "Time Slots",
    summary: "Gym hours, trainer assignments, and bookings.",
    href: "/admin/time-slots",
    tourEvent: "timeslots",
    steps: [
      {
        title: "Create a slot",
        body: "Time Slots → Add Slot. Pick start/end (12-hour picker), capacity, and assigned trainer. Slots can repeat daily or on specific weekdays.",
      },
      {
        title: "Exactly one trainer per slot",
        body: "Each slot belongs to one trainer. Members pick the slot during PT signup — the trainer is auto-linked to their PT subscription (single source of truth).",
      },
      {
        title: "Capacity caps bookings",
        body: "Once a slot fills, members can't pick it. Adjust capacity anytime — existing bookings are preserved. Use Slot Members to see who's in each window.",
      },
      {
        title: "Notify members of changes",
        body: "Use 'Notify Members' on the Holiday Calendar or Slot detail to send a WhatsApp blast. Pick all members in the slot or use checkboxes.",
      },
      {
        title: "Track utilisation",
        body: "The Analytics sub-tab visualises which slots fill up vs underused so you can rebalance capacity or trainer assignments.",
      },
      {
        title: "Time Filters power dashboard chips",
        body: "Define Morning / Afternoon / Evening windows in Time Filters. They appear as filter chips on the dashboard so you can segment members by training time.",
      },
    ],
    tip: "Changing a trainer on a slot keeps existing PT subscriptions linked to the original trainer until manually re-assigned via the member's profile.",
  },
  {
    id: "analytics",
    icon: ChartBarIcon,
    title: "Analytics",
    summary: "Smart KPIs, growth charts, and AI insights.",
    href: "/admin/analytics",
    tourEvent: "analytics",
    steps: [
      {
        title: "Pick the time window",
        body: "The sticky period selector at the top drives every KPI and chart. Choose 7d / 30d / 90d / YTD or set a custom date range.",
      },
      {
        title: "Smart metric cards",
        body: "Revenue · Total Members · Active · Avg Monthly. Each card carries a sparkline and a delta vs the previous period.",
      },
      {
        title: "AI insights panel",
        body: "Auto-generated highlights: best intervals, anomalies, retention rate. Updates live with the period filter.",
      },
      {
        title: "Revenue trend",
        body: "Line chart of revenue across the window. Hover for the exact bucket total and member-pay split.",
      },
      {
        title: "Member growth & new joins",
        body: "Cumulative growth on the left, fresh joins per interval on the right — spot stagnation or campaign spikes immediately.",
      },
      {
        title: "Trainer & package mix",
        body: "Trainer Performance compares revenue and client headcount per trainer. Package Sales shows your subscription mix over time.",
      },
    ],
    tip: "Charts lazy-load as you scroll for performance. Caching: 30 seconds for live data — use the period selector to refetch.",
  },
  {
    id: "logs",
    icon: ClipboardDocumentListIcon,
    title: "Logs",
    summary: "Audit trails for admin, members, staff, and WhatsApp.",
    href: "/admin/logs",
    tourEvent: "logs",
    steps: [
      {
        title: "Four audit trails",
        body: "Admin / User (member) / Staff / WhatsApp. Every event is timestamped in IST and tied to a user agent + IP for compliance.",
      },
      {
        title: "Admin activity",
        body: "Logins, member edits, payments collected, plan changes, settings updates, WhatsApp blasts. Use this for compliance and debugging.",
      },
      {
        title: "Member activity",
        body: "Self-registration, renewals, profile views, check-ins. Ideal for tracing a specific member's journey end-to-end.",
      },
      {
        title: "Staff activity",
        body: "Who edited which member, who collected which payment, who sent which message. Per-staff filter helps narrow quickly.",
      },
      {
        title: "WhatsApp logs",
        body: "Every outgoing message: template, recipient, status (sent / delivered / failed), and the sender (admin or staff). Useful when reconciling delivery issues.",
      },
    ],
    tip: "Logs are read-only and immutable. Filter by date range to keep result sets fast.",
  },
];

export const GuideDrawer = ({ open, onOpenChange }: GuideDrawerProps) => {
  const navigate = useNavigate();

  const handleGoAndTour = (section: GuideSection) => {
    if (!section.href) return;
    onOpenChange(false);
    setTimeout(() => {
      navigate(section.href!);
      if (section.tourEvent) {
        // Wait for the destination page to mount, then fire the replay event.
        setTimeout(() => {
          window.dispatchEvent(
            new Event(`gymkloud:tour:${section.tourEvent}:replay`)
          );
        }, 450);
      }
    }, 80);
  };

  const handleReplay = () => {
    resetAllCoachmarks();
    window.dispatchEvent(new Event("gymkloud:tour:dashboard:replay"));
    toast.success("Tour restarted", {
      description: "The guided dashboard tour and tips will appear again.",
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
            <Accordion type="single" collapsible defaultValue="dashboard" className="space-y-2">
              {SECTIONS.map((section, idx) => {
                const Icon = section.icon;
                return (
                  <AccordionItem
                    key={section.id}
                    value={section.id}
                    className={cn(
                      "rounded-lg border border-border/40 bg-card overflow-hidden",
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
                          onClick={() => handleGoAndTour(section)}
                          className="mt-3 h-8 w-full gap-1.5 rounded-lg text-xs"
                        >
                          {section.tourEvent ? (
                            <>
                              <PlayCircleIcon className="h-3.5 w-3.5" />
                              Take me there & start tour
                            </>
                          ) : (
                            <>
                              Take me there
                              <ArrowRightIcon className="h-3 w-3" />
                            </>
                          )}
                        </Button>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {/* Footer card */}
            <div className="mt-4 rounded-lg border border-border/40 bg-muted/30 p-3">
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
