
# Attendance System Modifications

## Overview
Four targeted changes to the existing QR attendance system: switch to stable device UUIDs, fix anti-passback timing, add admin device-reset UI for members, and enrich attendance logs with more detail.

---

## 1. Stable Device UUID (Replace Fingerprint Hashing)

**Current**: `getDeviceFingerprint()` generates a hash from user-agent, screen size, timezone, and random values -- stored in localStorage as `attendance_device_fp`.

**Change**: Replace the hash-based fingerprint with a simple `crypto.randomUUID()` stored in localStorage as `attendance_device_uuid`. This is stable across sessions and won't change if the browser updates its user-agent string.

### Files Modified
- **`src/api/attendance.ts`**: Rename `getDeviceFingerprint()` to `getDeviceUUID()`. On first call, generate `crypto.randomUUID()`, store in localStorage under `attendance_device_uuid`. On subsequent calls, return the stored value. Migrate any existing `attendance_device_fp` value to the new key for backward compatibility.
- **`supabase/functions/check-in/index.ts`**: All references to `device_fingerprint` in logic remain the same column name in the DB, but the value will now be a UUID instead of a hash. No DB schema change needed -- the column is already `text`.
- **`src/pages/CheckIn.tsx`**: Update to use `getDeviceUUID()` instead of `getDeviceFingerprint()`.

---

## 2. Fix Anti-Passback: 10-Min Gap Only Between Check-in and Check-out

**Current**: The 10-minute anti-passback applies to ANY scan after the last action (check-in or check-out), which means after checking out, the member must wait 10 minutes to check in again.

**Change**: Apply the 10-minute cooldown ONLY when the member is currently checked in (to prevent accidental immediate check-out). After a check-out (status = `checked_out`), allow immediate re-check-in.

### Files Modified
- **`supabase/functions/check-in/index.ts`** -- `processCheckIn()` function:
  - If the latest log has `status = "checked_in"` or `"expired"` AND less than 10 minutes have passed since `check_in_at`, return `duplicate`.
  - If the latest log has `status = "checked_out"`, skip the time check entirely and allow a new check-in immediately.

---

## 3. Admin Device Reset UI for Members

**Current**: The `reset-device` endpoint exists in the edge function but there's no UI for admins to trigger it.

**Change**: Add a "Reset Device" button in the Members Attendance tab for each member row, and also in the member detail/edit dialog.

### Files Modified
- **`src/components/admin/attendance/MembersAttendanceTab.tsx`**:
  - Add a new "Actions" column to the table.
  - Add a "Reset Device" button per row that calls `resetAttendanceDevice({ memberId, branchId })`.
  - Show a confirmation dialog before resetting.
  - Show success/error toast after the action.

- **`src/api/attendance.ts`**: The `resetAttendanceDevice` function already exists -- no changes needed.

---

## 4. Enrich Attendance Logs with More Detail

**Current**: The attendance logs table shows Name, Phone, Check In, Check Out, Hours, Status. The edge function returns joined `members(name, phone)` and `staff(full_name, phone, role)`.

**Change**: Add more columns and data to give admins a complete picture.

### Edge Function Changes (`supabase/functions/check-in/index.ts`)
- In `handleAttendanceLogs`, expand the select to include:
  - `members(name, phone, email)` (add email)
  - `staff(full_name, phone, role, email)` (add email)
  - `device_fingerprint` column (so admin can see which device was used)
- In `processCheckIn`, store the member's subscription status in the log (add to the insert).

### Database Migration
- Add `subscription_status` column to `attendance_logs` table (text, nullable, default null) to record the member's subscription state at check-in time.

### Frontend Changes
- **`src/components/admin/attendance/MembersAttendanceTab.tsx`**:
  - Add columns: Date, Email, Subscription Status, Device ID (truncated), Actions (Reset Device)
  - Make the table horizontally scrollable on mobile
- **`src/components/admin/attendance/StaffAttendanceTab.tsx`**:
  - Add columns: Date, Email, Device ID (truncated)
- **`src/api/attendance.ts`**: Update `AttendanceLog` interface to include `subscription_status`, `device_fingerprint`, and expanded member/staff fields with `email`.

---

## Technical Summary

### Files to Create
None.

### Files to Modify
| File | Changes |
|------|---------|
| `src/api/attendance.ts` | Replace fingerprint with UUID generator; update `AttendanceLog` interface |
| `src/pages/CheckIn.tsx` | Use `getDeviceUUID()` |
| `supabase/functions/check-in/index.ts` | Fix anti-passback logic; store `subscription_status` in log; expand select in attendance-logs |
| `src/components/admin/attendance/MembersAttendanceTab.tsx` | Add Date, Email, Subscription Status, Device, Actions columns; add Reset Device button |
| `src/components/admin/attendance/StaffAttendanceTab.tsx` | Add Date, Email columns |

### Database Migration
- `ALTER TABLE attendance_logs ADD COLUMN subscription_status text DEFAULT null;`
