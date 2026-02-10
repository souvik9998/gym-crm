
# Fix Safari iPhone Attendance Check-in

## Problem
Safari on iPhone has aggressive privacy features (Intelligent Tracking Prevention) that can clear localStorage between sessions, especially when pages are opened via QR code scans. This causes the stored `attendance_device_uuid` and/or `attendance_session_token` to be lost, making the system think the device is unregistered.

Additionally, the current design uses the `device_fingerprint` value AS the session token (line 188 of the edge function), which tightly couples device identity with session identity -- if either value is lost from localStorage, the whole flow breaks.

## Solution

### 1. Use the device UUID as the single source of truth (not session token)

**`src/api/attendance.ts`**:
- Remove the separate `attendance_session_token` concept entirely
- Use ONLY `attendance_device_uuid` for both device identification AND session continuity
- On `getDeviceUUID()`, if the UUID is missing from localStorage, also check `sessionStorage` as a fallback (sessionStorage survives within the same tab even when localStorage is cleared by ITP)
- Store the UUID in BOTH localStorage and sessionStorage for redundancy

**`src/pages/CheckIn.tsx`**:
- Remove all references to `getMemberSessionToken()` and `setMemberSessionToken()`
- On mount, check if a device UUID exists. If yes, call `member-check-in` with just the `device_fingerprint` (the UUID)
- If no UUID exists, show the phone login form
- After successful first registration, the UUID is already stored -- no separate session token needed

### 2. Change the edge function to look up devices by device_fingerprint directly

**`supabase/functions/check-in/index.ts`** -- `handleMemberCheckIn`:
- Instead of checking for `session_token` first, check for `device_fingerprint` first
- If `device_fingerprint` is provided (returning user with stored UUID):
  - Look up `attendance_devices` where `device_fingerprint = device_fingerprint` AND `branch_id` AND `is_active = true`
  - If found, proceed with check-in (zero interaction)
  - If not found, show login form (UUID was regenerated after localStorage clear)
- If `phone` is provided (first-time or re-login):
  - Look up member by phone + branch
  - Check if member already has a registered device
  - If different device_fingerprint, return device_mismatch
  - If no device or inactive device, register this device and check in
- Remove the `session_token` field from responses entirely

### 3. Add sessionStorage fallback for Safari resilience

**`src/api/attendance.ts`** -- `getDeviceUUID()`:
```
function getDeviceUUID(): string | null {
  // Try localStorage first
  let uuid = localStorage.getItem("attendance_device_uuid");
  // Fallback to sessionStorage (survives Safari ITP within same tab)
  if (!uuid) uuid = sessionStorage.getItem("attendance_device_uuid");
  // Migrate old key
  if (!uuid) {
    const oldFp = localStorage.getItem("attendance_device_fp");
    if (oldFp) uuid = oldFp;
  }
  if (uuid) {
    // Persist in both stores for redundancy
    try { localStorage.setItem("attendance_device_uuid", uuid); } catch {}
    try { sessionStorage.setItem("attendance_device_uuid", uuid); } catch {}
    return uuid;
  }
  return null; // No existing UUID -- user needs to register
}

function createDeviceUUID(): string {
  const uuid = crypto.randomUUID();
  try { localStorage.setItem("attendance_device_uuid", uuid); } catch {}
  try { sessionStorage.setItem("attendance_device_uuid", uuid); } catch {}
  return uuid;
}
```

### 4. Updated CheckIn page flow

**`src/pages/CheckIn.tsx`**:
- On mount: call `getDeviceUUID()`
  - If UUID exists: call `memberCheckIn({ branchId, deviceFingerprint: uuid })` -- no phone needed
  - If no UUID: show phone form
- On phone submit: call `createDeviceUUID()` to generate a new UUID, then call `memberCheckIn({ phone, branchId, deviceFingerprint: newUuid })`
- Remove all `sessionToken` / `getMemberSessionToken` / `setMemberSessionToken` usage

---

## Files Modified

| File | Changes |
|------|---------|
| `src/api/attendance.ts` | Split `getDeviceUUID` into getter (returns null if missing) and `createDeviceUUID` (generates new). Add sessionStorage fallback. Remove `getMemberSessionToken`/`setMemberSessionToken`. |
| `src/pages/CheckIn.tsx` | Remove session token logic. Use device UUID as sole identifier. Call `createDeviceUUID` only on first phone registration. |
| `supabase/functions/check-in/index.ts` | Rewrite `handleMemberCheckIn` to look up by `device_fingerprint` directly instead of `session_token`. Remove session_token from responses. |

## Why This Fixes Safari

Safari's ITP can clear localStorage between visits when the site is opened from an external source (QR code). By:
1. Using sessionStorage as a fallback (persists within the tab)
2. Re-persisting the UUID to localStorage whenever it's read from sessionStorage
3. Eliminating the dual-storage problem (separate session_token AND device_uuid)
4. Making the system work with a single identifier

The most common Safari scenario -- scanning QR, closing tab, scanning again -- will attempt localStorage first. If cleared, the user simply re-enters their phone (which is acceptable for a new browser session). The device is already registered, so as long as the UUID matches, it works. If the UUID is truly lost (both stores cleared), the phone re-entry will detect the existing device registration and either match or show the admin-reset message.
