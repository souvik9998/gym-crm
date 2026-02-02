# Complete Supabase Migration Guide

This document provides step-by-step instructions to migrate your Gym QR Pro backend from Lovable Cloud to your independent Supabase project.

## Target Supabase Project
- **Project ID:** `ydswesigiavvgllqrbze`
- **URL:** `https://ydswesigiavvgllqrbze.supabase.co`

---

## ⚠️ IMPORTANT: All Changes Target External Supabase

From now on, **ALL database and backend changes** are applied to your independent Supabase project (`ydswesigiavvgllqrbze`), NOT the Lovable-managed backend. 

The codebase is configured as follows:
1. **Client Connection**: `src/integrations/supabase/client.ts` connects directly to `ydswesigiavvgllqrbze`
2. **API Calls**: `src/lib/supabaseConfig.ts` contains hardcoded URLs for edge function calls
3. **Edge Functions**: Must be deployed manually to `ydswesigiavvgllqrbze` via Supabase CLI

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Configure Secrets](#step-1-configure-secrets)
3. [Step 2: Run Database Migrations](#step-2-run-database-migrations)
4. [Step 3: Deploy Edge Functions](#step-3-deploy-edge-functions)
5. [Step 4: Configure Cron Jobs](#step-4-configure-cron-jobs)
6. [Step 5: Verify Migration](#step-5-verify-migration)
7. [Security Checklist](#security-checklist)

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

Navigate to: **Supabase Dashboard → Settings → Edge Functions → Secrets**

| Secret Name | Description | Required |
|-------------|-------------|----------|
| `RAZORPAY_KEY_ID` | Razorpay Key ID | ✅ |
| `RAZORPAY_KEY_SECRET` | Razorpay Secret Key | ✅ |
| `PERISKOPE_API_KEY` | Periskope WhatsApp API Key | ✅ |
| `PERISKOPE_PHONE` | Periskope Phone (format: 91XXXXXXXXXX) | ✅ |
| `ADMIN_WHATSAPP_NUMBER` | Admin's WhatsApp for daily summaries | Optional |

**Note:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in Edge Functions.

---

## Step 2: Run Database Migrations

Execute the following SQL files in your Supabase SQL Editor:
**Dashboard → SQL Editor → New Query**

### Migration 1: Complete Base Schema
File: `database/complete-schema-migration.sql`

This includes:
- All 24 tables with proper relationships
- Enums: `app_role`, `payment_mode`, `payment_status`, `salary_type`, `staff_role`, `subscription_status`
- Database functions (10+ functions)
- RLS policies (60+ policies)
- Triggers for automatic updates

### Migration 2: Multi-Tenant SaaS Extension
File: `database/multi-tenant-migration.sql`

This adds:
- `tenants` table - Gym organizations
- `tenant_limits` table - Resource quotas
- `tenant_usage` table - Usage metering
- `tenant_members` table - User-tenant mapping
- `tenant_billing_info` table - Billing metadata
- `platform_audit_logs` table - Super admin audit trail
- Multi-tenant security functions
- `super_admin` and `tenant_admin` roles

---

## Step 3: Deploy Edge Functions

### Using Supabase CLI (Recommended)

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref ydswesigiavvgllqrbze

# Deploy all functions
supabase functions deploy public-data --no-verify-jwt
supabase functions deploy protected-data --no-verify-jwt
supabase functions deploy staff-auth --no-verify-jwt
supabase functions deploy staff-operations --no-verify-jwt
supabase functions deploy send-whatsapp --no-verify-jwt
supabase functions deploy create-razorpay-order --no-verify-jwt
supabase functions deploy verify-razorpay-payment --no-verify-jwt
supabase functions deploy daily-whatsapp-job --no-verify-jwt
supabase functions deploy tenant-operations --no-verify-jwt
```

### Edge Functions Summary

| Function | Purpose |
|----------|---------|
| `public-data` | Public registration data (packages, trainers, branches) |
| `protected-data` | Authenticated data API (dashboard, members, ledger) |
| `staff-auth` | Staff login/logout/password management |
| `staff-operations` | Staff CRUD with permissions |
| `send-whatsapp` | Send WhatsApp notifications |
| `create-razorpay-order` | Create Razorpay payment orders |
| `verify-razorpay-payment` | Verify payments & create subscriptions |
| `daily-whatsapp-job` | Cron job for daily notifications |
| `tenant-operations` | Multi-tenant management (super admin) |

---

## Step 4: Configure Cron Jobs

Enable `pg_cron` and `pg_net` extensions in Supabase Dashboard → Database → Extensions.

Then run this SQL:

```sql
-- Schedule daily WhatsApp notifications at 9:00 AM IST (3:30 AM UTC)
SELECT cron.schedule(
  'daily-whatsapp-notifications',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ydswesigiavvgllqrbze.supabase.co/functions/v1/daily-whatsapp-job',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkc3dlc2lnaWF2dmdsbHFyYnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MjA1NzUsImV4cCI6MjA4MzE5NjU3NX0.onumG_DlX_Ud4eBWsnqhhX-ZPhrfmYXBA5tNftSJD84"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

## Step 5: Verify Migration

### Test Checklist

1. **Public Registration Flow**
   - Visit `/b/{branch_id}` and complete registration
   - Verify Razorpay payment works
   - Check WhatsApp notification sent

2. **Admin Login**
   - Login with admin credentials at `/admin`
   - Verify dashboard stats load
   - Check member list displays

3. **Staff Login**
   - Login with staff phone/password
   - Verify permissions are enforced
   - Test allowed operations

4. **Edge Function Health**
   - Call `GET /functions/v1/public-data?action=default-branch`
   - Verify response returns branch data

---

## Security Checklist

- [x] All tables have RLS enabled
- [x] All sensitive tables have proper policies
- [x] `user_roles` table is separate from profiles
- [x] Admin role verification uses `has_role()` function
- [x] Staff permissions checked via `staff_has_permission()`
- [x] Edge functions validate JWT tokens where needed
- [ ] Secrets are stored in Supabase Dashboard (Edge Functions → Secrets)
- [x] CORS headers configured on all edge functions
- [x] Branch isolation enforced via `branch_id` filtering
- [x] Tenant isolation via `tenant_id` column

---

## Frontend Configuration (COMPLETED)

The frontend is configured to use your independent Supabase project:

| File | Purpose |
|------|---------|
| `src/integrations/supabase/client.ts` | Supabase client with hardcoded project URL |
| `src/lib/supabaseConfig.ts` | Centralized config for edge function URLs |
| `src/api/*.ts` | All API files use centralized config |

---

## Rollback Plan

If migration fails:
1. Keep old project running in parallel
2. Check Supabase Dashboard → Logs → Edge Functions for errors
3. Check Supabase Dashboard → Logs → Database Logs for SQL errors
4. Review Browser DevTools → Network tab for API errors

---

## Support

For issues, check:
- Supabase Dashboard → Logs → Edge Functions
- Supabase Dashboard → Logs → Database Logs
- Browser DevTools → Network tab for API errors
