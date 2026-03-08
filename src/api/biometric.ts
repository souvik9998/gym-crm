import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

// ─── Types ───

export interface BiometricDevice {
  id: string;
  branch_id: string;
  device_name: string;
  device_brand: string;
  device_serial: string;
  device_ip: string | null;
  device_port: number;
  is_sync_enabled: boolean;
  is_active: boolean;
  last_sync_at: string | null;
  total_logs_received: number;
  api_key: string;
  created_at: string;
  updated_at: string;
}

export interface BiometricMemberMapping {
  id: string;
  branch_id: string;
  biometric_user_id: string;
  member_id: string | null;
  biometric_user_name: string | null;
  is_mapped: boolean;
  created_at: string;
  updated_at: string;
  members?: { name: string; phone: string } | null;
}

export interface BiometricSyncLog {
  id: string;
  device_id: string;
  branch_id: string;
  sync_status: string;
  logs_received: number;
  logs_processed: number;
  logs_duplicated: number;
  logs_unmapped: number;
  error_message: string | null;
  synced_at: string;
  biometric_devices?: { device_name: string; device_serial: string } | null;
}

export interface BiometricEnrollmentRequest {
  id: string;
  branch_id: string;
  member_id: string;
  device_id: string;
  enrollment_type: string;
  status: string;
  biometric_user_id: string | null;
  error_message: string | null;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

// ─── Devices CRUD ───

export async function fetchBiometricDevices(branchId?: string): Promise<BiometricDevice[]> {
  let query = supabase.from("biometric_devices" as any).select("*").eq("is_active", true).order("created_at", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as unknown as BiometricDevice[];
}

export async function addBiometricDevice(device: {
  branch_id: string;
  device_name: string;
  device_brand?: string;
  device_serial: string;
  device_ip?: string;
  device_port?: number;
}): Promise<BiometricDevice> {
  const { data, error } = await supabase.from("biometric_devices" as any).insert({
    branch_id: device.branch_id,
    device_name: device.device_name,
    device_brand: device.device_brand || "ZKTeco",
    device_serial: device.device_serial,
    device_ip: device.device_ip || null,
    device_port: device.device_port || 4370,
  }).select().single();
  if (error) throw new Error(error.message);
  return data as unknown as BiometricDevice;
}

export async function updateBiometricDevice(id: string, updates: Partial<BiometricDevice>): Promise<void> {
  const { error } = await supabase.from("biometric_devices" as any).update(updates).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteBiometricDevice(id: string): Promise<void> {
  const { error } = await supabase.from("biometric_devices" as any).update({ is_active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Member Mappings ───

export async function fetchBiometricMappings(branchId?: string): Promise<BiometricMemberMapping[]> {
  let query = supabase.from("biometric_member_mappings" as any)
    .select("*, members(name, phone)")
    .order("is_mapped", { ascending: true })
    .order("created_at", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as unknown as BiometricMemberMapping[];
}

export async function mapBiometricUser(mappingId: string, memberId: string): Promise<void> {
  const { error } = await supabase.from("biometric_member_mappings" as any).update({
    member_id: memberId,
    is_mapped: true,
    updated_at: new Date().toISOString(),
  }).eq("id", mappingId);
  if (error) throw new Error(error.message);
}

export async function unmapBiometricUser(mappingId: string): Promise<void> {
  const { error } = await supabase.from("biometric_member_mappings" as any).update({
    member_id: null,
    is_mapped: false,
    updated_at: new Date().toISOString(),
  }).eq("id", mappingId);
  if (error) throw new Error(error.message);
}

// ─── Sync Logs ───

export async function fetchBiometricSyncLogs(branchId?: string, limit = 50): Promise<BiometricSyncLog[]> {
  let query = supabase.from("biometric_sync_logs" as any)
    .select("*, biometric_devices(device_name, device_serial)")
    .order("synced_at", { ascending: false })
    .limit(limit);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as unknown as BiometricSyncLog[];
}

// ─── Enrollment ───

export async function createEnrollmentRequest(
  branchId: string,
  memberId: string,
  deviceId: string,
  enrollmentType: string = "fingerprint"
): Promise<{ enrollment_id: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token || null;

  const response = await fetch(
    getEdgeFunctionUrl("biometric-sync") + "?action=enroll",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        branch_id: branchId,
        member_id: memberId,
        device_id: deviceId,
        enrollment_type: enrollmentType,
      }),
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Failed to create enrollment request");
  }
  return result;
}

export async function checkMemberBiometricStatus(memberIds: string[], branchId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("biometric_member_mappings" as any)
    .select("member_id")
    .eq("branch_id", branchId)
    .eq("is_mapped", true)
    .in("member_id", memberIds);

  if (error) {
    console.error("Error checking biometric status:", error);
    return new Set();
  }

  return new Set((data || []).map((d: any) => d.member_id));
}
