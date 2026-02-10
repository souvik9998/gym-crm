

# Staff QR Attendance with Device Binding

## Problem
Currently, staff check-in via QR works only if there's an active Supabase Auth session, but there's no device binding for staff. The system doesn't enforce one-device-per-staff, and if the session is lost (common on Safari), staff can't check in at all.

## Solution

### 1. Separate Staff Device UUID Storage

Use a **separate** localStorage key (`staff_attendance_device_uuid`) so staff and member UUIDs don't conflict on shared devices. Store in both localStorage and sessionStorage for Safari resilience.

**File: `src/api/attendance.ts`**
- Add `getStaffDeviceUUID()` and `createStaffDeviceUUID()` -- same pattern as member functions but with a `staff_attendance_device_uuid` key
- Update `staffCheckIn()` to always send the staff device UUID alongside the auth token

### 2. Update CheckIn Page to Handle Staff Without Session

**File: `src/pages/CheckIn.tsx`**

Current flow:
1. Check Supabase Auth session -> if staff email pattern, call staffCheckIn
2. Else, do member flow

New flow:
1. Check Supabase Auth session -> if staff email pattern found:
   - Generate staff device UUID if none exists
   - Call `staffCheckIn(branchId)` with device UUID -- proceeds to check-in + device registration
2. If NO session but a `staff_attendance_device_uuid` EXISTS in localStorage:
   - Try `staffDeviceCheckIn(branchId, deviceUUID)` (new unauthenticated endpoint)
   - If the device is recognized, check in without login
   - If not recognized, fall through to member flow
3. Else, do member flow (phone-based)

### 3. Edge Function: Add Device Binding to Staff Check-in

**File: `supabase/functions/check-in/index.ts`**

#### Modify `handleCheckIn` (authenticated staff path):
- Accept `device_fingerprint` from body
- After identifying the staff member, check `attendance_devices` for existing registration:
  - If no device registered: register this `device_fingerprint` and proceed with check-in
  - If device registered with same fingerprint: proceed with check-in
  - If device registered with different fingerprint: return `device_mismatch`
- This enforces one-device-per-staff

#### Add new action `staff-device-check-in` (unauthenticated device-only path):
- Accepts `device_fingerprint` and `branch_id`
- Looks up `attendance_devices` where `user_type = 'staff'`, `device_fingerprint` matches, `is_active = true`
- If found, gets the `staff_id`, fetches staff details, and calls `processCheckIn`
- If not found, returns `login_required`
- This handles the Safari case where the session cookie is gone but the device UUID is still in localStorage

#### Update the router switch:
- Add case `"staff-device-check-in"` routing to the new handler

### 4. New API Function for Device-Only Staff Check-in

**File: `src/api/attendance.ts`**
- Add `staffDeviceCheckIn(branchId: string, deviceUUID: string)` -- calls the new `staff-device-check-in` action WITHOUT auth headers (just anon key)

---

## Flow Diagram

The complete staff attendance flow after these changes:

```text
Staff Scans QR (/check-in?branch_id=UUID)
         |
    Has Supabase Auth Session?
      /          \
    YES           NO
     |             |
  Staff email?   Has staff_device_uuid in localStorage?
    /     \        /          \
  YES      NO    YES           NO
   |        |     |             |
Generate   Member  Try device   Show member
staff UUID  flow   check-in     phone form
   |               /      \
Call auth'd    Found?    Not found
staffCheckIn    |           |
(registers     Check in   Fall to
device on      (zero       member
first use)     interaction) flow
```

---

## Files Modified

| File | Changes |
|------|---------|
| `src/api/attendance.ts` | Add `getStaffDeviceUUID()`, `createStaffDeviceUUID()`, `staffDeviceCheckIn()`. Update `staffCheckIn()` to include device UUID. |
| `src/pages/CheckIn.tsx` | Add staff device UUID generation on auth'd check-in. Add fallback to device-only staff check-in when no session but UUID exists. |
| `supabase/functions/check-in/index.ts` | Add device binding logic in `handleCheckIn`. Add new `staff-device-check-in` handler for unauthenticated device-based check-in. |

## No Database Changes Needed
The `attendance_devices` table already has `staff_id`, `device_fingerprint`, `is_active`, and all required columns.
