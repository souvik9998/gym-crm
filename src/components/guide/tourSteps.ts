import type { TourStep } from "./PageTour";

/** Dashboard — already wired up with `data-tour` anchors. */
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

/** Settings — full walk-through of every configurable area. */
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

/** Time Slots — sub-tabs of the dedicated Time Slots page. */
export const TIMESLOTS_STEPS: TourStep[] = [
  {
    selector: "[data-tour='timeslots-tabs']",
    title: "Four areas of slot control",
    description:
      "Time Slots (create/edit) · Slot Members (who's in each slot) · Analytics (utilisation) · Time Filters (peak/off-peak buckets).",
    side: "bottom",
  },
  {
    selector: "[data-tour='timeslots-tab-slots']",
    title: "Create & manage slots",
    description:
      "Pick start/end time, capacity, and the assigned trainer. Slots can repeat daily or on specific weekdays. Capacity caps bookings automatically.",
    side: "bottom",
  },
  {
    selector: "[data-tour='timeslots-tab-members']",
    title: "Who's booked into each slot",
    description:
      "See every member booked in a slot, their PT subscription status, and check-in record. Send a WhatsApp blast to the whole slot from here.",
    side: "bottom",
  },
  {
    selector: "[data-tour='timeslots-tab-analytics']",
    title: "Slot utilisation",
    description:
      "Visualise which slots are filling up vs underused so you can rebalance capacity or trainer assignments.",
    side: "bottom",
  },
  {
    selector: "[data-tour='timeslots-tab-filters']",
    title: "Time-of-day buckets",
    description:
      "Define Morning / Afternoon / Evening windows. These power the filter chips on the dashboard so you can segment members by when they train.",
    side: "bottom",
  },
];

/** Staff Control — Trainers / Other Staff / Overview tabs. */
export const STAFF_STEPS: TourStep[] = [
  {
    selector: "[data-tour='staff-tabs']",
    title: "Three views of your team",
    description:
      "Trainers (PT-eligible) · Other Staff (managers, receptionists) · Overview (totals + payouts). Switch tabs without losing search or filters.",
    side: "bottom",
  },
  {
    selector: "[data-tour='staff-tab-trainers']",
    title: "Trainers tab",
    description:
      "Add trainers, set their revenue split %, configure 9 granular permissions, and switch their Member Access between 'All' and 'Assigned-only'.",
    side: "bottom",
  },
  {
    selector: "[data-tour='staff-tab-other']",
    title: "Other staff",
    description:
      "Managers and receptionists. Same permission model as trainers — toggle Members, Payments, Daily Pass, WhatsApp send and Settings access individually.",
    side: "bottom",
  },
  {
    selector: "[data-tour='staff-tab-overview']",
    title: "Overview & payouts",
    description:
      "Headcount totals, total paid out to staff this period, and quick links into each member's payout breakdown.",
    side: "bottom",
  },
];

/** Analytics — sticky filter bar, KPIs, and chart sections. */
export const ANALYTICS_STEPS: TourStep[] = [
  {
    selector: "[data-tour='analytics-period']",
    title: "Pick the time window",
    description:
      "Every chart and KPI on this page reacts to this period. Pick a preset (7d / 30d / 90d / YTD) or set a custom date range — sticky as you scroll.",
    side: "bottom",
  },
  {
    selector: "[data-tour='analytics-kpis']",
    title: "Smart metric cards",
    description:
      "Revenue · Total Members · Active Members · Avg Monthly. Each card includes a sparkline and a delta vs the previous period.",
    side: "bottom",
  },
  {
    selector: "[data-tour='analytics-insights']",
    title: "AI insights",
    description:
      "Auto-generated highlights: best-performing intervals, anomalies, retention rate. Updates live as filters change.",
    side: "top",
  },
  {
    selector: "[data-tour='analytics-revenue']",
    title: "Revenue trend",
    description:
      "Line chart of revenue across the selected window. Hover any point for the exact bucket total and member-pay split.",
    side: "top",
  },
  {
    selector: "[data-tour='analytics-growth']",
    title: "Member growth & new joins",
    description:
      "Cumulative growth on the left, fresh joins per interval on the right. Spot stagnation or campaign spikes at a glance.",
    side: "top",
  },
];

/** Logs — Admin / User / Staff / WhatsApp activity tabs. */
export const LOGS_STEPS: TourStep[] = [
  {
    selector: "[data-tour='logs-tabs']",
    title: "Four audit trails",
    description:
      "Admin actions · User (member) activity · Staff activity · WhatsApp send history. Everything is timestamped in IST and tied to a user agent + IP.",
    side: "bottom",
  },
  {
    selector: "[data-tour='logs-tab-activity']",
    title: "Admin activity",
    description:
      "Every action you or another admin took: logins, member edits, payments, plan changes, WhatsApp blasts, settings updates. Use for compliance & debugging.",
    side: "bottom",
  },
  {
    selector: "[data-tour='logs-tab-user']",
    title: "Member activity",
    description:
      "Member-facing events: self-registration, renewals, profile views, check-ins. Ideal for tracing a specific member's journey.",
    side: "bottom",
  },
  {
    selector: "[data-tour='logs-tab-staff']",
    title: "Staff activity",
    description:
      "What your trainers and receptionists did — who edited which member, who collected which payment, who sent which message.",
    side: "bottom",
  },
  {
    selector: "[data-tour='logs-tab-whatsapp']",
    title: "WhatsApp logs",
    description:
      "Every outgoing message: template used, recipient, status (sent / delivered / failed), and the sender (admin or staff). Useful when reconciling delivery issues.",
    side: "bottom",
  },
];
