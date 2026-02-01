

# Plan: Fix Staff Permissions - View, Edit Members & Access Settings

## Problem Statement

After a successful staff login, the staff member cannot:
1. **Edit members** - Even though `can_manage_members` is set to `true`
2. **Access Settings** - Even though `can_change_settings` is set to `true`

Despite the database having all permissions correctly configured and the Edge Function returning those permissions successfully, the frontend/backend enforcement is failing.

## Root Cause Analysis

Based on investigation:

| Layer | Status | Finding |
|-------|--------|---------|
| Database | Working | All 6 permissions set to `true` for the staff member |
| Edge Function | Working | `verify-session` returns all permissions correctly |
| Network | Working | Frontend receives 200 response with full permissions |
| Frontend Permission Check | Needs Review | `useStaffPermission` hook should be receiving correct data |
| RLS Policies | **Issue Found** | Staff RLS policies for `members` and `member_details` tables don't properly connect `auth.uid()` to the staff's `auth_user_id` |

### Critical Issues Identified

1. **RLS Policy Gap for Member Updates**: The `member_details` UPDATE policy checks permissions via a JOIN but doesn't verify `auth.uid()` matches the staff's `auth_user_id`. This means the RLS layer can't confirm WHO is making the request.

2. **Route Access for Staff**: The Settings page route protection looks correct (`can_change_settings`), but need to verify the sidebar is showing the Settings link for staff with this permission.

3. **Direct Supabase Writes**: The `EditMemberDialog` uses direct Supabase client calls (`supabase.from("members").update(...)`). These rely entirely on RLS policies to authorize the write. If RLS policies are incorrectly structured, writes will fail silently or be denied.

## Solution Approach

### Phase 1: Fix Database RLS Policies

**Problem**: The RLS policies for staff member updates don't properly link `auth.uid()` to the staff record.

**Current Policy (member_details UPDATE)**:
```sql
EXISTS (
  SELECT 1
  FROM members m
  JOIN staff_permissions sp ON true  -- ❌ Missing auth.uid() check
  JOIN staff_branch_assignments sba ON sp.staff_id = sba.staff_id
  WHERE m.id = member_details.member_id
    AND sp.can_manage_members = true
    AND sba.branch_id = m.branch_id
)
```

**Fixed Policy**:
```sql
EXISTS (
  SELECT 1
  FROM staff s
  JOIN staff_permissions sp ON s.id = sp.staff_id
  JOIN staff_branch_assignments sba ON s.id = sba.staff_id
  JOIN members m ON m.branch_id = sba.branch_id
  WHERE s.auth_user_id = auth.uid()
    AND s.is_active = true
    AND sp.can_manage_members = true
    AND m.id = member_details.member_id
)
```

**Tables to Update**:
- `member_details` - UPDATE policy
- `subscriptions` - UPDATE policy (verify)
- `pt_subscriptions` - INSERT and UPDATE policies

### Phase 2: Verify Frontend Permission Loading

**Files to Check**:
- `StaffAuthContext.tsx` - Ensure `setPermissions()` is called with the full permissions object
- Verify the permissions structure matches what components expect

### Phase 3: Add Diagnostic Logging

For debugging, temporarily add console logs to:
1. `StaffAuthContext.verifySession()` - Log the received permissions
2. `MembersTable.tsx` - Log the `canManageMembers` computed value
3. `AdminSidebar.tsx` - Log which nav items are filtered in/out

## Detailed Implementation Steps

### Step 1: Database Migration - Fix RLS Policies

Create a migration to update the following RLS policies:

```text
1. member_details UPDATE policy
   - Add proper auth.uid() = staff.auth_user_id check
   
2. Verify members UPDATE policy
   - Already correct: checks s.auth_user_id = auth.uid()
   
3. Verify subscriptions UPDATE policy  
   - Already correct: checks s.auth_user_id = auth.uid()
```

### Step 2: Update EditMemberDialog for Staff

Currently `EditMemberDialog.tsx` uses direct Supabase calls. For staff users, route through the `staff-operations` Edge Function to bypass RLS and use service role:

```typescript
// In EditMemberDialog.tsx
if (isStaffLoggedIn) {
  const { error } = await staffOps.updateMember({
    branchId: currentBranch.id,
    memberId: member.id,
    name: memberUpdates.name,
    phone: memberUpdates.phone,
    // ... other fields
  });
} else {
  // Admin flow - direct Supabase
  await supabase.from("members").update(memberUpdates).eq("id", member.id);
}
```

### Step 3: Verify Navigation Sidebar

Confirm that `AdminSidebar.tsx` correctly shows Settings link for staff with `can_change_settings` permission:

- The `filterNavItems` function at line 163 correctly checks `permissions?.[item.requiresPermission] === true`
- Settings item has `requiresPermission: "can_change_settings"`
- This should work if permissions are loaded correctly

### Step 4: Add Debug Logging (Temporary)

Add console logs in `StaffAuthContext.tsx`:
```typescript
console.log("[Staff Auth] Permissions loaded:", permissions);
```

Add console logs in `AdminSidebar.tsx`:
```typescript
console.log("[Sidebar] Staff permissions:", permissions);
console.log("[Sidebar] Filtered nav items:", navItems.map(i => i.title));
console.log("[Sidebar] Filtered bottom items:", bottomNavItems.map(i => i.title));
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/EditMemberDialog.tsx` | Route staff updates through `staff-operations` Edge Function |
| `supabase/functions/staff-operations/index.ts` | Add/verify `update-member-details` action handler |
| Database Migration | Fix RLS policies for `member_details` table |
| `src/contexts/StaffAuthContext.tsx` | Add debug logging for permissions |
| `src/components/admin/AdminSidebar.tsx` | Add debug logging for nav filtering |

## Expected Outcome

After implementation:
1. Staff with `can_manage_members` permission can edit member details
2. Staff with `can_change_settings` permission can see and access Settings page
3. All permission-gated features work correctly for staff users
4. Activity logs properly attribute actions to staff

## Testing Checklist

1. Log in as staff user (phone: 7001090471)
2. Verify Settings link appears in sidebar
3. Click Settings - should load without "Access Denied"
4. Navigate to Dashboard
5. Click a member row to view details
6. Click "Edit" on a member
7. Change a field and save
8. Verify success toast appears
9. Check activity logs show staff action

