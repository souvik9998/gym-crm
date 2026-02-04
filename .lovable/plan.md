

# Secure Authentication & Authorization Architecture Plan

## Current State Analysis

### What's Already Implemented ✅

1. **Supabase Auth for All Users**
   - Admin/Super Admin: Uses standard Supabase email/password auth
   - Staff: Uses Supabase Auth with email pattern `staff_{phone}@gym.local`
   - Passwords are managed by Supabase Auth (bcrypt hashed) - no manual password handling

2. **Role Management in Database**
   - `user_roles` table stores roles (`super_admin`, `admin`, `member`, `staff`)
   - `tenant_members` table links users to tenants with ownership flags
   - `staff` table links to `auth_user_id` for staff users

3. **Edge Functions for Privileged Operations**
   - `staff-auth`: Handles staff login, session verification, password management
   - `protected-data`: Serves operational data with JWT validation + permission checks
   - `staff-operations`: Handles write operations with permission validation
   - `tenant-operations`: Super admin operations (tenant creation, limits)
   - `public-data`: Serves minimal safe data for public registration

4. **RLS Policies**
   - Enabled on all tables with role-based access using `has_role()` function
   - Multi-tenant isolation via `tenant_id` and `user_belongs_to_tenant()`
   - Staff branch isolation via `staff_branch_assignments`

5. **UI Protection**
   - `ProtectedRoute` component validates roles before rendering
   - Permission-based route gating for staff

---

## Identified Gaps & Required Improvements

### 1. Security Issues Found

| Issue | Current State | Risk |
|-------|--------------|------|
| Permissive RLS Policy | `USING (true)` detected on some tables | Medium - May allow unintended access |
| Leaked Password Protection | Disabled | Low - Should be enabled |
| Session Token Exposure | Tokens in localStorage | Low - Standard practice but could add fingerprinting |

### 2. Architecture Gaps

| Gap | Impact |
|-----|--------|
| No refresh token rotation | Sessions could be hijacked if token stolen |
| Missing rate limiting | Brute force protection only at app level |
| No IP-based session validation | Sessions can be used from any IP |

---

## Implementation Plan

### Phase 1: Fix Existing Security Issues

**Task 1.1: Fix Permissive RLS Policies**
- Audit all tables with `USING (true)` policies
- Replace with proper role-based conditions
- Affected tables need investigation: `staff_sessions`, `staff_login_attempts`, `staff_permissions`, `staff_branch_assignments`

**Task 1.2: Enable Leaked Password Protection**
- Enable via Supabase dashboard/API
- This prevents users from using passwords found in data breaches

---

### Phase 2: Strengthen Edge Function Authorization

**Task 2.1: Add Consistent JWT Validation**
All edge functions should use a shared validation pattern:

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Edge Function Auth Flow                       │
├─────────────────────────────────────────────────────────────────┤
│  1. Extract Bearer token from Authorization header               │
│  2. Validate JWT using anonClient.auth.getClaims(token)         │
│  3. Check user_roles table for role (super_admin, admin)        │
│  4. For staff: Check staff table + staff_permissions            │
│  5. For tenant operations: Verify tenant_members association    │
│  6. Execute action with service_role ONLY after validation      │
└─────────────────────────────────────────────────────────────────┘
```

**Task 2.2: Add IP/User-Agent Validation (Optional Enhancement)**
- Store client fingerprint in session
- Validate on subsequent requests

---

### Phase 3: Consolidate Auth Utilities

**Task 3.1: Create Shared Auth Validation Module**

Create `supabase/functions/_shared/auth.ts`:

```text
Exports:
├── validateJWT(token) → { valid, userId, error }
├── checkAdminRole(userId) → { isAdmin, isSuperAdmin, tenantId }
├── checkStaffAccess(userId) → { staffId, permissions, branchIds }
├── requireRole(token, role) → throws if unauthorized
└── requireStaffPermission(token, permission) → throws if unauthorized
```

**Task 3.2: Refactor Edge Functions to Use Shared Module**
- `protected-data/index.ts` - Already has good patterns, extract to shared
- `staff-operations/index.ts` - Use shared validation
- `tenant-operations/index.ts` - Use shared validation

---

### Phase 4: Enhance RLS Policies

**Task 4.1: Audit and Strengthen Policies**

Tables requiring policy review:
- `staff_sessions` - Currently has `USING (true)` for SELECT/UPDATE
- `staff_login_attempts` - Has `USING (true)` for SELECT
- `staff_permissions` - Has `USING (true)` for SELECT
- `staff_branch_assignments` - Has `USING (true)` for SELECT

**Task 4.2: Add Service Role Policies for Edge Functions**
Ensure write operations from edge functions use `auth.role() = 'service_role'`:

```sql
CREATE POLICY "Service role can insert"
ON public.some_table FOR INSERT
WITH CHECK (auth.role() = 'service_role');
```

---

### Phase 5: Client-Side Hardening

**Task 5.1: Remove Any Trusted Client-Side Role Checks**

Current implementation is correct:
- `ProtectedRoute` makes server calls to verify roles
- No localStorage/sessionStorage for role caching
- All enforcement at database/edge function level

**Task 5.2: Add Input Validation with Zod**

Already implemented:
- `Login.tsx` uses Zod schemas for validation
- Edge functions use `_shared/validation.ts` with Zod schemas

---

## Technical Details

### Database Changes (Migration)

```sql
-- 1. Fix overly permissive RLS policies on staff_sessions
DROP POLICY IF EXISTS "Public can view staff sessions" ON public.staff_sessions;
DROP POLICY IF EXISTS "Public can update staff sessions" ON public.staff_sessions;

