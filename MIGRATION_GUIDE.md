# Complete Supabase Migration Guide

This document provides step-by-step instructions to migrate your Gym QR Pro backend from Lovable Cloud to your independent Supabase project.

## Target Supabase Project
- **Project ID:** `ydswesigiavvgllqrbze`
- **URL:** `https://ydswesigiavvgllqrbze.supabase.co`

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Configure Secrets](#step-1-configure-secrets)
3. [Step 2: Run Database Migration](#step-2-run-database-migration)
4. [Step 3: Deploy Edge Functions](#step-3-deploy-edge-functions)
5. [Step 4: Configure Cron Jobs](#step-4-configure-cron-jobs)
6. [Step 5: Update Frontend Configuration](#step-5-update-frontend-configuration)
7. [Step 6: Verify Migration](#step-6-verify-migration)
8. [Security Checklist](#security-checklist)

---

## Prerequisites

1. **Supabase CLI installed** - Run: `npm install -g supabase`
2. **Access to Supabase Dashboard** for project `ydswesigiavvgllqrbze`
3. **API keys ready:**
   - Razorpay Key ID & Secret
   - Periskope API Key & Phone
   - Admin WhatsApp Number

---

## Step 1: Configure Secrets

Navigate to your Supabase Dashboard → Settings → Vault → Secrets and add:

| Secret Name | Description | Required |
|-------------|-------------|----------|
| `RAZORPAY_KEY_ID` | Razorpay Key ID | ✅ |
| `RAZORPAY_KEY_SECRET` | Razorpay Secret Key | ✅ |
| `PERISKOPE_API_KEY` | Periskope WhatsApp API Key | ✅ |
| `PERISKOPE_PHONE` | Periskope Phone (format: 91XXXXXXXXXX@c.us) | ✅ |
| `ADMIN_WHATSAPP_NUMBER` | Admin's WhatsApp for daily summaries | Optional |

**Note:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in Edge Functions.

---

## Step 2: Run Database Migration

Execute the complete schema migration SQL in your Supabase SQL Editor (Dashboard → SQL Editor → New Query).

The SQL file is located at: `database/complete-schema-migration.sql`

This includes:
- All 24 tables with proper relationships
- Enums: `app_role`, `payment_mode`, `payment_status`, `salary_type`, `staff_role`, `subscription_status`
- Database functions (10 functions)
- RLS policies (60+ policies)
- Triggers for automatic updates

---

## Step 3: Deploy Edge Functions

### Option A: Using Supabase CLI (Recommended)

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref ydswesigiavvgllqrbze

# Deploy all functions
supabase functions deploy create-razorpay-order --no-verify-jwt
supabase functions deploy verify-razorpay-payment --no-verify-jwt
supabase functions deploy send-whatsapp --no-verify-jwt
supabase functions deploy daily-whatsapp-job --no-verify-jwt
supabase functions deploy staff-auth --no-verify-jwt
supabase functions deploy staff-operations --no-verify-jwt
supabase functions deploy protected-data --no-verify-jwt
supabase functions deploy public-data --no-verify-jwt
```

### Option B: Manual Deployment

Copy each function from `supabase/functions/` to your project and deploy via Dashboard.

### Edge Functions Summary

| Function | JWT Verify | Purpose |
|----------|------------|---------|
| `create-razorpay-order` | false | Create payment orders |
| `verify-razorpay-payment` | false | Verify payments & create subscriptions |
| `send-whatsapp` | false | Send WhatsApp notifications |
| `daily-whatsapp-job` | false | Cron job for daily notifications |
| `staff-auth` | false | Staff login/logout/password management |
| `staff-operations` | false | Staff CRUD operations with permissions |
| `protected-data` | false | Authenticated data API |
| `public-data` | false | Public registration data API |

---

## Step 4: Configure Cron Jobs

Enable `pg_cron` and `pg_net` extensions in Supabase Dashboard → Database → Extensions.

Then run this SQL in SQL Editor:

```sql
-- Schedule daily WhatsApp notifications at 9:00 AM IST (3:30 AM UTC)
SELECT cron.schedule(
  'daily-whatsapp-notifications',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ydswesigiavvgllqrbze.supabase.co/functions/v1/daily-whatsapp-job',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

Replace `YOUR_ANON_KEY` with your project's anon key.

---

## Step 5: Frontend Configuration (COMPLETED)

The frontend has been updated to use hardcoded credentials for your new project:

**Files Updated:**
- `src/integrations/supabase/client.ts` - Supabase client with new project URL and anon key
- `src/lib/supabaseConfig.ts` - Centralized config for edge function URLs
- All API files (`src/api/*.ts`) - Now use centralized config
- `src/hooks/useStaffOperations.ts` - Updated edge function calls
- `src/components/admin/MembersTable.tsx` - Updated WhatsApp edge function calls

**Note:** The `.env` file is managed by Lovable Cloud and points to the old project. The code overrides this by using hardcoded values.

---

## Step 6: Multi-Tenant Schema (COMPLETED)

The database has been extended with multi-tenant SaaS capabilities:

**New Tables:**
| Table | Purpose |
|-------|---------|
| `tenants` | Gym organizations (isolated accounts) |
| `tenant_limits` | Custom resource limits per tenant |
| `tenant_usage` | Monthly usage metering |
| `tenant_members` | User ↔ Tenant role mapping |
| `tenant_billing_info` | Billing metadata for future integration |
| `platform_audit_logs` | Super-admin action audit trail |

**New Roles:**
- `super_admin` - Platform-wide management access
- `tenant_admin` - Full tenant access (existing "admin" behavior)

**New Edge Function:**
- `tenant-operations` - Tenant management and limit enforcement

---

## Step 7: Verify Migration

### Test Checklist

1. **Public Registration Flow**
   - Visit `/b/{branch_id}` and complete registration
   - Verify Razorpay payment works
   - Check WhatsApp notification sent

2. **Admin Login**
   - Login with admin credentials
   - Verify dashboard stats load
   - Check member list displays

3. **Staff Login**
   - Login with staff phone/password
   - Verify permissions are enforced
   - Test allowed operations

4. **Edge Function Health**
   - Call `GET /functions/v1/protected-data?action=health` with auth token
   - Verify `200 OK` response

---

## Security Checklist

- [ ] All tables have RLS enabled
- [ ] All sensitive tables have proper policies
- [ ] `user_roles` table is separate from profiles
- [ ] Admin role verification uses `has_role()` function
- [ ] Staff permissions checked via `staff_has_permission()`
- [ ] Edge functions validate JWT tokens
- [ ] Secrets are stored in Supabase Vault, not in code
- [ ] CORS headers configured on all edge functions
- [ ] Branch isolation enforced via `branch_id` filtering

---

## Rollback Plan

If migration fails:
1. Keep old project running in parallel
2. Revert `.env` to original Lovable Cloud values
3. Investigate errors in new project

---

## Support

For issues, check:
- Supabase Dashboard → Logs → Edge Functions
- Supabase Dashboard → Logs → Database Logs
- Browser DevTools → Network tab for API errors
