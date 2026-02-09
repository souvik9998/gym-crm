

# QR-Based Attendance System

## Overview
Build a complete attendance tracking system where members and staff scan a printed QR code at the gym entrance using their phones. The system uses Supabase session cookies for device-bound authentication, an edge function for all server-side logic, and an admin dashboard for viewing attendance data.

## How It Works

**First Visit (New Device):**
1. User scans QR code which opens `/check-in?branch_id=UUID`
2. No session exists, so they're shown a login form (phone + password for staff, or phone-based lookup for members)
3. After authentication, attendance is marked automatically and the device is registered

**Subsequent Visits:**
1. User scans QR code
2. Supabase session cookie is already present in the browser
3. Attendance is marked instantly on page load -- zero interaction needed

**Expired Members:**
- Attendance is still logged but flagged as "expired"
- User sees an expiry notice and is redirected to the renewal page
- WhatsApp notification is sent to the admin

## Database Changes

### New Tables

**`attendance_logs`** -- Core attendance records
- `id`, `branch_id`, `user_type` (member/staff), `member_id`, `staff_id`
- `check_in_at`, `check_out_at`, `total_hours`, `date` (for daily grouping)
- `device_fingerprint`, `status` (checked_in/checked_out/expired)
- RLS policies scoped by branch_id and tenant_id

**`attendance_devices`** -- Registered device tracking
- `id`, `user_type`, `member_id`, `staff_id`, `branch_id`
- `device_fingerprint` (hash of user-agent + auth user ID)
- `registered_at`, `is_active`, `reset_by`, `reset_at`
- Unique constraint on (user_type + member_id/staff_id + branch_id)

### RLS Policies
- Admins and authorized staff can read all attendance data for their branches
- Members/staff can only read their own attendance records
- Insert/update only via the edge function (service role)

## Edge Function: `check-in`

Single function handling all logic via `action` query parameter:

**`action=check-in`** (default):
1. Validate Supabase session from Authorization header
2. Detect role: check if user email matches `staff_{phone}@gym.local` pattern (staff) or look up member by auth user ID
3. Validate device fingerprint against `attendance_devices`
4. For members: check subscription status (active/expired)
5. Anti-passback: prevent duplicate check-ins within 10 minutes
6. If user is already checked in today, mark check-out instead and calculate total hours
7. Log the attendance record
8. If member is expired: still log, return `{ status: "expired", redirect: "/renew" }`
9. Send WhatsApp notification to admin for expired member check-ins

**`action=register-device`**:
- Called after first-time login, saves device fingerprint

**`action=reset-device`** (admin only):
- Clears the registered device for a user, allowing re-registration

**`action=attendance-logs`** (admin/staff):
- Paginated attendance data with filters (date, branch, role, member/staff)

**`action=attendance-insights`**:
- Aggregated stats: daily footfall, peak hours, avg visit duration, staff working hours

## Frontend Components

### `/check-in` Page
- Reads `branch_id` from URL query params
- On mount: calls the `check-in` edge function with the current session
- If no session: shows a simple phone-number login form
- On success: shows a confirmation screen (green checkmark, name, time)
- On expired: shows expiry banner + auto-redirect to renewal page after 3 seconds
- On device mismatch: shows "Device not recognized" message with admin contact info

### Admin Dashboard -- Attendance Section

**Sidebar Addition:**
- New "Attendance" nav item in `AdminSidebar` (with `ClockIcon`)
- Route: `/admin/attendance`

**Attendance Page (`/admin/attendance`)** with 3 tabs:

1. **Members Attendance Tab**
   - Table: Member Name, Phone, Check-in Time, Check-out Time, Total Hours, Status
   - Date picker filter, branch filter
   - Export to Excel capability

2. **Staff Attendance Tab**
   - Table: Staff Name, Role, Check-in, Check-out, Total Hours, Late Flag
   - Late check-in detection (configurable threshold)
   - Monthly working hours summary

3. **Insights Tab**
   - Daily footfall chart (line/bar)
   - Peak hours heatmap
   - Average visit duration
   - Staff working hours summary cards

### QR Code Page Update
- Add an "Attendance QR" tab to the existing QR Code page
- Generates QR pointing to `/check-in?branch_id=UUID`
- Separate from the existing registration QR

## Technical Details

### New Files
- `supabase/functions/check-in/index.ts` -- Edge function
- `src/pages/CheckIn.tsx` -- Check-in page
- `src/pages/admin/Attendance.tsx` -- Admin attendance dashboard
- `src/components/admin/attendance/MembersAttendanceTab.tsx`
- `src/components/admin/attendance/StaffAttendanceTab.tsx`
- `src/components/admin/attendance/AttendanceInsightsTab.tsx`
- `src/api/attendance.ts` -- API layer for attendance data
- `src/hooks/queries/useAttendance.ts` -- TanStack Query hooks

### Modified Files
- `src/App.tsx` -- Add `/check-in` route and `/admin/attendance` route
- `src/components/admin/AdminSidebar.tsx` -- Add Attendance nav item
- `src/pages/admin/QRCode.tsx` -- Add Attendance QR tab
- `supabase/config.toml` -- Add `check-in` function config

### Device Binding Strategy
Since Supabase uses JWT tokens (not HTTP-only cookies), device binding will use a combination of:
- The Supabase auth session (persisted in localStorage)
- A device fingerprint (hash of user-agent + screen resolution + auth user ID) stored in `attendance_devices`
- This provides practical device-binding without requiring custom cookie infrastructure

### Member Authentication for Check-in
Members don't currently have Supabase Auth accounts. The check-in flow will:
1. Ask for phone number on first visit
2. Look up the member by phone + branch_id
3. Create a lightweight session token stored in localStorage (device-bound)
4. The edge function validates this token on subsequent visits

This avoids forcing members to create full auth accounts while maintaining device binding.

### Anti-Passback Logic
- On check-in, query for existing open attendance record (checked_in, no check_out) for the same day
- If found and within 10 minutes of last check-in: reject as duplicate
- If found and beyond 10 minutes: treat as check-out, calculate total hours
- If not found: create new check-in record

### WhatsApp Notification for Expired Members
Reuses the existing `send-whatsapp` edge function with a new template type for expired member check-ins, including member name, phone, branch, and timestamp.