CREATE POLICY "Staff can view own sessions" ON public.staff_sessions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_sessions.staff_id
    AND s.auth_user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Service role can manage sessions" ON public.staff_sessions
FOR ALL USING (auth.role() = 'service_role');

-- 2. Fix staff_login_attempts
DROP POLICY IF EXISTS "Public can view login attempts" ON public.staff_login_attempts;

CREATE POLICY "Admins can view login attempts" ON public.staff_login_attempts
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Service role can insert login attempts" ON public.staff_login_attempts
FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- 3. Fix staff_permissions public SELECT
DROP POLICY IF EXISTS "Public can view staff permissions" ON public.staff_permissions;
-- Keep the "Staff can view own permissions via auth" policy which is properly scoped
```

### Edge Function Changes

**Create `supabase/functions/_shared/auth.ts`:**

```typescript
// Shared authentication utilities for edge functions
import { createClient } from "npm:@supabase/supabase-js@2";

interface AuthResult {
  valid: boolean;
  userId?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
  staffId?: string;
  permissions?: Record<string, boolean>;
  branchIds?: string[];
  tenantId?: string;
  error?: string;
}

export async function validateAuth(
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
  authHeader: string | null
): Promise<AuthResult> {
  // ... implementation
}

export function requireAdmin(auth: AuthResult): void {
  if (!auth.valid || !auth.isAdmin) {
    throw new Error("Admin access required");
  }
}

export function requireSuperAdmin(auth: AuthResult): void {
  if (!auth.valid || !auth.isSuperAdmin) {
    throw new Error("Super admin access required");
  }
}

export function requireStaffPermission(
  auth: AuthResult, 
  permission: string
): void {
  if (!auth.valid) throw new Error("Authentication required");
  if (auth.isAdmin) return; // Admins have all permissions
  if (!auth.isStaff) throw new Error("Staff access required");
  if (!auth.permissions?.[permission]) {
    throw new Error(`Permission denied: ${permission}`);
  }
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/_shared/auth.ts` | Create new shared auth module |
| `supabase/functions/protected-data/index.ts` | Import shared auth, refactor |
| `supabase/functions/staff-operations/index.ts` | Import shared auth, refactor |
| `supabase/functions/tenant-operations/index.ts` | Import shared auth, refactor |
| `supabase/functions/staff-auth/index.ts` | Already well-implemented, minor cleanup |
| Database migration | Fix permissive RLS policies |

---

## Security Architecture Diagram

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                       │
│  │ Admin UI    │  │ Staff UI    │  │ Public UI   │                       │
│  │ (Dashboard) │  │ (Dashboard) │  │ (Register)  │                       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                       │
│         │                │                │                               │
│    [Supabase Auth]  [Supabase Auth]  [No Auth]                           │
│         │                │                │                               │
└─────────┼────────────────┼────────────────┼──────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      EDGE FUNCTION LAYER                                  │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────┐               │
│  │protected-data │  │ staff-operations │  │ public-data  │               │
│  │tenant-ops     │  │ staff-auth       │  │ (no auth)    │               │
│  └───────┬───────┘  └────────┬─────────┘  └──────┬───────┘               │
│          │                   │                   │                        │
│     [JWT Validation]    [JWT Validation]    [Read-only]                  │
│     [Role Check]        [Permission Check]  [Minimal Data]               │
│          │                   │                   │                        │
└──────────┼───────────────────┼───────────────────┼───────────────────────┘
           │                   │                   │
           ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        DATABASE LAYER                                     │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                     Row Level Security                           │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │     │
│  │  │ super_admin  │  │    admin     │  │    staff     │           │     │
│  │  │ Full Access  │  │ Tenant Scope │  │ Branch Scope │           │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                           │
│  Tables: user_roles, tenant_members, staff, staff_permissions            │
│          members, payments, subscriptions, ledger_entries, etc.          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

The current implementation already follows most security best practices. The main improvements needed are:

1. **Fix permissive RLS policies** - Replace `USING (true)` with proper conditions
2. **Enable leaked password protection** - Simple configuration change
3. **Consolidate auth utilities** - Create shared module for edge functions
4. **Add service role policies** - Ensure edge functions can write to tables

The architecture properly:
- Uses Supabase Auth exclusively for password management
- Stores roles in dedicated tables (not in user metadata)
- Routes privileged operations through edge functions
- Enforces access at database level with RLS
- Never trusts client-side role checks for enforcement

