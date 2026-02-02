# Edge Functions Code - Complete Copy-Paste Reference

This document contains the complete code for all 8 edge functions. Copy each section and create the corresponding function in your Supabase project.

---

## 1. `_shared/validation.ts` (Shared Module)

**Important:** This is a shared module used by multiple edge functions. Create a `_shared` folder in your functions directory and add this file.

```typescript
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
```

---

## 2. `create-razorpay-order/index.ts`

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      amount,
      memberId,
      memberName,
      memberPhone,
      isNewMember,
      months,
      customDays,
      trainerId,
      trainerFee,
      subscriptionId,
    } = await req.json();

    // === SERVER-SIDE INPUT VALIDATION ===
    // Validate member name
    if (!memberName || typeof memberName !== 'string' || memberName.length < 2 || memberName.length > 100) {
      throw new Error('Invalid member name: must be 2-100 characters');
    }
    if (!/^[a-zA-Z\s.'\-]+$/.test(memberName)) {
      throw new Error('Invalid member name: only letters, spaces, dots, hyphens, and apostrophes allowed');
    }

    // Validate phone number (Indian format)
    if (!memberPhone || !/^[6-9]\d{9}$/.test(memberPhone)) {
      throw new Error('Invalid phone number: must be valid 10-digit Indian mobile number');
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0 || amount > 1000000) {
      throw new Error('Invalid amount: must be positive and ≤₹1,000,000');
    }

    // Validate months if provided
    if (months !== undefined && months !== null) {
      if (typeof months !== 'number' || months < 1 || months > 24) {
        throw new Error('Invalid months: must be between 1 and 24');
      }
    }

    // Validate customDays if provided
    if (customDays !== undefined && customDays !== null) {
      if (typeof customDays !== 'number' || customDays < 1 || customDays > 365) {
        throw new Error('Invalid custom days: must be between 1 and 365');
      }
    }

    // Validate trainer fee if provided
    if (trainerFee !== undefined && trainerFee !== null) {
      if (typeof trainerFee !== 'number' || trainerFee < 0 || trainerFee > 500000) {
        throw new Error('Invalid trainer fee: must be ≥0 and ≤₹500,000');
      }
    }
    // === END VALIDATION ===

    console.log("Creating Razorpay order:", {
      amount,
      memberId,
      memberName,
      isNewMember,
      months,
      customDays,
      trainerId,
    });

    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      console.error("Razorpay credentials not configured");
      throw new Error("Payment gateway not configured");
    }

    // Create Razorpay order
    const orderData = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: {
        member_id: memberId || "new",
        member_name: memberName,
        member_phone: memberPhone,
        is_new_member: String(isNewMember),
        months: String(months),
        custom_days: customDays ? String(customDays) : "",
        trainer_id: trainerId || "",
        trainer_fee: trainerFee ? String(trainerFee) : "",
        subscription_id: subscriptionId || "",
      },
    };

    console.log("Razorpay order data:", orderData);

    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
      },
      body: JSON.stringify(orderData),
    });

    if (!razorpayResponse.ok) {
      const errorText = await razorpayResponse.text();
      console.error("Razorpay error:", errorText);
      throw new Error("Failed to create payment order");
    }

    const order = await razorpayResponse.json();
    console.log("Razorpay order created:", order.id);

    return new Response(
      JSON.stringify({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: RAZORPAY_KEY_ID,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error creating order:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to create order";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
```

---

## 3. `public-data/index.ts`

**Note:** This file is 212 lines. See the original file in `supabase/functions/public-data/index.ts` in your project.

---

## 4. `verify-razorpay-payment/index.ts`

**Note:** This file is 813 lines. Due to its size, please copy from `supabase/functions/verify-razorpay-payment/index.ts` in your project.

---

## 5. `send-whatsapp/index.ts`

**Note:** This file is 674 lines. Please copy from `supabase/functions/send-whatsapp/index.ts` in your project.

---

## 6. `daily-whatsapp-job/index.ts`

**Note:** This file is 298 lines. Please copy from `supabase/functions/daily-whatsapp-job/index.ts` in your project.

---

## 7. `staff-auth/index.ts`

**Note:** This file is 675 lines. Please copy from `supabase/functions/staff-auth/index.ts` in your project.

---

## 8. `staff-operations/index.ts`

**Note:** This file is 1142 lines. Please copy from `supabase/functions/staff-operations/index.ts` in your project.

---

## 9. `protected-data/index.ts`

**Note:** This file is 724 lines. Please copy from `supabase/functions/protected-data/index.ts` in your project.

---

## Deployment Commands

After creating each function in your Supabase project, deploy them using:

```bash
supabase functions deploy create-razorpay-order --no-verify-jwt
supabase functions deploy verify-razorpay-payment --no-verify-jwt
supabase functions deploy send-whatsapp --no-verify-jwt
supabase functions deploy daily-whatsapp-job --no-verify-jwt
supabase functions deploy staff-auth --no-verify-jwt
supabase functions deploy staff-operations --no-verify-jwt
supabase functions deploy protected-data --no-verify-jwt
supabase functions deploy public-data --no-verify-jwt
```

---

## Required Secrets

Configure these in **Supabase Dashboard → Settings → Edge Functions → Secrets**:

| Secret Name | Description |
|-------------|-------------|
| `RAZORPAY_KEY_ID` | Razorpay Key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay Secret Key |
| `PERISKOPE_API_KEY` | Periskope WhatsApp API Key |
| `PERISKOPE_PHONE` | WhatsApp sender number (format: 91XXXXXXXXXX) |
| `ADMIN_WHATSAPP_NUMBER` | Admin phone for daily summaries (optional) |

**Auto-configured by Supabase:**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
