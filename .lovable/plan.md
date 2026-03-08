

## Plan: Biometric Enrollment Feature

### Overview
Add a biometric enrollment flow that lets admins initiate fingerprint/RFID/face enrollment for members directly from the dashboard. The local sync agent polls for pending enrollment requests, triggers the device, and sends back the captured biometric ID which gets mapped to the member.

### Architecture

```text
Admin Dashboard                    Cloud API                     Local Agent
─────────────────                  ─────────────────              ──────────────
1. Click "Enroll Biometric"   →   2. Create enrollment_request   
                                     (status: pending)
3. Modal polls for status     ←   
                                  4. Agent polls pending reqs  ←  5. Agent fetches
                                  6. Agent puts device in       →  7. Device captures
                                     enroll mode                     fingerprint/RFID
                                  8. Agent sends biometric_id   →  9. API updates request
                                     back to cloud                   status: completed
                                  10. Maps biometric_id to member
11. Modal shows success       ←   
```

### Database Changes (1 migration)

**New table: `biometric_enrollment_requests`**
- `id` (uuid, PK)
- `branch_id` (uuid, NOT NULL)
- `member_id` (uuid, NOT NULL)  
- `device_id` (uuid, NOT NULL) — references `biometric_devices.id`
- `enrollment_type` (text: 'fingerprint' | 'rfid' | 'face')
- `status` (text: 'pending' | 'in_progress' | 'completed' | 'failed' | 'timeout')
- `biometric_user_id` (text, nullable) — set on completion
- `error_message` (text, nullable)
- `requested_by` (uuid) — admin user
- `created_at`, `updated_at`, `expires_at` (timestamp)

RLS: service_role full access, super_admin full access, tenant_members manage via branch join (same pattern as other biometric tables).

Enable realtime on this table for live status updates.

### Edge Function Changes (`biometric-sync/index.ts`)

Add 3 new actions:
1. **`enroll`** (POST, authenticated) — Creates a pending enrollment request. Validates member belongs to branch, device exists.
2. **`poll-enrollments`** (GET, agent auth via api_key) — Returns pending enrollment requests for a device.
3. **`complete-enrollment`** (POST, agent auth via api_key) — Marks request as completed/failed, creates/updates `biometric_member_mappings` entry.

### Frontend Changes

**1. New Component: `BiometricEnrollDialog.tsx`**
- Modal with member name/phone display
- Enrollment type selector (Fingerprint/RFID/Face pills)
- Device selector dropdown (fetches active devices for branch)
- "Start Enrollment" button
- Real-time status display using Supabase Realtime subscription on `biometric_enrollment_requests`
- Status states: Waiting → In Progress → Fingerprint Detected → Success / Error
- Timeout handling (auto-fail after 60s)
- Micro-animations for status transitions

**2. MembersTable.tsx** (2 locations: mobile cards + desktop rows)
- Add "Enroll Biometric" `DropdownMenuItem` with fingerprint icon after "Send Payment Details" 
- Add biometric enrolled indicator (small fingerprint icon badge) next to member name when they have a mapping in `biometric_member_mappings`
- New state: `enrollMember` to track which member's enrollment dialog is open

**3. API additions (`src/api/biometric.ts`)**
- `createEnrollmentRequest(branchId, memberId, deviceId, enrollmentType)`
- `checkMemberBiometricStatus(memberId)` — returns whether member has a mapping

### Files to Create/Edit
- **Create**: `src/components/admin/BiometricEnrollDialog.tsx`
- **Edit**: `src/components/admin/MembersTable.tsx` — add menu item + enrolled indicator
- **Edit**: `src/api/biometric.ts` — add enrollment API functions
- **Edit**: `supabase/functions/biometric-sync/index.ts` — add enroll/poll/complete actions
- **Migration**: Create `biometric_enrollment_requests` table with RLS + realtime

