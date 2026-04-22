import type { TenantFeaturePermissions } from "@/contexts/AuthContext";

export interface CreateTenantLimitsForm {
  maxBranches: number;
  maxStaffPerBranch: number;
  maxMembers: number;
  maxTrainers: number;
  maxWhatsApp: number;
  maxMonthlyCheckins: number;
  maxStorageMb: number;
  planExpiryDate: string;
}

export const defaultTenantFeatures: TenantFeaturePermissions = {
  members_management: true,
  attendance: true,
  attendance_manual: true,
  attendance_qr: true,
  attendance_biometric: false,
  payments_billing: true,
  staff_management: true,
  reports_analytics: true,
  branch_analytics: true,
  event_management: true,
  workout_diet_plans: false,
  notifications: true,
  integrations: true,
  leads_crm: false,
};

export const defaultTenantLimits: CreateTenantLimitsForm = {
  maxBranches: 3,
  maxStaffPerBranch: 10,
  maxMembers: 1000,
  maxTrainers: 20,
  maxWhatsApp: 500,
  maxMonthlyCheckins: 10000,
  maxStorageMb: 500,
  planExpiryDate: "",
};

export const featureGroups = [
  {
    title: "Core Modules",
    items: [
      { key: "members_management", label: "Members Management", description: "Add, edit, and view members" },
      { key: "payments_billing", label: "Payments & Billing", description: "Payments, ledger, and invoices" },
      { key: "staff_management", label: "Staff Management", description: "Manage staff accounts and roles" },
      { key: "notifications", label: "Notifications", description: "Manual and automated WhatsApp messaging" },
      { key: "integrations", label: "Integrations", description: "Payment and external service integrations" },
      { key: "leads_crm", label: "Leads CRM", description: "Lead capture and follow-up workflows" },
    ],
  },
  {
    title: "Attendance Configuration",
    items: [
      { key: "attendance", label: "Attendance Module", description: "Master toggle for attendance features" },
      { key: "attendance_manual", label: "Manual Attendance", description: "Allow staff to mark attendance manually" },
      { key: "attendance_qr", label: "QR Attendance", description: "Enable QR-based check-ins" },
      { key: "attendance_biometric", label: "Biometric Attendance", description: "Enable biometric device support" },
    ],
  },
  {
    title: "Analytics & Programs",
    items: [
      { key: "reports_analytics", label: "Reports & Analytics", description: "Dashboard metrics and business insights" },
      { key: "branch_analytics", label: "Branch Analytics", description: "Cross-branch analytics for multi-branch gyms" },
      { key: "event_management", label: "Event Management", description: "Create and manage events" },
      { key: "workout_diet_plans", label: "Workout & Diet Plans", description: "Training and coaching plans" },
    ],
  },
] as const;

export const usageLimitFields = [
  { key: "maxBranches", label: "Max Branches", min: 1, helper: "A default branch is created automatically." },
  { key: "maxStaffPerBranch", label: "Staff per Branch", min: 1, helper: "Maximum active staff allowed in each branch." },
  { key: "maxMembers", label: "Max Members", min: 1, helper: "Maximum active members across the organization." },
  { key: "maxTrainers", label: "Max Trainers", min: 1, helper: "Maximum active personal trainers." },
  { key: "maxWhatsApp", label: "Monthly WhatsApp", min: 0, helper: "Monthly WhatsApp notification quota." },
  { key: "maxMonthlyCheckins", label: "Monthly Check-ins", min: 0, helper: "Monthly attendance/check-in allowance." },
  { key: "maxStorageMb", label: "Storage (MB)", min: 0, helper: "Shared storage allowance for uploads and assets." },
] as const;