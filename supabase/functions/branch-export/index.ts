/**
 * Branch Export Edge Function
 *
 * Streams a complete .zip backup of a single branch's data, including:
 *  - All branch-scoped database rows (in dependency-aware order)
 *  - Linked storage objects from member-documents, branch-logos, event-assets, invoices
 *  - metadata.json + manifest.json for integrity verification
 *
 * Auth: caller must be super_admin OR tenant admin/owner of the branch's tenant.
 *
 * Output: application/zip stream with filename
 *   gymkloud-backup-{branch-slug}-{YYYYMMDD-HHmm}.zip
 */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

const BACKUP_VERSION = "1.0";

// Tables exported in this order. Order matters for restore (parents first).
const BRANCH_TABLES = [
  "gym_settings",
  "monthly_packages",
  "custom_packages",
  "gym_holidays",
  "members",
  "subscriptions",
  "personal_trainers",
  "trainer_time_slots",
  "pt_subscriptions",
  "time_slot_members",
  "member_exercise_plans",
  "daily_pass_users",
  "daily_pass_subscriptions",
  "payments",
  "invoices",
  "ledger_entries",
  "attendance_devices",
  "attendance_logs",
  "daily_attendance",
  "biometric_devices",
  "biometric_member_mappings",
  "biometric_enrollment_requests",
  "biometric_sync_logs",
  "events",
  "event_pricing_options",
  "event_custom_fields",
  "event_registrations",
  "event_registration_items",
  "staff_branch_assignments",
  "admin_activity_logs",
] as const;

// Member-scoped tables (resolved by member ids)
const MEMBER_SCOPED_TABLES = [
  "member_details",
  "member_assessments",
  "member_documents",
] as const;

const STORAGE_BUCKETS = ["member-documents", "branch-logos", "event-assets", "invoices"] as const;

// ----------------------------------------------------------------------------
// Auth helpers
// ----------------------------------------------------------------------------

interface AuthCtx {
  userId: string;
  isSuperAdmin: boolean;
}

async function authenticate(
  anon: SupabaseClient,
  service: SupabaseClient,
  authHeader: string | null
): Promise<AuthCtx> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const token = authHeader.replace("Bearer ", "").trim();
  const { data: claims, error } = await anon.auth.getClaims(token);
  if (error || !claims?.claims?.sub) throw new Error("UNAUTHENTICATED");
  const userId = String(claims.claims.sub);

  // Check super admin
  const { data: roles } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isSuperAdmin = (roles || []).some((r: { role: string }) => r.role === "super_admin");
  return { userId, isSuperAdmin };
}

async function authorizeBranch(
  service: SupabaseClient,
  ctx: AuthCtx,
  branchId: string
): Promise<{ tenant_id: string; name: string; slug: string }> {
  const { data: branch, error } = await service
    .from("branches")
    .select("id, tenant_id, name, slug")
    .eq("id", branchId)
    .maybeSingle();
  if (error || !branch) throw new Error("BRANCH_NOT_FOUND");
  if (ctx.isSuperAdmin) return branch as { tenant_id: string; name: string; slug: string };

  // Must be tenant admin/owner
  const { data: membership } = await service
    .from("tenant_members")
    .select("role, is_owner")
    .eq("user_id", ctx.userId)
    .eq("tenant_id", branch.tenant_id)
    .maybeSingle();
  const allowed = membership?.is_owner === true || membership?.role === "admin";
  if (!allowed) throw new Error("FORBIDDEN");
  return branch as { tenant_id: string; name: string; slug: string };
}

// ----------------------------------------------------------------------------
// Data collection helpers
// ----------------------------------------------------------------------------

