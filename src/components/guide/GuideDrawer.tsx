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
    summary: "Add new members and renew expiring ones.",
    href: "/admin/dashboard?tab=members",
    steps: [
      {
        title: "Click the “Add Member” button",
        body: "Top-right of the Members tab — opens a 4-step wizard.",
      },
      {
        title: "Enter the phone number first",
        body: "Phone is the member’s login & WhatsApp identity. We auto-detect duplicates.",
      },
      {
        title: "Pick a plan",
        body: "Plan duration drives revenue, expiry date, and renewal reminders.",
      },
      {
        title: "Choose payment mode & finish",
        body: "Cash, UPI, or Razorpay link. Invoice + WhatsApp confirmation are sent automatically.",
      },
    ],
    tip: "Members appear instantly. Use the search bar to find anyone by name or phone.",
  },
  {
    id: "staff",
    icon: UserGroupIcon,
    title: "Staff Control",
    summary: "Manage trainers, set permissions, and split revenue.",
    href: "/admin/staff",
    steps: [
      {
        title: "Add a staff member",
        body: "Set name, phone (used for staff login), and role (Trainer / Manager / Receptionist).",
      },
      {
        title: "Toggle granular permissions",
        body: "Per-staff toggles for Members, Payments, Settings, Ledger, WhatsApp, and Analytics.",
      },
      {
        title: "Assign trainers to time slots",
        body: "Trainers are bound to slots — members pick a trainer when joining PT.",
      },
      {
        title: "Configure revenue split",
        body: "Set the trainer’s % cut on PT subscriptions — auto-applied in the ledger.",
      },
    ],
    tip: "Staff sign in at /admin/login using their phone + password. Permissions update instantly.",
  },
  {
    id: "plans",
    icon: CreditCardIcon,
    title: "Plans & Payments",
    summary: "Create membership plans and track every payment.",
    href: "/admin/settings?tab=packages",
    steps: [
      {
        title: "Create monthly & custom plans",
        body: "Settings → Packages. Set duration, price, and an optional joining fee.",
      },
      {
        title: "Check live payments",
        body: "Dashboard → Payments tab shows every payment with date, mode, and member.",
      },
      {
        title: "Open the Ledger for full books",
        body: "Ledger view splits income vs expense, with trainer-split breakdown.",
      },
      {
        title: "Export anytime",
        body: "Use the download icon on Members or Payments to export to Excel.",
      },
    ],
    tip: "Razorpay payments auto-reconcile via webhook — no manual entry needed.",
  },
  {
    id: "timeslots",
    icon: ClockIcon,
    title: "Time Slots",
    summary: "Define gym hours and assign trainers to slots.",
    href: "/admin/staff?tab=time-slots",
    steps: [
      {
        title: "Create a slot",
        body: "Staff → Time Slots → Add Slot. Pick start/end time and capacity.",
      },
      {
        title: "Assign a trainer",
        body: "Each slot belongs to one trainer. Members choose the slot during PT signup.",
      },
      {
        title: "Track attendance per slot",
        body: "Slot Members tab shows who’s booked into each window.",
      },
    ],
    tip: "Capacity caps how many members can pick a slot. Adjust anytime — bookings stay intact.",
  },
  {
    id: "dashboard",
    icon: ChartBarIcon,
    title: "Dashboard",
    summary: "The “Recommended Next Step” card shows what to do next.",
    href: "/admin/dashboard",
    steps: [
      {
        title: "Watch the four KPI tiles",
        body: "Total Members, Active, Expiring Soon, This Month’s Revenue — refreshed live.",
      },
      {
        title: "Use the Recommended Next Step widget",
        body: "Appears when setup is incomplete — guides you to add a plan, trainer, or first member.",
      },
      {
        title: "Switch tabs for context",
        body: "Members · Payments · Daily Pass · Daily Activity — all share the same date range.",
      },
    ],
    tip: "Click the refresh icon (top right) to re-pull the latest numbers without a page reload.",
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
