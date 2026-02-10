import { getAuthToken } from "./authenticatedFetch";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://nhfghwwpnqoayhsitqmp.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmdod3dwbnFvYXloc2l0cW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDExNTEsImV4cCI6MjA4MzExNzE1MX0.QMq4tpsNiKxX5lT4eyfMrNT6OtnPsm_CouOowDA5m1g";
const CHECK_IN_URL = `${SUPABASE_URL}/functions/v1/check-in`;

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

// Generate or retrieve a stable device UUID
export function getDeviceUUID(): string {
  // Migrate from old fingerprint key if present
  const oldFp = localStorage.getItem("attendance_device_fp");
  const existing = localStorage.getItem("attendance_device_uuid");
  if (existing) return existing;
  if (oldFp) {
    localStorage.setItem("attendance_device_uuid", oldFp);
    localStorage.removeItem("attendance_device_fp");
    return oldFp;
  }
  const uuid = crypto.randomUUID();
  localStorage.setItem("attendance_device_uuid", uuid);
  return uuid;
}

// Keep old export name for backward compatibility
export const getDeviceFingerprint = getDeviceUUID;

export function getMemberSessionToken(): string | null {
  return localStorage.getItem("attendance_session_token");
}

export function setMemberSessionToken(token: string) {
  localStorage.setItem("attendance_session_token", token);
}

export function clearMemberSessionToken() {
  localStorage.removeItem("attendance_session_token");
  localStorage.removeItem("attendance_device_uuid");
  localStorage.removeItem("attendance_device_fp");
}

// Member check-in (phone-based, no auth required)
export async function memberCheckIn(params: {
  phone?: string;
  branchId: string;
  deviceFingerprint: string;
  sessionToken?: string | null;
}) {
  const body: Record<string, string> = {
    branch_id: params.branchId,
    device_fingerprint: params.deviceFingerprint,
  };
  if (params.phone) body.phone = params.phone;
  if (params.sessionToken) body.session_token = params.sessionToken;

  const res = await fetch(`${CHECK_IN_URL}?action=member-check-in&branch_id=${params.branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error("Check-in failed");
  return res.json();
}

// Staff check-in (authenticated)
export async function staffCheckIn(branchId: string) {
  const fp = getDeviceFingerprint();
  return authenticatedFetch(`${CHECK_IN_URL}?action=check-in&branch_id=${branchId}`, {
    method: "POST",
    body: JSON.stringify({ branch_id: branchId, device_fingerprint: fp }),
  });
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
