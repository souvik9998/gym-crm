/**
 * Branch Import Edge Function
 *
 * Destructive restore of a branch from a backup .zip produced by branch-export.
 *
 * Phases:
 *   A. Validate (zip structure, metadata, manifest hashes, version)
 *   B. Auto-backup current branch (uploaded to member-documents/{branch}/_backups/)
 *   C. ID remap (every UUID regenerated, branch_id forced to target)
 *   D. Tenant limit guard (members/staff/branch headroom)
 *   E. Atomic restore via rpc('branch_restore_tx') (purge + bulk insert in one tx)
 *   F. Re-upload storage files under the new branch_id
 *   G. Verify counts vs metadata
 *
 * Auth: caller must be super_admin OR tenant admin/owner of the TARGET branch's tenant.
 *
 * Limit: 100 MB upload; aggregate uncompressed 500 MB.
 */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPPORTED_VERSIONS = ["1.0"];
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB

// Tables that the restore RPC will insert (must match restore RPC table order)
const RESTORE_TABLES = [
  "gym_settings",
  "monthly_packages",
  "custom_packages",
  "gym_holidays",
  "members",
  "member_details",
  "member_assessments",
  "member_documents",
  "subscriptions",
  "personal_trainers",
  "trainer_time_slots",
  "pt_subscriptions",
  "time_slot_members",
  "member_exercise_plans",
  "member_exercise_items",
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
];

// PK column for each table (default "id")
const PK_COLUMNS: Record<string, string> = {};
RESTORE_TABLES.forEach((t) => (PK_COLUMNS[t] = "id"));

// FK columns to remap. Map of table -> { column: refTable }.
// Special "branch_id" → target branch (handled separately).
// "staff_id" / "auth_user_id" / coupon refs → DROP rows / SKIP if unmapped (snapshot-only handling).
const FK_MAP: Record<string, Record<string, string>> = {
  members: {},
  member_details: { member_id: "members", personal_trainer_id: "personal_trainers" },
  member_assessments: { member_id: "members" },
  member_documents: { member_id: "members" },
  subscriptions: { member_id: "members" },
  personal_trainers: {},
  // trainer_id here references public.staff(id), not personal_trainers — handled via STAFF_FK_COLS below
  trainer_time_slots: {},
  pt_subscriptions: { member_id: "members", personal_trainer_id: "personal_trainers", time_slot_id: "trainer_time_slots" },
  time_slot_members: { time_slot_id: "trainer_time_slots", member_id: "members", subscription_id: "pt_subscriptions" },
  member_exercise_plans: { member_id: "members" },
  member_exercise_items: { plan_id: "member_exercise_plans" },
  daily_pass_users: {},
  daily_pass_subscriptions: {
    daily_pass_user_id: "daily_pass_users",
    package_id: "custom_packages",
    personal_trainer_id: "personal_trainers",
  },
  payments: {
    member_id: "members",
    subscription_id: "subscriptions",
    daily_pass_user_id: "daily_pass_users",
    daily_pass_subscription_id: "daily_pass_subscriptions",
  },
  invoices: {
    member_id: "members",
    payment_id: "payments",
    daily_pass_user_id: "daily_pass_users",
  },
  ledger_entries: {
    member_id: "members",
    payment_id: "payments",
    pt_subscription_id: "pt_subscriptions",
    trainer_id: "personal_trainers",
    daily_pass_user_id: "daily_pass_users",
  },
  attendance_devices: { member_id: "members" },
  attendance_logs: { member_id: "members" },
  daily_attendance: { member_id: "members", time_slot_id: "trainer_time_slots" },
  biometric_devices: {},
  biometric_member_mappings: { member_id: "members" },
  biometric_enrollment_requests: { member_id: "members", device_id: "biometric_devices" },
  biometric_sync_logs: { device_id: "biometric_devices" },
  events: {},
  event_pricing_options: { event_id: "events" },
  event_custom_fields: { event_id: "events" },
  event_registrations: {
    event_id: "events",
    member_id: "members",
    pricing_option_id: "event_pricing_options",
    payment_id: "payments",
  },
  event_registration_items: {
    registration_id: "event_registrations",
    pricing_option_id: "event_pricing_options",
  },
  staff_branch_assignments: {}, // staff_id handled specially
  admin_activity_logs: {},
  gym_settings: {},
  monthly_packages: {},
  custom_packages: {},
  gym_holidays: {},
};

