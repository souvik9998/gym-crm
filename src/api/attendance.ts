import { getAuthToken } from "./authenticatedFetch";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

const CHECK_IN_URL = getEdgeFunctionUrl("check-in");

async function authenticatedFetch(url: string, options?: RequestInit) {
  const token = await getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Member Device UUID ───

// Retrieve existing device UUID (returns null if not found)
export function getDeviceUUID(): string | null {
  let uuid = localStorage.getItem("attendance_device_uuid");
  if (!uuid) {
    try { uuid = sessionStorage.getItem("attendance_device_uuid"); } catch {}
  }
  if (!uuid) {
    const oldFp = localStorage.getItem("attendance_device_fp");
    if (oldFp) uuid = oldFp;
  }
  if (uuid) {
    try { localStorage.setItem("attendance_device_uuid", uuid); } catch {}
    try { sessionStorage.setItem("attendance_device_uuid", uuid); } catch {}
    try { localStorage.removeItem("attendance_device_fp"); } catch {}
    return uuid;
  }
  return null;
}

// Create a new device UUID and persist in both stores
export function createDeviceUUID(): string {
  const uuid = crypto.randomUUID();
  try { localStorage.setItem("attendance_device_uuid", uuid); } catch {}
  try { sessionStorage.setItem("attendance_device_uuid", uuid); } catch {}
  return uuid;
}

// Keep old export name for backward compatibility
export const getDeviceFingerprint = getDeviceUUID;

export function clearMemberSession() {
  try { localStorage.removeItem("attendance_device_uuid"); } catch {}
  try { localStorage.removeItem("attendance_device_fp"); } catch {}
  try { sessionStorage.removeItem("attendance_device_uuid"); } catch {}
}

// ─── Staff Device UUID (separate key to avoid conflicts on shared devices) ───

const STAFF_DEVICE_KEY = "staff_attendance_device_uuid";

export function getStaffDeviceUUID(): string | null {
  let uuid: string | null = null;
  try { uuid = localStorage.getItem(STAFF_DEVICE_KEY); } catch {}
  if (!uuid) {
    try { uuid = sessionStorage.getItem(STAFF_DEVICE_KEY); } catch {}
  }
  if (uuid) {
    try { localStorage.setItem(STAFF_DEVICE_KEY, uuid); } catch {}
    try { sessionStorage.setItem(STAFF_DEVICE_KEY, uuid); } catch {}
  }
  return uuid;
}

export function createStaffDeviceUUID(): string {
  const uuid = crypto.randomUUID();
  try { localStorage.setItem(STAFF_DEVICE_KEY, uuid); } catch {}
  try { sessionStorage.setItem(STAFF_DEVICE_KEY, uuid); } catch {}
  return uuid;
}

export function clearStaffDeviceSession() {
  try { localStorage.removeItem(STAFF_DEVICE_KEY); } catch {}
  try { sessionStorage.removeItem(STAFF_DEVICE_KEY); } catch {}
}

// ─── Member check-in (phone-based, no auth required) ───
export async function memberCheckIn(params: {
  phone?: string;
  branchId: string;
  deviceFingerprint: string;
}) {
  const body: Record<string, string> = {
    branch_id: params.branchId,
    device_fingerprint: params.deviceFingerprint,
  };
  if (params.phone) body.phone = params.phone;

  const res = await fetch(`${CHECK_IN_URL}?action=member-check-in&branch_id=${params.branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error("Check-in failed");
  return res.json();
}

// ─── Staff check-in (authenticated, with device binding) ───
export async function staffCheckIn(branchId: string) {
  // Ensure we have a staff device UUID
  let staffUuid = getStaffDeviceUUID();
  if (!staffUuid) {
    staffUuid = createStaffDeviceUUID();
  }
  return authenticatedFetch(`${CHECK_IN_URL}?action=check-in&branch_id=${branchId}`, {
    method: "POST",
    body: JSON.stringify({ branch_id: branchId, device_fingerprint: staffUuid }),
  });
}

// ─── Staff device-only check-in (unauthenticated, for Safari session loss) ───
export async function staffDeviceCheckIn(branchId: string, deviceUUID: string) {
  const res = await fetch(`${CHECK_IN_URL}?action=staff-device-check-in&branch_id=${branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ branch_id: branchId, device_fingerprint: deviceUUID }),
  });

  if (!res.ok) throw new Error("Staff device check-in failed");
  return res.json();
}

export interface AttendanceLogsResponse {
  data: AttendanceLog[];
  total: number;
  page: number;
  limit: number;
}

export interface AttendanceLog {
  id: string;
  branch_id: string;
  user_type: string;
  member_id: string | null;
  staff_id: string | null;
  check_in_at: string;
  check_out_at: string | null;
  total_hours: number | null;
  date: string;
  status: string;
  subscription_status: string | null;
  device_fingerprint: string | null;
  members?: { name: string; phone: string; email: string | null } | null;
  staff?: { full_name: string; phone: string; role: string } | null;
}

export interface AttendanceInsights {
  daily_footfall: { date: string; count: number }[];
  peak_hours: { hour: number; count: number }[];
  avg_visit_duration: number;
  staff_working_hours: Record<string, number>;
  unique_members: number;
  total_check_ins: number;
  period: { from: string; to: string };
}

// Fetch attendance logs (admin)
export async function fetchAttendanceLogs(params: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  userType?: string;
  page?: number;
  limit?: number;
}): Promise<AttendanceLogsResponse> {
  const searchParams = new URLSearchParams({ action: "attendance-logs" });
  if (params.branchId) searchParams.set("branch_id", params.branchId);
  if (params.dateFrom) searchParams.set("date_from", params.dateFrom);
  if (params.dateTo) searchParams.set("date_to", params.dateTo);
  if (params.userType) searchParams.set("user_type", params.userType);
  if (params.page) searchParams.set("page", params.page.toString());
  if (params.limit) searchParams.set("limit", params.limit.toString());

  return authenticatedFetch(`${CHECK_IN_URL}?${searchParams.toString()}`);
}

// Fetch attendance insights (admin)
export async function fetchAttendanceInsights(params: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AttendanceInsights> {
  const searchParams = new URLSearchParams({ action: "attendance-insights" });
  if (params.branchId) searchParams.set("branch_id", params.branchId);
  if (params.dateFrom) searchParams.set("date_from", params.dateFrom);
  if (params.dateTo) searchParams.set("date_to", params.dateTo);

  return authenticatedFetch(`${CHECK_IN_URL}?${searchParams.toString()}`);
}

// Reset device (admin)
export async function resetAttendanceDevice(params: {
  memberId?: string;
  staffId?: string;
  branchId: string;
}) {
  return authenticatedFetch(`${CHECK_IN_URL}?action=reset-device`, {
    method: "POST",
    body: JSON.stringify({
      member_id: params.memberId,
      staff_id: params.staffId,
      branch_id: params.branchId,
      user_type: params.memberId ? "member" : "staff",
    }),
  });
}
