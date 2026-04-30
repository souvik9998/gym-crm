import type { TourStep } from "./PageTour";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Click the matching tab trigger so the relevant TabsContent is shown
 *  before the tour anchor is measured. Safe no-op if not found. */
const clickTab = (selector: string) => () => {
  const el = document.querySelector<HTMLElement>(selector);
  if (el) el.click();
};

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */
export const DASHBOARD_STEPS: TourStep[] = [
  {
    selector: "[data-tour='stats-grid']",
    title: "Live gym stats",
    description:
      "Total Members · Active · Expiring Soon (next 7 days) · This Month's Revenue. Refreshes every 30 seconds — tap a card to filter the table below.",
    side: "bottom",
  },
  {
    selector: "[data-tour='tabs-list']",
    title: "Switch what you're managing",
    description:
      "Members are full subscribers. Daily Passes are walk-ins (excluded from member counts). Payments shows every transaction across both. Daily Activity tracks check-ins.",
    side: "bottom",
  },
  {
    selector: "[data-tour='search']",
    title: "Find anyone in seconds",
    description:
      "Search by name or 10-digit phone — fuzzy matching is enabled. Works across the active tab (members or daily passes).",
    side: "bottom",
  },
  {
    selector: "[data-tour='filters']",
    title: "Filter & segment",
    description:
      "Narrow down by status (Active / Expiring / Expired), assigned trainer, time slot, or time-of-day bucket. Combine filters for precise lists.",
    side: "bottom",
  },
  {
    selector: "[data-tour='export']",
    title: "Export to Excel",
    description:
      "Download the current tab as an .xlsx file. Filters and search are respected — perfect for accounting or sharing with your team.",
    side: "bottom",
  },
  {
    selector: "[data-tour='add-member']",
    title: "Add a new member",
    description:
      "Opens a 4-step wizard: phone (login id) → personal details → plan & PT → payment mode. Duplicates are auto-detected.",
    side: "bottom",
  },
];

/* ------------------------------------------------------------------ */
/*  Settings — keep existing detailed walk-through                     */
/* ------------------------------------------------------------------ */
export const SETTINGS_STEPS: TourStep[] = [
  {
    selector: "[data-tour='settings-tabs']",
    title: "Everything is configurable",
    description:
      "Use these tabs to manage Packages, Registration fields, Assessment, WhatsApp, General gym info, Coupons, Subscription and Backup — each tab saves independently.",
    side: "bottom",
  },
  {
    selector: "[data-tour='settings-tab-packages']",
    title: "Packages = your pricing",
    description:
      "Create monthly or custom-day plans. Set price, joining fee and active flag. Plans surface in the Add Member wizard and public registration.",
    side: "bottom",
  },
  {
    selector: "[data-tour='settings-tab-registration']",
    title: "Registration fields",
    description:
      "Toggle which fields members fill during self-registration. Includes the 'Member Self-Select Trainer' switch for PT-led signups.",
    side: "bottom",
  },
  {
    selector: "[data-tour='settings-tab-assessment']",
    title: "Assessment fields",
    description:
      "Configure the on-onboarding fitness assessment captured per member — height, weight, goals, medical notes, etc.",
    side: "bottom",
  },
  {
    selector: "[data-tour='settings-tab-whatsapp']",
    title: "WhatsApp automations",
    description:
      "Set message templates, the daily reminder time (default 9 AM IST) and which events trigger an auto-message: registration, renewal, expiry, payment.",
    side: "bottom",
  },
  {
    selector: "[data-tour='settings-tab-general']",
    title: "Gym profile",
    description:
      "Branch name, logo, contact details, address. This data appears on invoices, public registration and WhatsApp messages.",
    side: "bottom",
  },
  {
    selector: "[data-tour='settings-tab-coupons']",
    title: "Coupons & discounts",
    description:
      "Create promo codes (percentage or flat off) with validity windows and usage caps. Members enter them at checkout.",
    side: "bottom",
  },
];

