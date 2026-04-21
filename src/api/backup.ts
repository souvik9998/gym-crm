/**
 * Backup & Restore API client
 * Wraps the branch-export and branch-import edge functions.
 */
import { getAuthToken } from "@/api/authenticatedFetch";
import { SUPABASE_URL, SUPABASE_ANON_KEY, getEdgeFunctionUrl } from "@/lib/supabaseConfig";

export async function exportBranch(branchId: string): Promise<{ blob: Blob; filename: string }> {
  const token = await getAuthToken();
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`${getEdgeFunctionUrl("branch-export")}?branch_id=${encodeURIComponent(branchId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || `gymkloud-backup-${branchId}.zip`;
  const blob = await res.blob();
  return { blob, filename };
}

export interface ImportResult {
  ok: boolean;
  target_branch_id: string;
  target_branch_name: string;
  source_branch_name: string;
  counts: Record<string, { expected: number; actual: number }>;
  files_uploaded: number;
  warnings: string[];
  pre_backup_url: string | null;
  log: string[];
}

export async function importBranch(
  branchId: string,
  file: File,
  allowCrossTenant: boolean
): Promise<ImportResult> {
  const token = await getAuthToken();
  if (!token) throw new Error("Authentication required");
  const form = new FormData();
  form.append("branch_id", branchId);
  form.append("allow_cross_tenant", String(allowCrossTenant));
  form.append("file", file);

  const res = await fetch(getEdgeFunctionUrl("branch-import"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: form,
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`) as Error & { details?: unknown };
    err.details = json;
    throw err;
  }
  return json as ImportResult;
}