// Columns that reference public.staff(id). Staff are tenant-wide (not branch-scoped) and
// are NEVER purged on restore. We remap by matching source-staff phone → target-staff id.
// If the source staff isn't present in the target tenant, we drop the row (or null if
// the column is nullable — see STAFF_FK_NULLABLE).
const STAFF_FK_COLS: Record<string, string[]> = {
  trainer_time_slots: ["trainer_id"], // NOT NULL → drop row when unmatched
};
const STAFF_FK_NULLABLE: Record<string, Set<string>> = {
  trainer_time_slots: new Set<string>(), // trainer_id is NOT NULL
};
const NULLABLE_AUDIT_COLS: Record<string, string[]> = {
  gym_holidays: ["created_by"],
  ledger_entries: ["created_by"],
  events: ["created_by"],
  member_documents: ["uploaded_by"],
  daily_attendance: ["marked_by"],
  admin_activity_logs: ["admin_user_id"],
};

const STORAGE_BUCKETS = ["member-documents", "branch-logos", "event-assets", "invoices"];

// ----------------------------------------------------------------------------
// Auth
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
  const { data: roles } = await service.from("user_roles").select("role").eq("user_id", userId);
  const isSuperAdmin = (roles || []).some((r: { role: string }) => r.role === "super_admin");
  return { userId, isSuperAdmin };
}

