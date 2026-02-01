
# Plan: Complete Staff Authentication & Database Restructure

## Problem Summary
After implementing the staff authentication system with native Supabase Auth, the admin user cannot see gym information. This is caused by several architectural issues that need to be addressed for a seamless, secure multi-tenant authentication system.

## Root Causes Identified

1. **Mixed Data Access Architecture**: Some APIs use direct Supabase client (relying on RLS), while others route through the `protected-data` edge function. This inconsistency causes issues when edge functions aren't properly deployed.

2. **Edge Function Deployment Issues**: The `protected-data` edge function returns 404, indicating deployment problems that prevent member data from being fetched.

3. **Staff Context Interference**: The `StaffAuthContext` runs for all authenticated users, querying `user_roles` for "staff" role even for admin users, causing unnecessary 406 errors.

4. **Session Isolation Not Enforced**: The staff login clears admin sessions, but admin login doesn't properly isolate from potential staff state.

## Implementation Plan

### Phase 1: Fix Edge Function Deployment & Data Access
Ensure all edge functions are properly deployed and accessible.

**Tasks:**
- Redeploy all edge functions (`protected-data`, `public-data`, `staff-auth`, `staff-operations`)
- Add health check endpoint to `protected-data` for debugging
- Add proper error logging to trace authentication failures

### Phase 2: Unify Data Access Layer
Standardize how data is accessed based on authentication state.

**Tasks:**
- Update dashboard stats API to use the `protected-data` edge function instead of direct RLS calls (consistency)
- Ensure all authenticated data access routes through `protectedFetch` → `protected-data`
- Keep public data access via `public-data` edge function

### Phase 3: Fix Authentication Context Logic
Separate admin and staff authentication handling properly.

**Tasks in StaffAuthContext.tsx:**
- Only run staff session verification when user email matches `staff_*@gym.local` pattern
- Skip staff role checks for admin users entirely
- Add early exit when detecting admin session (non-staff email)

**Tasks in ProtectedRoute.tsx:**
- Add proper admin role verification using `useIsAdmin` hook result
- Don't rely solely on session existence for admin identification
- Ensure admin routes verify `isAdmin` from the hook, not just session presence

### Phase 4: Clean Session Handling
Implement proper session isolation between admin and staff.

**Tasks in Login.tsx:**
- Admin login should clear any lingering staff context state
- Staff login already clears admin session (keep this)
- Add session type detection on initial app load

**Tasks in AdminHeader.tsx or appropriate component:**
- Clear staff context when admin logs in
- Display correct user type in header

### Phase 5: Database & RLS Policy Review
Ensure RLS policies work correctly for both user types.

**Current RLS Status:**
- `members` table has correct policies for admin (uses `has_role`)
- Staff policies use `auth.uid()` → `staff.auth_user_id` → permissions check
- All policies are correctly structured

**Tasks:**
- No schema changes needed - RLS is correctly configured
- Ensure `is_staff()` helper function is being used where appropriate
- Add logging in edge functions to trace authorization decisions

### Phase 6: Testing & Verification
Comprehensive testing of both authentication flows.

**Test Cases:**
1. Admin login → navigate to dashboard → verify all data loads
2. Staff login (after password set) → verify branch-scoped data
3. Switch between admin/staff sessions → verify isolation
4. Test permission-gated routes for staff users

## Technical Details

### File Changes Required

**1. `src/contexts/StaffAuthContext.tsx`**
- Add email pattern check before staff role verification
- Skip initialization for admin users (non-staff email pattern)

**2. `src/api/dashboard.ts`**
- Route through `protectedFetch` for consistency
- Remove direct Supabase client calls

**3. `src/components/admin/ProtectedRoute.tsx`**
- Add explicit admin role check using hook result
- Improve authentication state debugging

**4. `src/pages/admin/Login.tsx`**
- Clear staff context on admin login success
- Add proper session isolation

**5. `supabase/functions/protected-data/index.ts`**
- Add health check action
- Improve error logging for debugging

**6. Edge Function Deployment**
- Ensure all functions deploy correctly
- Add deployment verification step

### Data Flow After Fix

```text
User Login
    │
    ├── Admin (email/password)
    │   └── Direct Supabase Auth
    │       └── Set session → Clear staff context
    │           └── All queries via protected-data (with admin role)
    │
    └── Staff (phone/password)
        └── staff-auth Edge Function
            └── Creates/uses Supabase Auth account (staff_*@gym.local)
                └── Set session → Set staff context
                    └── All queries via protected-data (with permission checks)
```

### Security Considerations

1. **Role Verification**: Always verify admin role from `user_roles` table, not just session existence
2. **Permission Checks**: Staff permissions are validated in edge function before returning data
3. **Branch Isolation**: Staff can only access data from assigned branches
4. **Audit Trail**: All actions logged with proper user identification

## Success Criteria

1. Admin can log in and see all gym data immediately
2. Staff can log in with phone/password set by admin
3. Staff only sees data for assigned branches
4. Switching between sessions doesn't cause data leakage
5. All permission-gated routes work correctly for both user types

## Estimated Changes

- **5-6 files modified**
- **Edge functions redeployed**
- **No database schema changes required**
- **RLS policies remain unchanged**
