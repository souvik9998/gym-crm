import { z } from "zod";

// ─── Sanitization helpers ───────────────────────────────────────────────

/** Strip HTML/script tags and trim whitespace */
export function sanitize(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")        // Remove HTML tags
    .replace(/&lt;|&gt;|&amp;/g, "") // Remove encoded entities
    .trim();
}

/** Strip non-digit characters */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

// ─── Zod schemas for reusable field validation ──────────────────────────

/** Name: alphabets, spaces, dots, and apostrophes only */
export const nameSchema = z
  .string()
  .transform(sanitize)
  .pipe(
    z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be less than 100 characters")
      .regex(/^[a-zA-Z\s.']+$/, "Name can only contain letters, spaces, dots, and apostrophes")
  );

/** Indian 10-digit mobile: starts with 6-9 */
export const phoneSchema = z
  .string()
  .transform((v) => digitsOnly(v).slice(0, 10))
  .pipe(
    z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number")
  );

/** Email: proper format */
export const emailSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z
      .string()
      .email("Enter a valid email address (e.g. example@domain.com)")
      .max(255, "Email must be less than 255 characters")
  );

/** Optional email (empty string allowed) */
export const optionalEmailSchema = z
  .string()
  .optional()
  .transform((v) => (v ? v.trim().toLowerCase() : ""))
  .pipe(
    z
      .string()
      .refine(
        (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        "Enter a valid email address (e.g. example@domain.com)"
      )
  );

/** Aadhaar: exactly 12 digits */
export const aadhaarSchema = z
  .string()
  .transform((v) => digitsOnly(v))
  .pipe(
    z
      .string()
      .regex(/^\d{12}$/, "Aadhaar number must be exactly 12 digits")
  );

/** PAN: 5 letters + 4 digits + 1 letter */
export const panSchema = z
  .string()
  .transform((v) => v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN number (e.g. ABCDE1234F)")
  );

/** Voter ID: 3 letters + 7 digits */
export const voterIdSchema = z
  .string()
  .transform((v) => v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z]{3}\d{7}$/, "Enter a valid Voter ID (e.g. ABC1234567)")
  );

/** Password: min 8 chars, 1 upper, 1 lower, 1 number */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
  .regex(/[a-z]/, "Password must contain at least 1 lowercase letter")
  .regex(/\d/, "Password must contain at least 1 number");

/** Amount: positive, max 2 decimals */
export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" ? parseFloat(v) : v))
  .pipe(
    z
      .number({ invalid_type_error: "Enter a valid amount" })
      .positive("Amount must be greater than 0")
      .max(10_000_000, "Amount cannot exceed ₹1,00,00,000")
      .refine(
        (v) => Number.isFinite(v) && Math.round(v * 100) === v * 100,
        "Amount can have at most 2 decimal places"
      )
  );

/** Address: sanitized text, max 500 chars */
export const addressSchema = z
  .string()
  .transform(sanitize)
  .pipe(
    z
      .string()
      .min(3, "Address must be at least 3 characters")
      .max(500, "Address must be less than 500 characters")
  );

/** Generic text: sanitized, max length */
export const safeTextSchema = (maxLength = 500) =>
  z
    .string()
    .transform(sanitize)
    .pipe(z.string().max(maxLength, `Must be less than ${maxLength} characters`));

// ─── Photo ID validation (dynamic based on type) ───────────────────────

export function getPhotoIdSchema(idType: string) {
  switch (idType) {
    case "aadhaar":
      return aadhaarSchema;
    case "pan":
      return panSchema;
    case "voter":
      return voterIdSchema;
    default:
      return z.string().min(1, "Enter ID number");
  }
}

// ─── Date validation helpers ────────────────────────────────────────────

/** Returns true if date is today or in the future */
export function isNotPastDate(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(date);
  check.setHours(0, 0, 0, 0);
  return check >= today;
}

// ─── Composite form schemas ─────────────────────────────────────────────

/** Member details form (registration) */
export const memberDetailsSchema = z.object({
  fullName: nameSchema,
  gender: z.string().min(1, "Please select a gender"),
  photoIdType: z.string().min(1, "Please select an ID type"),
  photoIdNumber: z.string().min(1, "Enter ID number"),
  address: addressSchema,
});

/** Admin login schema */
export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, "Password must be at least 6 characters"),
});

/** Staff login schema */
export const staffLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(6, "Password must be at least 6 characters"),
});

/** Add member (admin) schema */
export const addMemberSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
});

// ─── Inline error helper ────────────────────────────────────────────────

export interface FieldErrors {
  [key: string]: string | undefined;
}

/** Validate a single field value against a schema, return error message or undefined */
export function validateField(
  schema: z.ZodType,
  value: unknown
): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.errors[0]?.message;
}

/** Validate all fields in an object against a schema, return field errors */
export function validateForm<T extends z.ZodType>(
  schema: T,
  data: unknown
): { success: boolean; errors: FieldErrors; data?: z.infer<T> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, errors: {}, data: result.data };
  }
  const errors: FieldErrors = {};
  result.error.errors.forEach((err) => {
    const field = err.path[0]?.toString();
    if (field && !errors[field]) {
      errors[field] = err.message;
    }
  });
  return { success: false, errors };
}