async function authorizeBranch(
  service: SupabaseClient,
  ctx: AuthCtx,
  branchId: string
): Promise<{ tenant_id: string; name: string; slug: string }> {
  const { data: branch } = await service
    .from("branches")
    .select("id, tenant_id, name, slug")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch) throw new Error("BRANCH_NOT_FOUND");
  if (ctx.isSuperAdmin) return branch as { tenant_id: string; name: string; slug: string };
  const { data: membership } = await service
    .from("tenant_members")
    .select("role, is_owner")
    .eq("user_id", ctx.userId)
    .eq("tenant_id", branch.tenant_id)
    .maybeSingle();
  if (!(membership?.is_owner || membership?.role === "admin")) throw new Error("FORBIDDEN");
  return branch as { tenant_id: string; name: string; slug: string };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function newUuid(): string {
  return crypto.randomUUID();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const buf = await crypto.subtle.digest("SHA-256", view);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeStoragePath(bucket: string, originalPath: string, oldBranchId: string, newBranchId: string): string | null {
  // Reject path traversal & absolute paths
  if (originalPath.includes("..") || originalPath.startsWith("/")) return null;
  // Replace leading {oldBranchId}/ with {newBranchId}/
  if (originalPath.startsWith(`${oldBranchId}/`)) {
    return newBranchId + originalPath.slice(oldBranchId.length);
  }
  // If it doesn't start with oldBranchId, prefix with newBranchId
  return `${newBranchId}/${originalPath}`;
}

function generateSlug(input: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function makeUniqueValue(base: string, used: Set<string>, fallback: string): string {
  const cleanBase = base.trim() || fallback.trim();
  if (!used.has(cleanBase)) {
    used.add(cleanBase);
    return cleanBase;
  }

  let suffix = 1;
  while (suffix <= 1000) {
    const candidate = `${cleanBase}-${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    suffix += 1;
  }

  const emergency = `${fallback.trim() || "imported"}-${newUuid().slice(0, 8)}`;
  used.add(emergency);
  return emergency;
}

async function fetchExistingStringValuesExcludingBranch(
  service: SupabaseClient,
  table: string,
  column: string,
  excludeBranchId: string
): Promise<Set<string>> {
  const PAGE = 1000;
  let from = 0;
  const out = new Set<string>();

  while (true) {
    const { data, error } = await service
      .from(table)
      .select(column)
      .neq("branch_id", excludeBranchId)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to read existing ${table}.${column}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as Record<string, unknown>[]) {
      const value = row[column];
      if (typeof value === "string" && value.trim()) out.add(value.trim());
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return out;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const warnings: string[] = [];
  const log: string[] = [];
  const trace = (m: string) => {
    log.push(`[${new Date().toISOString()}] ${m}`);
    console.log("[branch-import]", m);
  };

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

    // Parse multipart upload
    const form = await req.formData();
    const targetBranchId = String(form.get("branch_id") || "");
    const file = form.get("file");
    const allowCrossTenant = String(form.get("allow_cross_tenant") || "false") === "true";

    if (!targetBranchId) throw new Error("branch_id is required");
    if (!(file instanceof File)) throw new Error("file is required");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`);

    const targetBranch = await authorizeBranch(service, ctx, targetBranchId);
    trace(`Authorized for target branch ${targetBranch.name} (${targetBranchId})`);

    // ── Phase A: Validate ────────────────────────────────────────────────
    trace("Phase A: validating zip");
    const zipBytes = new Uint8Array(await file.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBytes);

    const metaFile = zip.file("metadata.json");
    if (!metaFile) throw new Error("Backup is missing metadata.json");
    const metadata = JSON.parse(await metaFile.async("string"));
    if (!SUPPORTED_VERSIONS.includes(metadata.version)) {
      throw new Error(`Unsupported backup version ${metadata.version}`);
    }
    if (metadata.app !== "GymKloud") throw new Error("Backup is not a GymKloud backup");
    const sourceBranchId = String(metadata.branch_id);
    const sourceTenantId = String(metadata.tenant_id || "");

    // Cross-tenant guard
    if (sourceTenantId && sourceTenantId !== targetBranch.tenant_id && !allowCrossTenant) {
      throw new Error("Cross-tenant restore requires explicit confirmation");
    }

    // Manifest hash check (best-effort: warn on mismatch, don't fail)
    const manifestFile = zip.file("manifest.json");
    let manifest: Record<string, { sha256: string; bytes: number }> = {};
    if (manifestFile) {
      manifest = JSON.parse(await manifestFile.async("string"));
    }

    // Aggregate size guard
    let totalBytes = 0;
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      if (path.includes("..") || path.startsWith("/")) {
        throw new Error(`Unsafe path in zip: ${path}`);
      }
      const data = await entry.async("uint8array");
      totalBytes += data.length;
      if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new Error(`Backup exceeds ${MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB uncompressed`);
      }
      if (manifest[path]) {
        const hash = await sha256Hex(data);
        if (hash !== manifest[path].sha256) {
          warnings.push(`Hash mismatch for ${path}`);
        }
      }
    }
    trace(`Validated ${Object.keys(zip.files).length} entries (${totalBytes} bytes uncompressed)`);

    // Read all data/*.json into memory
    const tableRows: Record<string, Record<string, unknown>[]> = {};
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const m = path.match(/^data\/(.+)\.json$/);
      if (!m) continue;
      const tableName = m[1];
      const json = await entry.async("string");
      try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) tableRows[tableName] = parsed;
      } catch (e) {
        throw new Error(`Invalid JSON in ${path}: ${(e as Error).message}`);
      }
    }
    trace(`Parsed ${Object.keys(tableRows).length} data files`);

    // ── Phase B: Auto-backup current branch ──────────────────────────────
    trace("Phase B: creating pre-restore backup of target branch");
    let preBackupUrl: string | null = null;
    try {
      // Call branch-export internally with the same auth header
      const expRes = await fetch(`${supabaseUrl}/functions/v1/branch-export?branch_id=${targetBranchId}`, {
        method: "GET",
        headers: { Authorization: req.headers.get("Authorization") || "", apikey: anonKey },
      });
      if (!expRes.ok) {
        const txt = await expRes.text();
        throw new Error(`Auto-backup export failed: ${txt}`);
      }
      const backupBytes = new Uint8Array(await expRes.arrayBuffer());
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${targetBranchId}/_backups/auto-backup-before-import-${stamp}.zip`;
      const { error: upErr } = await service.storage
        .from("member-documents")
        .upload(backupPath, backupBytes, { contentType: "application/zip", upsert: false });
      if (upErr) throw new Error(`Failed to store auto-backup: ${upErr.message}`);
      // Signed URL for 7 days
      const { data: signed } = await service.storage
        .from("member-documents")
        .createSignedUrl(backupPath, 60 * 60 * 24 * 7);
      preBackupUrl = signed?.signedUrl ?? null;
      trace(`Pre-restore backup stored at ${backupPath}`);
    } catch (e) {
      throw new Error(`Pre-restore backup failed (aborting import): ${(e as Error).message}`);
    }

    // ── Phase C: ID remap ────────────────────────────────────────────────
    trace("Phase C: remapping IDs");
    // For each table that has rows, build oldId → newId
    const idMap: Record<string, Map<string, string>> = {};
    for (const t of RESTORE_TABLES) {
      const rows = tableRows[t] || [];
      const m = new Map<string, string>();
      for (const r of rows) {
        const oldId = r[PK_COLUMNS[t]] as string | undefined;
        if (typeof oldId === "string") m.set(oldId, newUuid());
      }
      idMap[t] = m;
    }

    // Build set of staff phones in target tenant for snapshot-only matching
    const sourceStaff = (tableRows["_ref_staff"] as Record<string, unknown>[] | undefined) || [];
    const sourceStaffById = new Map<string, Record<string, unknown>>();
    sourceStaff.forEach((s) => sourceStaffById.set(String(s.id), s));

    // Resolve target staff by phone
    const sourcePhones = sourceStaff
      .map((s) => (s.phone as string) || "")
      .filter((p) => p.length > 0);
    let targetStaffByPhone = new Map<string, string>();
    if (sourcePhones.length > 0) {
      const { data: targetStaff } = await service
        .from("staff")
        .select("id, phone")
        .in("phone", sourcePhones);
      targetStaffByPhone = new Map(
        ((targetStaff as { id: string; phone: string }[]) || []).map((s) => [s.phone, s.id])
      );
    }

    const existingInvoiceNumbers = await fetchExistingStringValuesExcludingBranch(
      service,
      "invoices",
      "invoice_number",
      targetBranchId
    );
    const existingEventSlugs = await fetchExistingStringValuesExcludingBranch(
      service,
      "events",
      "slug",
      targetBranchId
    );

    // Apply remap: produce final payload table-by-table
    const payload: Record<string, Record<string, unknown>[]> = {};
    for (const t of RESTORE_TABLES) {
      const rows = tableRows[t];
      if (!rows || rows.length === 0) continue;
      const out: Record<string, unknown>[] = [];
      for (const r of rows) {
        const newRow: Record<string, unknown> = { ...r };

        // Remap PK
        const oldId = newRow[PK_COLUMNS[t]] as string | undefined;
        if (typeof oldId === "string") {
          newRow[PK_COLUMNS[t]] = idMap[t].get(oldId) ?? newUuid();
        } else {
          newRow[PK_COLUMNS[t]] = newUuid();
        }

        // Force branch_id to target (where the column exists)
        if ("branch_id" in newRow) newRow.branch_id = targetBranchId;

        // Normalize imported app-wide unique fields so restore never collides with
        // rows outside the target branch.
        if (t === "invoices" && typeof newRow.invoice_number === "string") {
          const originalInvoiceNumber = newRow.invoice_number.trim();
          const normalizedInvoiceNumber = makeUniqueValue(
            originalInvoiceNumber,
            existingInvoiceNumbers,
            originalInvoiceNumber || `INV-${Date.now()}`
          );
          if (normalizedInvoiceNumber !== originalInvoiceNumber) {
            warnings.push(
              `Adjusted invoice_number during import: ${originalInvoiceNumber} → ${normalizedInvoiceNumber}`
            );
          }
          newRow.invoice_number = normalizedInvoiceNumber;
        }

        if (t === "events") {
          const originalSlug = typeof newRow.slug === "string" ? newRow.slug.trim() : "";
          const title = typeof newRow.title === "string" ? newRow.title.trim() : "event";
          const baseSlug = originalSlug || `${generateSlug(title)}-${String(newRow.id).slice(0, 6)}`;
          const normalizedSlug = makeUniqueValue(baseSlug, existingEventSlugs, `${generateSlug(title)}-${newUuid().slice(0, 6)}`);
          if (originalSlug && normalizedSlug !== originalSlug) {
            warnings.push(`Adjusted event slug during import: ${originalSlug} → ${normalizedSlug}`);
          }
          newRow.slug = normalizedSlug;
        }

        // Remap FKs
        const fks = FK_MAP[t] || {};
        let dropRow = false;
        for (const [col, refTable] of Object.entries(fks)) {
          const v = newRow[col];
          if (v === null || v === undefined) continue;
          const map = idMap[refTable];
          if (!map) continue;
          const mapped = map.get(String(v));
          if (mapped) {
            newRow[col] = mapped;
          } else {
            // Reference doesn't exist in payload → null it out (or drop if NOT NULL)
            newRow[col] = null;
          }
        }

        // Special-case: staff_branch_assignments → only keep if a target staff matches by phone
        if (t === "staff_branch_assignments") {
          const oldStaffId = String(r.staff_id || "");
          const sourceStaffRow = sourceStaffById.get(oldStaffId);
          const phone = sourceStaffRow ? (sourceStaffRow.phone as string) : "";
          const targetStaffId = phone ? targetStaffByPhone.get(phone) : undefined;
          if (!targetStaffId) {
            dropRow = true;
          } else {
            newRow.staff_id = targetStaffId;
          }
        }

        // Generic staff FK remap: source staff id → target staff id (matched by phone).
        // Drop the row if the column is NOT NULL and no target staff matches.
        const staffCols = STAFF_FK_COLS[t] || [];
        for (const col of staffCols) {
          const oldVal = newRow[col];
          if (oldVal === null || oldVal === undefined) continue;
          const sourceStaffRow = sourceStaffById.get(String(oldVal));
          const phone = sourceStaffRow ? (sourceStaffRow.phone as string) : "";
          const targetStaffId = phone ? targetStaffByPhone.get(phone) : undefined;
          if (targetStaffId) {
            newRow[col] = targetStaffId;
          } else if (STAFF_FK_NULLABLE[t]?.has(col)) {
            newRow[col] = null;
          } else {
            warnings.push(
              `Dropped ${t} row: source staff ${oldVal} not present in target tenant (no phone match)`
            );
            dropRow = true;
            break;
          }
        }
        for (const c of NULLABLE_AUDIT_COLS[t] || []) {
          if (c in newRow) newRow[c] = null;
        }

        if (dropRow) continue;
        out.push(newRow);
      }
      if (out.length > 0) payload[t] = out;
    }

    // ── Phase D: Tenant limit guard ───────────────────────────────────────
    trace("Phase D: tenant limit guard");
    const memberCount = (payload["members"] || []).length;
    if (memberCount > 0 && !ctx.isSuperAdmin) {
      // Check headroom: get current usage minus the branch we're wiping + restore count
      const { data: limits } = await service
        .from("tenant_limits")
        .select("max_members")
        .eq("tenant_id", targetBranch.tenant_id)
        .maybeSingle();
      if (limits?.max_members) {
        // Members in other branches of the tenant
        const { data: otherBranches } = await service
          .from("branches")
          .select("id")
          .eq("tenant_id", targetBranch.tenant_id)
          .neq("id", targetBranchId);
        const otherIds = ((otherBranches as { id: string }[]) || []).map((b) => b.id);
        let otherMembers = 0;
        if (otherIds.length > 0) {
          const { count } = await service
            .from("members")
            .select("id", { count: "exact", head: true })
            .in("branch_id", otherIds);
          otherMembers = count || 0;
        }
        if (otherMembers + memberCount > limits.max_members) {
          throw new Error(
            `Restore would exceed plan limit: ${otherMembers + memberCount} members vs ${limits.max_members} allowed`
          );
        }
      }
    }

    // ── Phase E: Atomic restore via RPC ───────────────────────────────────
    trace(`Phase E: invoking branch_restore_tx (${Object.keys(payload).length} tables)`);
    const { data: rpcResult, error: rpcError } = await service.rpc("branch_restore_tx", {
      _branch_id: targetBranchId,
      _payload: payload,
      _caller_id: ctx.userId,
    });
    if (rpcError) throw new Error(`Database restore failed: ${rpcError.message}`);
    trace(`Restore RPC succeeded: ${JSON.stringify(rpcResult)}`);

    // ── Phase F: Re-upload files ─────────────────────────────────────────
    trace("Phase F: uploading files");
    let uploadedFiles = 0;
    const fileWarnings: string[] = [];
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const m = path.match(/^files\/([^/]+)\/(.+)$/);
      if (!m) continue;
      const [, bucket, originalPath] = m;
      if (!STORAGE_BUCKETS.includes(bucket)) {
        fileWarnings.push(`Skipped unknown bucket: ${bucket}`);
        continue;
      }
      const newPath = safeStoragePath(bucket, originalPath, sourceBranchId, targetBranchId);
      if (!newPath) {
        fileWarnings.push(`Skipped unsafe path: ${originalPath}`);
        continue;
      }
      const data = await entry.async("uint8array");
      const { error: upErr } = await service.storage.from(bucket).upload(newPath, data, { upsert: true });
      if (upErr) {
        fileWarnings.push(`${bucket}/${newPath}: ${upErr.message}`);
      } else {
        uploadedFiles++;
      }
    }
    trace(`Uploaded ${uploadedFiles} files (${fileWarnings.length} warnings)`);
    warnings.push(...fileWarnings);

    // ── Phase G: Verify counts ───────────────────────────────────────────
    trace("Phase G: verifying record counts");
    const verifyCounts: Record<string, { expected: number; actual: number }> = {};
    for (const t of RESTORE_TABLES) {
      const expected = (payload[t] || []).length;
      if (expected === 0) continue;
      let column: string;
      let value: string | string[];
      if (t === "member_details" || t === "member_assessments" || t === "member_documents") {
        column = "member_id";
        value = (payload["members"] || []).map((m) => m.id as string);
        if ((value as string[]).length === 0) continue;
      } else if (t === "member_exercise_items") {
        column = "plan_id";
        value = (payload["member_exercise_plans"] || []).map((m) => m.id as string);
        if ((value as string[]).length === 0) continue;
      } else if (t === "event_pricing_options" || t === "event_custom_fields" || t === "event_registrations") {
        column = "event_id";
        value = (payload["events"] || []).map((m) => m.id as string);
        if ((value as string[]).length === 0) continue;
      } else if (t === "event_registration_items") {
        column = "registration_id";
        value = (payload["event_registrations"] || []).map((m) => m.id as string);
        if ((value as string[]).length === 0) continue;
      } else if (t === "trainer_time_slots" || t === "personal_trainers") {
        column = "branch_id";
        value = targetBranchId;
      } else if (t === "pt_subscriptions") {
        column = "branch_id";
        value = targetBranchId;
      } else if (t === "time_slot_members") {
        column = "time_slot_id";
        value = (payload["trainer_time_slots"] || []).map((m) => m.id as string);
        if ((value as string[]).length === 0) continue;
      } else {
        column = "branch_id";
        value = targetBranchId;
      }
      let q = service.from(t).select("id", { count: "exact", head: true });
      q = Array.isArray(value) ? q.in(column, value) : q.eq(column, value);
      const { count } = await q;
      verifyCounts[t] = { expected, actual: count || 0 };
      if ((count || 0) !== expected) {
        warnings.push(`Count mismatch in ${t}: expected ${expected}, got ${count || 0}`);
      }
    }

    // Activity log
    try {
      await service.from("admin_activity_logs").insert({
        admin_user_id: ctx.userId,
        branch_id: targetBranchId,
        activity_category: "restore",
        activity_type: "branch_restored",
        description: `Restored branch from backup of "${metadata.branch_name}" (${memberCount} members)`,
        entity_type: "branch",
        entity_id: targetBranchId,
        entity_name: targetBranch.name,
        metadata: {
          source_branch_id: sourceBranchId,
          source_tenant_id: sourceTenantId,
          source_branch_name: metadata.branch_name,
          counts: verifyCounts,
          file_warnings: fileWarnings.length,
          pre_backup_url: preBackupUrl,
          cross_tenant: sourceTenantId !== targetBranch.tenant_id,
        },
      });
    } catch (_e) { /* ignore */ }

    return new Response(
      JSON.stringify({
        ok: true,
        target_branch_id: targetBranchId,
        target_branch_name: targetBranch.name,
        source_branch_name: metadata.branch_name,
        counts: verifyCounts,
        files_uploaded: uploadedFiles,
        warnings,
        pre_backup_url: preBackupUrl,
        log,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    const status = msg === "UNAUTHENTICATED" ? 401
      : msg === "FORBIDDEN" ? 403
      : msg === "BRANCH_NOT_FOUND" ? 404
      : 400;
    console.error("[branch-import] error:", msg);
    return new Response(
      JSON.stringify({ error: msg, log, warnings }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
