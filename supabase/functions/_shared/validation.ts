/**
 * Shared validation schemas and utilities for edge functions
 * 
 * This module provides Zod-based validation for all edge function inputs,
 * ensuring proper input sanitization and type safety.
 */

import { z } from "npm:zod@3.25.76";

// ============================================================================
// Security: Injection Detection & Sanitization
// ============================================================================

/** Maximum allowed request body size (100KB) */
export const MAX_PAYLOAD_SIZE = 100 * 1024;

/** SQL injection patterns */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|UNION|INTO)\b\s)/i,
  /(--|\/\*|\*\/|;--)/,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
  /(\bAND\b\s+\d+\s*=\s*\d+)/i,
  /(xp_|sp_|0x[0-9a-f]+)/i,
];

/** XSS / Script injection patterns */
const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on(error|load|click|mouseover|focus|blur)\s*=/i,
  /<\s*(iframe|object|embed|form|svg|img\s+[^>]*onerror)/i,
  /data\s*:\s*text\/html/i,
  /expression\s*\(/i,
  /url\s*\(\s*['"]*\s*javascript/i,
];

/**
 * Check if a string contains injection patterns.
 * Returns the type of injection detected, or null if clean.
 */
export function detectInjection(value: string): "sql" | "xss" | null {
  if (typeof value !== "string") return null;
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) return "sql";
  }
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) return "xss";
  }
  return null;
}

/**
 * Deep-scan an object for injection patterns in all string values.
 * Returns the first detected injection type and path, or null if clean.
 */
export function deepScanForInjection(
  obj: unknown,
  path = ""
): { type: "sql" | "xss"; path: string } | null {
  if (typeof obj === "string") {
    const injection = detectInjection(obj);
    if (injection) return { type: injection, path };
    return null;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = deepScanForInjection(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
    return null;
  }
  if (obj && typeof obj === "object") {
    for (const [key, val] of Object.entries(obj)) {
      const result = deepScanForInjection(val, path ? `${path}.${key}` : key);
      if (result) return result;
    }
  }
  return null;
}

/** Strip HTML tags and dangerous characters from a string */
export function sanitizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;|&gt;|&amp;|&quot;|&#x27;/g, "")
    .trim();
}

/**
 * Safely parse a request body with size limit and injection scanning.
 * Returns parsed body or throws with descriptive error.
 */
export async function parseAndValidateBody(
  req: Request,
  maxSize: number = MAX_PAYLOAD_SIZE
): Promise<Record<string, unknown>> {
  const rawText = await req.text();
  
  // Check payload size
  if (rawText.length > maxSize) {
    throw new PayloadTooLargeError(
      `Request body too large: ${rawText.length} bytes (max ${maxSize})`
    );
  }
  
  if (!rawText || !rawText.trim()) return {};
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ValidationError("Invalid JSON in request body");
  }
  
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError("Request body must be a JSON object");
  }
  
  // Deep scan for injection attacks
  const injection = deepScanForInjection(parsed);
  if (injection) {
    throw new InjectionDetectedError(
      `Potential ${injection.type.toUpperCase()} injection detected in field: ${injection.path}`
    );
  }
  
  return parsed as Record<string, unknown>;
}

/** Custom error classes for structured error handling */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

export class InjectionDetectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InjectionDetectedError";
  }
}

/**
 * Handle security errors and return appropriate HTTP responses.
 */