/* ------------------------------------------------------------------ */
/*  Time Slots — detailed walkthrough per sub-tab                      */
/* ------------------------------------------------------------------ */
export const TIMESLOTS_STEPS: TourStep[] = [
  {
    selector: "[data-tour='timeslots-tabs']",
    title: "Four areas of slot control",
    description:
      "This page is split into four tabs. We'll walk through each one so you know exactly what to manage where — Time Slots, Slot Members, Analytics and Time Filters.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='timeslots-tab-slots']"),
  },
  {
    selector: "[data-tour='timeslots-tab-slots']",
    title: "1 · Time Slots — your schedule",
    description:
      "This is where you create the actual time blocks (e.g. 6–7 AM Cardio with Trainer Raj). Each slot has a start/end time, a capacity cap and an assigned trainer. Members can only be booked into existing slots.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='timeslots-tab-slots']"),
  },
  {
    selector: "[data-tour='timeslots-tab-slots']",
    title: "Editing & deleting slots",
    description:
      "Click any slot to edit its time, capacity or trainer. Deleting a slot is blocked if members are still booked in it — reassign them first from the Slot Members tab.",
    side: "bottom",
  },
  {
    selector: "[data-tour='timeslots-tab-members']",
    title: "2 · Slot Members — who trains when",
    description:
      "Switch here to see every member booked into each slot. You can move a member between slots, remove them, or send a WhatsApp blast to the whole slot in one click.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='timeslots-tab-members']"),
  },
  {
    selector: "[data-tour='timeslots-tab-members']",
    title: "PT subscription badges",
    description:
      "Each member row shows their PT subscription status. Expired PTs appear red — that's your cue to renew them or move them out of trainer-led slots.",
    side: "bottom",
  },
  {
    selector: "[data-tour='timeslots-tab-analytics']",
    title: "3 · Analytics — utilisation & gaps",
    description:
      "See which slots are overflowing and which are half-empty. Use this to spot the right time to add a new slot, increase capacity, or reassign a trainer.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='timeslots-tab-analytics']"),
  },
  {
    selector: "[data-tour='timeslots-tab-filters']",
    title: "4 · Time Filters — peak / off-peak buckets",
    description:
      "Define Morning / Afternoon / Evening windows. These power the time-of-day filter chips on the dashboard, so you can quickly segment members by when they train.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='timeslots-tab-filters']"),
  },
];

/* ------------------------------------------------------------------ */
/*  Staff Control — detailed walkthrough per tab                       */
/* ------------------------------------------------------------------ */
export const STAFF_STEPS: TourStep[] = [
  {
    selector: "[data-tour='staff-tabs']",
    title: "Three views of your team",
    description:
      "Trainers (PT-eligible) · Other Staff (managers, receptionists, accountants) · Overview (totals + payouts). Switching tabs preserves all your in-tab state.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='staff-tab-trainers']"),
  },
  {
    selector: "[data-tour='staff-tab-trainers']",
    title: "1 · Trainers — your PT roster",
    description:
      "Add trainers, set their salary type (monthly / per-session / percentage / hybrid) and their revenue split. Only people listed here can be assigned as a PT to a member or a time slot.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='staff-tab-trainers']"),
  },
  {
    selector: "[data-tour='staff-tab-trainers']",
    title: "Permissions & member access",
    description:
      "Each trainer has 9 togglable permissions (Members, Payments, Daily Pass, Attendance, WhatsApp, Settings, Time Slots, Analytics, Ledger) plus a Member Access switch — 'All Members' or 'Only Assigned'.",
    side: "bottom",
  },
  {
    selector: "[data-tour='staff-tab-other']",
    title: "2 · Other Staff — non-trainer roles",
    description:
      "Managers, receptionists and accountants live here. Same permission model as trainers — toggle exactly what each role can see and do, without giving anyone full admin rights.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='staff-tab-other']"),
  },
  {
    selector: "[data-tour='staff-tab-other']",
    title: "Login credentials & multi-branch",
    description:
      "Set a staff password from the row menu — they log in at /admin/login with their phone. Staff working at multiple branches see all assigned branches in their branch switcher.",
    side: "bottom",
  },
  {
    selector: "[data-tour='staff-tab-overview']",
    title: "3 · Overview — headcount & payouts",
    description:
      "Total trainers/staff, total paid-out this period and a per-staff payout breakdown. Click any staff row to drill into the exact sessions and renewals counted toward their pay.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='staff-tab-overview']"),
  },
];

