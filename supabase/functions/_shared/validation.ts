/**
 * Shared validation schemas and utilities for edge functions
 * 
 * This module provides Zod-based validation for all edge function inputs,
 * ensuring proper input sanitization and type safety.
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

// ============================================================================
// Base schemas for reusable validations
// ============================================================================

export const UUIDSchema = z.string().uuid("Invalid UUID format");

export const PhoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Invalid phone format: must be 10 digits starting with 6-9");

export const CleanedPhoneSchema = z
  .string()
  .transform((val) => val.replace(/\D/g, "").replace(/^0/, ""))
  .pipe(PhoneSchema);

export const EmailSchema = z
  .string()
  .email("Invalid email format")
  .max(255, "Email too long")
  .optional()
  .nullable();

export const NameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be less than 100 characters")
  .regex(/^[a-zA-Z\s.'\-]+$/, "Name contains invalid characters");

export const AmountSchema = z
  .number()
  .positive("Amount must be positive")
  .max(10000000, "Amount exceeds maximum limit");

export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");

export const NotesSchema = z
  .string()
  .max(1000, "Notes too long")
  .optional()
  .nullable();

export const DescriptionSchema = z
  .string()
  .min(1, "Description required")
  .max(500, "Description too long");

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password too long");

export const WeakPasswordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .max(128, "Password too long");

// ============================================================================
// Staff Auth Schemas
// ============================================================================

export const LoginSchema = z.object({
  phone: CleanedPhoneSchema,
  password: z.string().min(1, "Password required").max(128, "Password too long"),
});

export const SetPasswordSchema = z.object({
  staffId: UUIDSchema,
  password: WeakPasswordSchema,
  sendWhatsApp: z.boolean().optional(),
});

export const RevokeSessionsSchema = z.object({
  staffId: UUIDSchema,
});

// ============================================================================
// Staff Operations Schemas
// ============================================================================

export const UpdateGymSettingsSchema = z.object({
  settingsId: UUIDSchema,
  branchId: UUIDSchema,
  gymName: z.string().min(2).max(100).optional(),
  gymPhone: z.string().max(20).optional().nullable(),
  gymAddress: z.string().max(500).optional().nullable(),
  whatsappEnabled: z.boolean().optional(),
});

export const ToggleWhatsAppSchema = z.object({
  settingsId: UUIDSchema,
  branchId: UUIDSchema,
  enabled: z.boolean(),
});

export const AddMonthlyPackageSchema = z.object({
  branchId: UUIDSchema,
  months: z.number().int().min(1).max(36),
  price: AmountSchema,
  joiningFee: z.number().min(0).max(100000).optional(),
});

export const UpdateMonthlyPackageSchema = z.object({
  packageId: UUIDSchema,
  branchId: UUIDSchema,
  months: z.number().int().min(1).max(36).optional(),
  price: AmountSchema.optional(),
  joiningFee: z.number().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

export const DeleteMonthlyPackageSchema = z.object({
  packageId: UUIDSchema,
  branchId: UUIDSchema,
});

export const AddCustomPackageSchema = z.object({
  branchId: UUIDSchema,
  name: z.string().min(2).max(100),
  durationDays: z.number().int().min(1).max(365),
  price: AmountSchema,
});

export const UpdateCustomPackageSchema = z.object({
  packageId: UUIDSchema,
  branchId: UUIDSchema,
  name: z.string().min(2).max(100).optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
  price: AmountSchema.optional(),
  isActive: z.boolean().optional(),
});

export const DeleteCustomPackageSchema = z.object({
  packageId: UUIDSchema,
  branchId: UUIDSchema,
});

export const UpdateBranchSchema = z.object({
  branchId: UUIDSchema,
  name: z.string().min(2).max(100).optional(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: EmailSchema,
});

export const AddCashPaymentSchema = z.object({
  branchId: UUIDSchema,
  memberId: UUIDSchema,
  amount: AmountSchema,
  notes: NotesSchema,
  paymentType: z.enum(["gym_membership", "pt_only", "gym_and_pt", "joining_fee", "other"]).optional(),
});

export const UpdateMemberSchema = z.object({
  branchId: UUIDSchema,
  memberId: UUIDSchema,
  name: z.string().min(2).max(100).optional(),
  email: EmailSchema,
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  photoIdType: z.string().max(50).optional().nullable(),
  photoIdNumber: z.string().max(50).optional().nullable(),
  dateOfBirth: DateSchema.optional().nullable(),
});

export const AddLedgerEntrySchema = z.object({
  branchId: UUIDSchema,
  entryType: z.enum(["income", "expense"]),
  category: z.string().min(1).max(100),
  amount: AmountSchema,
  description: DescriptionSchema,
  notes: NotesSchema,
  entryDate: DateSchema.optional(),
});

export const DeleteLedgerEntrySchema = z.object({
  branchId: UUIDSchema,
  entryId: UUIDSchema,
});

// ============================================================================
// Send WhatsApp Schemas
// ============================================================================

export const StaffCredentialsSchema = z.object({
  staffName: z.string().min(2).max(100),
  staffPhone: z.string().min(10).max(15),
  password: z.string().max(128).optional(),
  role: z.string().max(50).optional(),
  branches: z.array(z.string()).optional(),
});

export const SendWhatsAppSchema = z.object({
  memberIds: z.array(UUIDSchema).optional(),
  dailyPassUserIds: z.array(UUIDSchema).optional(),
  dailyPassUserId: UUIDSchema.optional(),
  type: z.enum([
    "expiring_2days", "expiring_today", "manual", "renewal", 
    "pt_extension", "promotional", "expiry_reminder", "expired_reminder",
    "payment_details", "custom", "new_member", "new_registration",
    "daily_pass", "staff_credentials"
  ]).optional(),
  customMessage: z.string().max(2000).optional(),
  isManual: z.boolean().optional(),
  adminUserId: UUIDSchema.optional().nullable(),
  branchId: UUIDSchema.optional(),
  branchName: z.string().max(100).optional(),
  phone: z.string().min(10).max(15).optional(),
  name: z.string().min(2).max(100).optional(),
  endDate: DateSchema.optional(),
  staffCredentials: StaffCredentialsSchema.optional(),
});

// ============================================================================
// Validation Helper
// ============================================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: z.ZodIssue[];
}

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const firstError = result.error.issues[0];
  const errorMessage = `${firstError.path.join(".")}: ${firstError.message}`;
  
  return {
    success: false,
    error: errorMessage,
    details: result.error.issues,
  };
}

/**
 * Create an error response for validation failures
 */
export function validationErrorResponse(
  error: string,
  corsHeaders: Record<string, string>,
  details?: z.ZodIssue[]
): Response {
  return new Response(
    JSON.stringify({ 
      error: `Validation failed: ${error}`,
      details: details?.map(d => ({ path: d.path.join("."), message: d.message }))
    }),
    { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
}
