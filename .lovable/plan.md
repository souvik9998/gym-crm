
# Plan: Simplify Organization Creation Form

## Problem
The current "Create Organization" form has two email fields that cause confusion:
- **Contact Email** - An optional business email for the organization
- **Owner Email** - The login credential email for the gym owner

This duplication creates confusion about which email will be used for login.

## Solution

### 1. Consolidate Email Fields
Remove the separate "Contact Email" field and use the **Owner Email** as both the login credential AND the organization's contact email. This simplifies the form and eliminates confusion.

### 2. Restructure the Form Layout
Reorganize the form into clearer sections:
- **Organization Details**: Name, URL Slug, Contact Phone (optional)
- **Owner Login Credentials**: Email and Password with clear description that this is what the gym owner will use to log in

### 3. Improve Labels and Descriptions
Add clearer descriptions so users understand:
- The email entered is what the gym owner uses to log in
- The password must be shared with the gym owner for their first login

## Technical Changes

### File: `src/pages/superadmin/CreateTenant.tsx`

**Changes:**
1. Remove the separate `email` field from form state
2. Remove the "Contact Email" input from the Organization Details card
3. Update the Owner Account card with clearer labels:
   - "Owner Email" becomes "Login Email" with description: "The gym owner will use this email to log in"
   - "Password" gets description: "Share this password with the gym owner"
4. Pass `ownerEmail` as the organization's contact email to the backend

**Updated Form Structure:**
```text
+----------------------------------------+
|  Organization Details                   |
|  - Organization Name *                  |
|  - URL Slug *                          |
|  - Contact Phone (optional)            |
+----------------------------------------+

+----------------------------------------+
|  Owner Login Credentials                |
|  "These credentials will be used by    |
|   the gym owner to access their admin  |
|   dashboard"                           |
|  - Login Email *                       |
|  - Password *                          |
+----------------------------------------+

+----------------------------------------+
|  Resource Limits                       |
|  (unchanged)                           |
+----------------------------------------+
```

### File: `src/api/tenants.ts` - No changes needed
The API already accepts `ownerEmail` and optional `email`. We will pass `ownerEmail` as `email` to the backend.

### File: `supabase/functions/tenant-operations/index.ts` - No changes needed
The edge function already handles this correctly - it uses `ownerEmail` for the auth account and stores `email` in the tenant record.

## Summary of Changes

| File | Change |
|------|--------|
| `src/pages/superadmin/CreateTenant.tsx` | Remove Contact Email field, improve labels and descriptions |

This is a UI-only change that simplifies the form without requiring any backend modifications.
