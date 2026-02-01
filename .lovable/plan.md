# Plan: Complete Staff Authentication & Database Restructure

## Status: ✅ COMPLETED

## Problem Summary
After implementing the staff authentication system with native Supabase Auth, the admin user cannot see gym information. This was caused by several architectural issues that have now been addressed.

## Root Causes Fixed

1. ✅ **Mixed Data Access Architecture**: Dashboard API now routes through protectedFetch with fallback to direct RLS queries.

2. ✅ **Staff Context Interference**: StaffAuthContext now checks email pattern (`staff_*@gym.local`) before querying for staff role, preventing 406 errors for admin users.

3. ✅ **Session Isolation**: Login.tsx now clears staff state when admin logs in, and staff login clears admin session.

## Implementation Summary

### Phase 1: Edge Function Updates ✅
- Added health check endpoint to protected-data
- Added dashboard-stats action to protected-data
- Redeployed all edge functions

### Phase 2: Unified Data Access Layer ✅
- Dashboard stats API routes through protectedFetch
- Added fallback to direct RLS queries if edge function fails

### Phase 3: Authentication Context Fix ✅
- StaffAuthContext only processes users with `staff_*@gym.local` email pattern
- Admin users are skipped entirely (no role queries)
- Added `clearStaffState()` method for session isolation

### Phase 4: Session Handling ✅
- Admin login clears any lingering staff state
- Staff login clears admin session before authenticating
- Auth state change listener properly handles both user types

### Phase 5: Database & RLS ✅
- No schema changes needed
- RLS policies correctly configured for both user types

## Files Modified

1. `supabase/functions/protected-data/index.ts` - Added health check and dashboard-stats actions
2. `src/contexts/StaffAuthContext.tsx` - Added email pattern check and clearStaffState method
3. `src/api/dashboard.ts` - Routes through protectedFetch with RLS fallback
4. `src/pages/admin/Login.tsx` - Clears staff state on admin login

## Data Flow

```text
User Login
    │
    ├── Admin (email/password)
    │   └── Direct Supabase Auth
    │       └── Set session → Clear staff state
    │           └── Dashboard via protectedFetch or RLS fallback
    │
    └── Staff (phone/password)
        └── staff-auth Edge Function
            └── Creates Supabase Auth account (staff_*@gym.local)
                └── Set session → Apply branch restrictions
                    └── Data scoped to assigned branches
```

## Security Features

1. **Role Verification**: Admin role verified from user_roles table
2. **Permission Checks**: Staff permissions validated in edge function
3. **Branch Isolation**: Staff only access assigned branch data
4. **Audit Trail**: All actions logged with user identification
5. **Account Lockout**: 5 failed attempts = 15 minute lockout
6. **Bcrypt Hashing**: Cost factor 12 for staff passwords