export function handleSecurityError(
  error: unknown,
  corsHeaders: Record<string, string>
): Response | null {
  if (error instanceof PayloadTooLargeError) {
    return new Response(
      JSON.stringify({ error: "Request too large" }),
      { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (error instanceof InjectionDetectedError) {
    return new Response(
      JSON.stringify({ error: "Request rejected: suspicious content detected" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (error instanceof ValidationError) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  return null;
}

// ============================================================================
// Sanitizing Zod transforms
// ============================================================================

/** A Zod string transform that strips HTML/script tags */
const sanitizedString = (minLen = 0, maxLen = 500) =>
  z.string()
    .transform(sanitizeText)
    .pipe(z.string().min(minLen).max(maxLen));

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
  .transform(sanitizeText)
  .pipe(
    z.string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be less than 100 characters")
      .regex(/^[a-zA-Z\s.'\-]+$/, "Name contains invalid characters")
  );

export const AmountSchema = z
  .number()
  .positive("Amount must be positive")
  .max(10000000, "Amount exceeds maximum limit");

export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");

export const NotesSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(1000, "Notes too long"))
  .optional()
  .nullable();

export const DescriptionSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(
    z.string()
      .min(1, "Description required")
      .max(500, "Description too long")
  );

/**
 * Strong password rule for staff accounts (must match the client-side
 * `passwordSchema` in src/lib/validation.ts):
 *   - Min 8 characters
 *   - At least 1 uppercase, 1 lowercase, 1 digit
 */
export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password too long")
  .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
  .regex(/[a-z]/, "Password must contain at least 1 lowercase letter")
  .regex(/\d/, "Password must contain at least 1 number");

/** Used only for tenant owner provisioning where rules predate the staff rule. */
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
  password: PasswordSchema,
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
    "daily_pass", "staff_credentials", "event_registration", "event_confirmation"
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
  eventDetails: z.object({
    title: z.string().max(200),
    date: z.string().max(100),
    time: z.string().max(50),
    venue: z.string().max(200),
    amount: z.union([z.string(), z.number()]),
  }).optional(),
});

// ============================================================================
// Tenant Operations Schemas
// ============================================================================

export const CreateTenantSchema = z.object({
  name: z.string().transform(sanitizeText).pipe(z.string().min(2).max(100)),
  slug: z.string().regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens").max(50),
  email: EmailSchema,
  phone: z.string().max(20).optional().nullable(),
  ownerEmail: z.string().email("Invalid owner email").max(255),
  ownerPassword: z.string().min(6).max(128),
  limits: z.object({
    maxBranches: z.number().int().min(1).max(100).optional(),
    maxStaffPerBranch: z.number().int().min(1).max(100).optional(),
    maxMembers: z.number().int().min(1).max(100000).optional(),
    maxTrainers: z.number().int().min(1).max(500).optional(),
    maxMonthlyWhatsAppMessages: z.number().int().min(0).max(100000).optional(),
    maxMonthlyCheckins: z.number().int().min(0).max(1000000).optional(),
    maxStorageMb: z.number().int().min(0).max(100000).optional(),
    planExpiryDate: DateSchema.optional().nullable(),
    features: z.record(z.boolean()).optional(),
  }).optional(),
});

export const OwnerCreateBranchSchema = z.object({
  name: z.string().transform(sanitizeText).pipe(z.string().min(2).max(100)),
  address: z.string().transform(sanitizeText).pipe(z.string().max(500)).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: EmailSchema,
  isDefault: z.boolean().optional(),
});

export const UpdateTenantLimitsSchema = z.object({
  tenantId: UUIDSchema,
  maxBranches: z.number().int().min(1).max(100).optional(),
  maxStaffPerBranch: z.number().int().min(1).max(100).optional(),
  maxMembers: z.number().int().min(1).max(100000).optional(),
  maxTrainers: z.number().int().min(1).max(500).optional(),
  maxMonthlyWhatsAppMessages: z.number().int().min(0).max(100000).optional(),
  features: z.record(z.boolean()).optional(),
  planExpiryDate: DateSchema.optional().nullable(),
  maxMonthlyCheckins: z.number().int().min(0).max(1000000).optional(),
  maxStorageMb: z.number().int().min(0).max(100000).optional(),
});

export const SuspendTenantSchema = z.object({
  tenantId: UUIDSchema,
  suspend: z.boolean(),
});

// ============================================================================
// Check-in Schemas
// ============================================================================

export const MemberCheckInSchema = z.object({
  phone: CleanedPhoneSchema.optional(),
  device_fingerprint: z.string().max(200).optional(),
  branch_id: UUIDSchema.optional(),
});

export const StaffDeviceCheckInSchema = z.object({
  device_fingerprint: z.string().min(1).max(200),
  branch_id: UUIDSchema.optional(),
});

export const RegisterDeviceSchema = z.object({
  memberId: UUIDSchema.optional(),
  staffId: UUIDSchema.optional(),
  branchId: UUIDSchema,
  deviceFingerprint: z.string().min(1).max(200),
  userType: z.enum(["member", "staff"]),
});

export const ResetDeviceSchema = z.object({
  deviceId: UUIDSchema.optional(),
  memberId: UUIDSchema.optional(),
  staffId: UUIDSchema.optional(),
  branchId: UUIDSchema,
  userType: z.enum(["member", "staff"]).optional(),
});

// ============================================================================
// Verify Razorpay Payment Schema
// ============================================================================

export const VerifyRazorpayPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
  memberId: UUIDSchema.optional().nullable(),
  memberName: z.string().transform(sanitizeText).pipe(z.string().min(2).max(100)),
  memberPhone: z.string().regex(/^[6-9]\d{9}$/, "Invalid phone"),
  amount: z.number().positive().max(1000000),
  months: z.number().int().min(1).max(24).optional().nullable(),
  customDays: z.number().int().min(1).max(365).optional().nullable(),
  trainerId: UUIDSchema.optional().nullable(),
  trainerFee: z.number().min(0).max(500000).optional().nullable(),
  gymFee: z.number().min(0).max(1000000).optional().nullable(),
  ptStartDate: DateSchema.optional().nullable(),
  gymStartDate: DateSchema.optional().nullable(),
  isNewMember: z.boolean().optional(),
  isDailyPass: z.boolean().optional(),
  memberDetails: z.object({
    // Accept both camelCase (from public registration form) and snake_case (legacy/admin) keys
    gender: z.enum(["male", "female", "other"]).optional().nullable(),
    photoIdType: z.string().max(50).optional().nullable(),
    photoIdNumber: z.string().max(50).optional().nullable(),
    photo_id_type: z.string().max(50).optional().nullable(),
    photo_id_number: z.string().max(50).optional().nullable(),
    address: z.string().transform(sanitizeText).pipe(z.string().max(500)).optional().nullable(),
    dateOfBirth: DateSchema.optional().nullable(),
    date_of_birth: DateSchema.optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
    fullName: z.string().max(100).optional().nullable(),
    occupation: z.string().max(100).optional().nullable(),
  }).passthrough().optional().nullable(),
  customPackage: z.object({
    id: UUIDSchema,
    name: z.string().max(100),
    duration_days: z.number().int().min(1).max(365),
    price: z.number().positive().max(1000000),
  }).optional().nullable(),
  joiningFee: z.number().min(0).max(100000).optional().nullable(),
  branchId: UUIDSchema.optional().nullable(),
  skipMemberCreation: z.boolean().optional(),
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