/* ------------------------------------------------------------------ */
/*  Analytics — detailed walkthrough                                   */
/* ------------------------------------------------------------------ */
export const ANALYTICS_STEPS: TourStep[] = [
  {
    selector: "[data-tour='analytics-period']",
    title: "Pick the time window",
    description:
      "Every chart and KPI on this page reacts to this period. Pick a preset (7d / 30d / 90d / YTD / All time) or set a custom date range. The bar stays sticky as you scroll so you can re-pivot anytime.",
    side: "bottom",
  },
  {
    selector: "[data-tour='analytics-kpis']",
    title: "Smart metric cards",
    description:
      "Total Revenue · Total Members · Active Members · Avg Monthly. Each card has a sparkline showing the trend through your selected window plus a delta vs the previous half of the period.",
    side: "bottom",
  },
  {
    selector: "[data-tour='analytics-kpis']",
    title: "Active vs Total",
    description:
      "Active = currently within their subscription end date. Total = lifetime registrations including expired. The gap between these two is your churn signal — watch it widen or narrow.",
    side: "bottom",
  },
  {
    selector: "[data-tour='analytics-insights']",
    title: "AI insights — auto-generated",
    description:
      "Up to 4 auto-generated highlights: revenue direction, peak interval, member-acquisition trend and your active-member rate. Updates instantly when you change the period.",
    side: "top",
  },
  {
    selector: "[data-tour='analytics-revenue']",
    title: "Revenue trend",
    description:
      "Line chart of revenue across the period. Hover any point to see the exact bucket revenue and number of payments. Granularity (day / week / month / year) auto-adjusts to the period length.",
    side: "top",
  },
  {
    selector: "[data-tour='analytics-growth']",
    title: "Member growth & new joins",
    description:
      "Left chart shows cumulative members over time — your overall scale. Right chart shows fresh joins per interval — your acquisition rhythm. Use them together to spot stagnation or campaign spikes.",
    side: "top",
  },
];

/* ------------------------------------------------------------------ */
/*  Logs — detailed walkthrough                                        */
/* ------------------------------------------------------------------ */
export const LOGS_STEPS: TourStep[] = [
  {
    selector: "[data-tour='logs-tabs']",
    title: "Four audit trails",
    description:
      "Admin · User · Staff · WhatsApp. Every entry is timestamped in IST and tied to a user agent + IP — useful for compliance, debugging and reconciling 'who did what'.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='logs-tab-activity']"),
  },
  {
    selector: "[data-tour='logs-tab-activity']",
    title: "1 · Admin activity",
    description:
      "Every action you or another admin took: logins, member edits, payments collected, plan changes, WhatsApp blasts, settings updates. Filter by date or action type to investigate any change.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='logs-tab-activity']"),
  },
  {
    selector: "[data-tour='logs-tab-user']",
    title: "2 · User (member) activity",
    description:
      "Member-facing events: self-registration, online renewals, profile views and check-ins. Open any row to trace a specific member's full timeline with you.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='logs-tab-user']"),
  },
  {
    selector: "[data-tour='logs-tab-staff']",
    title: "3 · Staff activity",
    description:
      "What your trainers, receptionists and managers did — who edited which member, who collected which payment, who sent which message. Each entry includes the staff member's resolved name and phone.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='logs-tab-staff']"),
  },
  {
    selector: "[data-tour='logs-tab-whatsapp']",
    title: "4 · WhatsApp logs",
    description:
      "Every outgoing message: template used, recipient, sender (admin or staff) and delivery status (sent / delivered / failed). The first place to look when a member says 'I never got the message'.",
    side: "bottom",
    beforeShow: clickTab("[data-tour='logs-tab-whatsapp']"),
  },
];
