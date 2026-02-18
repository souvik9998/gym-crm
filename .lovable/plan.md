

# Super Admin RBAC + Usage Limit System

## Overview
Build a comprehensive permissions and usage limits control panel that allows the Super Admin to toggle feature modules and set usage quotas per gym tenant. Disabled modules are hidden from the gym admin dashboard, and exceeded limits block actions with an "Upgrade Plan" message.

## What Already Exists
- `tenant_limits` table with `features` JSONB column (currently stores `{whatsapp, analytics, daily_pass}`)
- `tenant_limits` has numeric fields: `max_branches`, `max_staff_per_branch`, `max_members`, `max_trainers`, `max_monthly_whatsapp_messages`
- `tenant_can_add_resource()` SQL function for limit checking
- `get_tenant_current_usage()` SQL function for usage metering
- TenantDetail page with existing "Limits & Usage" tab

## Database Changes

### 1. Add new columns to `tenant_limits`
- `max_monthly_checkins` (integer, default 10000) -- monthly check-in limit
- `max_storage_mb` (integer, default 500) -- storage limit
- `plan_expiry_date` (date, nullable) -- plan expiry date

### 2. Expand the `features` JSONB column
The existing `features` JSONB will be expanded to include all 9 module toggles:

```text
{
  "members_management": true,
  "attendance": true,
  "payments_billing": true,
  "staff_management": true,
  "reports_analytics": true,
  "workout_diet_plans": false,
  "notifications": true,
  "integrations": true,
  "leads_crm": false
}
```

A migration will update existing rows to include all keys with sensible defaults.

### 3. Update `get_tenant_current_usage()` function
Add `monthly_checkins` count to the return type by querying `attendance_logs` for the current month.

### 4. Update `tenant_can_add_resource()` function
Add a `checkin` resource type that checks against `max_monthly_checkins`.

## Backend Changes

### 1. New helper: `get_tenant_permissions()` SQL function
A `SECURITY DEFINER` function that returns the `features` JSONB for a given tenant, usable in edge functions for permission checks.

### 2. Update `protected-data` edge function
Add permission checks before returning data:
- Before returning members data, verify `members_management` is enabled
- Before returning payment data, verify `payments_billing` is enabled
- Before returning analytics, verify `reports_analytics` is enabled
- Check `plan_expiry_date` -- if expired, return a 403 with "Plan Expired"

### 3. Update `check-in` edge function
Before recording a check-in, call `tenant_can_add_resource(tenant_id, 'checkin')` to enforce monthly check-in limits.

## Frontend Changes

### 1. New "Permissions & Limits" Tab on TenantDetail page
Replace the existing "Limits & Usage" tab with a richer UI containing two sections:

**Permissions Section** -- Toggle switches for each module:
- Members Management
- Attendance
- Payments and Billing
- Staff Management
- Reports and Analytics
- Workout/Diet Plans
- Notifications (SMS/WhatsApp)
- Integrations (Razorpay)
- Leads/Enquiries CRM

Each toggle saves immediately via `updateTenantLimits()`.

**Usage Limits Section** -- Numeric inputs and date picker:
- Max Members (number input + current usage indicator)
- Max Staff Accounts (number input)
- Max Branches (number input)
- Max Trainers (number input)
- Monthly Check-ins Limit (new)
- Monthly WhatsApp Messages (existing)
- Storage Limit MB (new)
- Plan Expiry Date (date picker, new)

### 2. New `useTenantPermissions` hook
A frontend hook that fetches the tenant's feature permissions for the current gym owner. Returns which modules are enabled.

### 3. Update AdminSidebar
Filter `allNavItems` based on tenant permissions:
- If `members_management` is disabled, hide Dashboard member-related items
- If `reports_analytics` is disabled, hide Analytics and Branch Analytics
- If `attendance` is disabled, hide Attendance
- If `payments_billing` is disabled, hide Ledger
- If `staff_management` is disabled, hide Staff Control
- If `notifications` is disabled, hide WhatsApp logs

### 4. Update ProtectedRoute
Add a permission-aware check: if a gym admin navigates to a disabled module's URL directly, redirect them to dashboard with a toast message "This module is not available on your plan."

### 5. "Limit Reached" UI component
A reusable alert/banner component (`LimitReachedBanner`) that shows "Limit Reached -- Contact your platform admin to upgrade" when a limit is hit. Integrate it into:
- AddMemberDialog (when max members reached)
- Staff creation flow (when max staff reached)
- Branch creation (already exists)
- Check-in flow (when monthly check-ins exhausted)

### 6. Update `api/tenants.ts`
- Extend `TenantLimits` interface with new fields
- Add `updateTenantFeatures()` API function
- Extend `updateTenantLimits()` to handle new fields

## Technical Details

### Files to Create
1. `src/hooks/useTenantPermissions.ts` -- Hook to fetch and cache tenant module permissions for the current gym owner
2. `src/components/ui/limit-reached-banner.tsx` -- Reusable "Limit Reached / Upgrade Plan" component

### Files to Modify
1. `supabase/functions/protected-data/index.ts` -- Add module permission checks
2. `supabase/functions/check-in/index.ts` -- Add check-in limit enforcement
3. `src/pages/superadmin/TenantDetail.tsx` -- Redesign "Limits" tab with permissions toggles + expanded limits UI
4. `src/api/tenants.ts` -- Extend interfaces and API functions
5. `src/components/admin/AdminSidebar.tsx` -- Filter nav items by tenant permissions
6. `src/components/admin/ProtectedRoute.tsx` -- Block disabled modules
7. `src/components/admin/AddMemberDialog.tsx` -- Show limit reached banner
8. Database migration -- Add columns, update functions, migrate existing features data

### Security Considerations
- All permission checks are enforced server-side in edge functions (not just UI hiding)
- `tenant_limits` table is only writable by `super_admin` (existing RLS policy)
- Gym admins can only SELECT their own tenant's limits (existing RLS policy)
- Plan expiry is checked server-side before serving any protected data