async function fetchAll(
  service: SupabaseClient,
  table: string,
  column: string,
  value: string | string[]
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  let from = 0;
  const out: Record<string, unknown>[] = [];
  while (true) {
    let q = service.from(table).select("*").range(from, from + PAGE - 1);
    if (Array.isArray(value)) {
      if (value.length === 0) return out;
      q = q.in(column, value);
    } else {
      q = q.eq(column, value);
    }
    const { data, error } = await q;
    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// ----------------------------------------------------------------------------
// SHA-256 hex helper
// ----------------------------------------------------------------------------
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timestampForFilename(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ----------------------------------------------------------------------------
// Main handler
// ----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ctx = await authenticate(anon, service, req.headers.get("Authorization"));

    // Parse branchId from query or body
    const url = new URL(req.url);
    let branchId = url.searchParams.get("branch_id");
    if (!branchId && req.method === "POST") {
      try {
        const body = await req.json();
        branchId = body.branch_id;
      } catch { /* ignore */ }
    }
    if (!branchId) {
      return new Response(JSON.stringify({ error: "branch_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const branch = await authorizeBranch(service, ctx, branchId);

    // ---- Collect rows ----
    const data: Record<string, Record<string, unknown>[]> = {};
    const recordCounts: Record<string, number> = {};

    // Branches table (snapshot of the source row)
    data["branches"] = [
      (await fetchAll(service, "branches", "id", branchId))[0],
    ].filter(Boolean) as Record<string, unknown>[];
    recordCounts["branches"] = data["branches"].length;

    for (const t of BRANCH_TABLES) {
      data[t] = await fetchAll(service, t, "branch_id", branchId);
      recordCounts[t] = data[t].length;
    }

    // Member-scoped tables
    const memberIds = (data["members"] || []).map((m) => m.id as string).filter(Boolean);
    for (const t of MEMBER_SCOPED_TABLES) {
      data[t] = await fetchAll(service, t, "member_id", memberIds);
      recordCounts[t] = data[t].length;
    }

    // Plan-scoped tables (member_exercise_items has no branch_id; resolve via plan_id)
    const planIds = (data["member_exercise_plans"] || []).map((p) => p.id as string).filter(Boolean);
    data["member_exercise_items"] = await fetchAll(service, "member_exercise_items", "plan_id", planIds);
    recordCounts["member_exercise_items"] = data["member_exercise_items"].length;

    // Reference snapshots (read-only, never restored)
    const staffIds = Array.from(
      new Set((data["staff_branch_assignments"] || []).map((s) => s.staff_id as string).filter(Boolean))
    );
    const refStaff = await fetchAll(service, "staff", "id", staffIds);
    const refStaffPerms = await fetchAll(service, "staff_permissions", "staff_id", staffIds);
    data["_ref_staff"] = refStaff;
    data["_ref_staff_permissions"] = refStaffPerms;
    recordCounts["_ref_staff"] = refStaff.length;
    recordCounts["_ref_staff_permissions"] = refStaffPerms.length;

    // Coupons applicable to this branch (snapshot only)
    const { data: coupons } = await service
      .from("coupons")
      .select("*")
      .or(`applicable_branch_ids.cs.{${branchId}},branch_id.eq.${branchId}`);
    data["_ref_coupons"] = (coupons as Record<string, unknown>[]) || [];
    recordCounts["_ref_coupons"] = data["_ref_coupons"].length;

    // ---- Build the zip ----
    const zip = new JSZip();
    const manifest: Record<string, { sha256: string; bytes: number }> = {};

    // data/<table>.json
    for (const [tbl, rows] of Object.entries(data)) {
      const json = JSON.stringify(rows, null, 0);
      const bytes = new TextEncoder().encode(json);
      const path = `data/${tbl}.json`;
      zip.file(path, bytes);
      manifest[path] = { sha256: await sha256Hex(bytes), bytes: bytes.length };
    }

    // ---- Storage files ----
    let fileCount = 0;
    for (const bucket of STORAGE_BUCKETS) {
      // List recursively under {branch_id}/
      const listed = await listStorageRecursive(service, bucket, branchId);
      for (const filePath of listed) {
        // Skip our own auto-backup folder to avoid recursion bloat
        if (filePath.includes("/_backups/")) continue;
        const { data: blob, error } = await service.storage.from(bucket).download(filePath);
        if (error || !blob) continue;
        const buf = new Uint8Array(await blob.arrayBuffer());
        const path = `files/${bucket}/${filePath}`;
        zip.file(path, buf);
        manifest[path] = { sha256: await sha256Hex(buf), bytes: buf.length };
        fileCount++;
      }
    }

    // metadata.json
    const metadata = {
      version: BACKUP_VERSION,
      app: "GymKloud",
      exported_at: new Date().toISOString(),
      branch_id: branchId,
      branch_name: branch.name,
      branch_slug: branch.slug,
      tenant_id: branch.tenant_id,
      record_counts: recordCounts,
      file_count: fileCount,
    };
    const metaBytes = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
    zip.file("metadata.json", metaBytes);
    manifest["metadata.json"] = { sha256: await sha256Hex(metaBytes), bytes: metaBytes.length };

    // manifest.json (includes hashes of every other entry)
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // Best-effort activity log (don't fail the export if it errors)
    try {
      await service.from("admin_activity_logs").insert({
        admin_user_id: ctx.userId,
        branch_id: branchId,
        activity_category: "backup",
        activity_type: "branch_exported",
        description: `Exported branch backup (${Object.values(recordCounts).reduce((a, b) => a + b, 0)} rows, ${fileCount} files)`,
        entity_type: "branch",
        entity_id: branchId,
        entity_name: branch.name,
        metadata: { record_counts: recordCounts, file_count: fileCount, bytes: zipBytes.length },
      });
    } catch (_e) { /* ignore */ }

    const filename = `gymkloud-backup-${branch.slug}-${timestampForFilename()}.zip`;
    return new Response(zipBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zipBytes.length),
      },
    });
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    const status = msg === "UNAUTHENTICATED" ? 401
      : msg === "FORBIDDEN" ? 403
      : msg === "BRANCH_NOT_FOUND" ? 404
      : 500;
    console.error("[branch-export] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Recursive storage listing under a prefix
async function listStorageRecursive(
  service: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [prefix];
  while (stack.length) {
    const dir = stack.pop()!;
    const { data, error } = await service.storage.from(bucket).list(dir, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error || !data) continue;
    for (const entry of data) {
      const fullPath = `${dir}/${entry.name}`;
      // Folders have id === null
      if (entry.id === null) {
        stack.push(fullPath);
      } else {
        out.push(fullPath);
      }
    }
  }
  return out;
}
