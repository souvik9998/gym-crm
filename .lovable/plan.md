
# Per-Gym Razorpay Credentials Management

## Overview

This plan adds per-gym (per-branch) Razorpay credential management so each gym organization can have its own Razorpay account. Super Admins configure credentials via the Tenant Detail page. Credentials are encrypted at rest and never exposed to the frontend.

## Architecture

### Data Flow

```text
Super Admin UI                    Edge Function                    Database
(TenantDetail.tsx)                (tenant-operations)              (razorpay_credentials)
     |                                  |                                |
     |-- Save key_id + key_secret ----->|                                |
     |                                  |-- Encrypt key_secret -------->|
     |                                  |-- Test order to Razorpay ---->|
     |                                  |-- Mark is_verified=true ----->|
     |                                  |                                |
     |<--- Success / Error -------------|                                |
     |                                  |                                |
                                        |                                |
Payment Flow                            |                                |
(create-razorpay-order)                 |                                |
     |-- branchId ------------------>   |                                |
     |                                  |-- Lookup branch tenant ------>|
     |                                  |-- Decrypt key_secret -------->|
     |                                  |-- Create Razorpay order ----->|
     |<--- orderId + keyId -------------|                                |
```

### Security Model

- Credentials stored in `razorpay_credentials` table with `key_secret` encrypted using AES-GCM with a server-side encryption key
- RLS denies ALL access to non-service-role users (no SELECT, INSERT, UPDATE, DELETE for anon/authenticated)
- Only Edge Functions using `service_role` can read/write credentials
- `key_id` is stored in plain text (it's a publishable key returned to the frontend for checkout)
- `key_secret` is encrypted and NEVER sent to the frontend
- Super Admin access enforced at Edge Function level before any credential operation

---

## Phase 1: Database Table

Create `razorpay_credentials` table:

```sql
CREATE TABLE public.razorpay_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  encrypted_key_secret TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(tenant_id)
);

ALTER TABLE public.razorpay_credentials ENABLE ROW LEVEL SECURITY;

-- ONLY service_role can access this table
CREATE POLICY "Service role full access"
ON public.razorpay_credentials FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
```

No other RLS policies - gym owners, staff, and members cannot access this table at all.

---

## Phase 2: Encryption Secret

A new secret `RAZORPAY_ENCRYPTION_KEY` must be added to the project. This is a 32-byte hex key used for AES-256-GCM encryption/decryption of Razorpay secrets in Edge Functions.

---

## Phase 3: Edge Function - Credential Management

Add new actions to `tenant-operations` Edge Function:

**Action: `save-razorpay-credentials`** (Super Admin only)
1. Validate Super Admin role
2. Validate `tenantId`, `keyId`, `keySecret` inputs
3. **Verify credentials** by creating a test Razorpay order (amount: 100 paise = Rs 1)
4. If verification fails, return error - do NOT save
5. Encrypt `keySecret` using AES-256-GCM with `RAZORPAY_ENCRYPTION_KEY`
6. Upsert into `razorpay_credentials` with `is_verified = true`
7. Log to `platform_audit_logs` (without logging the secret)
8. Return success with connection status

**Action: `get-razorpay-status`** (Super Admin only)
1. Validate Super Admin role
2. Query `razorpay_credentials` for the tenant
3. Return ONLY: `isConnected`, `keyId` (masked: `rzp_****xxxx`), `isVerified`, `verifiedAt`
4. NEVER return the secret

**Action: `remove-razorpay-credentials`** (Super Admin only)
1. Validate Super Admin role
2. Delete from `razorpay_credentials`
3. Log to audit

---

## Phase 4: Update Payment Edge Functions

### `create-razorpay-order`
Currently reads from `Deno.env.get("RAZORPAY_KEY_ID")`. Change to:

1. Accept `branchId` in the request body
2. Look up `tenant_id` from `branches` table using `branchId`
3. Query `razorpay_credentials` for that `tenant_id`
4. If no credentials or `is_verified = false`, return error: "Payment gateway not configured for this gym"
5. Decrypt `key_secret` using AES-256-GCM
6. Use per-gym `key_id` and decrypted `key_secret` for the Razorpay API call
7. Return per-gym `key_id` to the frontend (needed for checkout)
8. Fall back to env vars (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`) ONLY if no per-gym credentials exist (for backward compatibility during migration, can be removed later)

### `verify-razorpay-payment`
Currently reads `RAZORPAY_KEY_SECRET` from env. Change to:

1. Accept `branchId` in the request body (already does)
2. Look up tenant credentials the same way
3. Decrypt and use per-gym `key_secret` for HMAC signature verification
4. Same fallback logic as above

### Shared Encryption Utility
Create helper functions in `_shared/encryption.ts`:

```typescript
export async function encrypt(plaintext: string, keyHex: string): Promise<{ ciphertext: string; iv: string }>
export async function decrypt(ciphertext: string, iv: string, keyHex: string): Promise<string>
export async function getGymRazorpayCredentials(serviceClient, branchId): Promise<{ keyId: string; keySecret: string } | null>
```

---

## Phase 5: Frontend - Super Admin UI

### Location: `src/pages/superadmin/TenantDetail.tsx`

Add a new "Payments" tab to the tenant detail page with:

1. **Connection Status Card**
   - Shows "Connected" (green badge) or "Not Connected" (gray badge)
   - If connected: shows masked key_id (`rzp_****xxxx`), verified date
   - If not connected: shows setup instructions

2. **Configure Section**
   - Input: Razorpay Key ID (text input)
   - Input: Razorpay Key Secret (password input, never pre-filled)
   - "Verify & Save" button
   - On save: calls `tenant-operations?action=save-razorpay-credentials`
   - Shows loading state during verification
   - Success/error toast feedback

3. **Disconnect Button**
   - Confirm dialog: "This will disable online payments for all branches of this gym"
   - Calls `remove-razorpay-credentials`

### Location: `src/hooks/useRazorpay.ts`

Update `initiatePayment` to pass `branchId` to `create-razorpay-order`. This is already partially done - `branchId` is passed to `verify-razorpay-payment` but NOT to `create-razorpay-order`. Fix this.

---

## Phase 6: Payment Gating

### Frontend Gating (UX only - not security)
- Before showing "Pay Online" buttons, check if the gym has Razorpay connected
- Add a query/flag from `public-data` edge function that returns `hasOnlinePayments: boolean` for a branch
- If not connected, show "Online payments not available" or hide the pay button

### Backend Enforcement (Actual Security)
- `create-razorpay-order` already rejects if no credentials found (Phase 4)
- This is the real enforcement - frontend gating is just UX

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| Migration SQL | Create | `razorpay_credentials` table + RLS |
| `supabase/functions/_shared/encryption.ts` | Create | AES-256-GCM encrypt/decrypt + credential lookup |
| `supabase/functions/tenant-operations/index.ts` | Modify | Add 3 new actions for credential CRUD |
| `supabase/functions/create-razorpay-order/index.ts` | Modify | Use per-gym credentials instead of env vars |
| `supabase/functions/verify-razorpay-payment/index.ts` | Modify | Use per-gym credentials for signature verification |
| `src/pages/superadmin/TenantDetail.tsx` | Modify | Add "Payments" tab with credential management UI |
| `src/hooks/useRazorpay.ts` | Modify | Pass `branchId` to `create-razorpay-order` |

---

## Security Checklist

- [x] Secrets encrypted at rest (AES-256-GCM)
- [x] RLS blocks all non-service-role access
- [x] Only Super Admin can manage credentials (Edge Function enforced)
- [x] Key secret never returned to frontend
- [x] Key secret never logged
- [x] Credentials verified before saving (test Razorpay API call)
- [x] Per-gym isolation - no shared keys, no fallback between gyms
- [x] Audit logging for all credential operations
- [x] Payment disabled if credentials missing or unverified
