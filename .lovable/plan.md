

## Branch Backup & Restore (Export / Import)

A new **Backup & Restore** tab inside Settings, visible only to gym owners (admin role). Zero changes to existing tables, RLS, or features — all heavy lifting runs in two new edge functions.

---

### 1. Export

**UI** (new tab `?tab=backup` in `src/pages/admin/Settings.tsx`)
- "Export this branch" card showing: current branch name, last export timestamp (from `localStorage`), a primary "Export Branch Data" button, and a progress toast.
- Clicking calls a new edge function `branch-export` which streams a `.zip` back to the browser; the file is auto-downloaded as `gymkloud-backup-{branch-slug}-{YYYYMMDD-HHmm}.zip`.

**Edge function `branch-export`**
- Auth: validates JWT, confirms caller is admin/owner of the tenant that owns the branch.
- Reads every branch-scoped table using the service-role key (so RLS can't silently drop rows). Tables in scope:
  - Direct `branch_id`: `branches`, `gym_settings`, `members`, `subscriptions`, `pt_subscriptions`, `payments`, `invoices`, `ledger_entries`, `monthly_packages`, `custom_packages`, `personal_trainers`, `trainer_time_slots`, `time_slot_members`, `gym_holidays`, `attendance_logs`, `attendance_devices`, `daily_attendance`, `daily_pass_users`, `daily_pass_subscriptions`, `biometric_devices`, `biometric_enrollment_requests`, `biometric_member_mappings`, `biometric_sync_logs`, `events`, `event_pricing_options`, `event_custom_fields`, `event_registrations`, `event_registration_items`, `member_exercise_plans`, `report_schedules`, `staff_branch_assignments`, `admin_activity_logs` (filtered).
  - Member-scoped (resolved by member ids): `member_details`, `member_assessments`, `member_documents`, `member_exercise_items`.
  - Reference snapshots (NOT touched on import): `staff` rows for assigned staff, `staff_permissions`, `coupons` & `coupon_usage` whose `applicable_branch_ids` includes the branch.
- Downloads the binary contents of every storage object referenced (paths starting with `{branch_id}/` in buckets `member-documents`, `branch-logos`, `event-assets`, `invoices`) and writes them under `files/<bucket>/<original-path>` inside the zip.
- Builds the zip in memory using `jszip` (or Deno `std/archive`) with this layout:
  ```
  metadata.json              { version, exported_at, branch_id, branch_name,
                               tenant_id, app: "GymKloud", record_counts, file_count }
  data/<table>.json          one file per table, array of rows
  files/<bucket>/<path>      original storage objects
  manifest.json              sha-256 of every entry, for integrity check
  ```
- Returns the zip as `application/zip`. Logs an entry to `admin_activity_logs` (`activity_category: "backup"`).

---

### 2. Import (destructive, branch-only restore)

**UI**
- Separate "Restore into this branch" card with a red border and warning banner.
- File picker (`.zip` only). On selection, the file is parsed in the browser just enough to read `metadata.json` and the row counts from each `data/*.json` (using `jszip`, no upload yet).
- Preview panel renders: source branch name + tenant, export date, file count, per-table record counts, and a green/red badge for version compatibility.
- **Two-step gate** before the Import button enables:
  1. Checkbox: *"I understand this will permanently delete all existing data in **{current branch name}** and replace it with the uploaded backup."*
  2. Text input: must equal `DELETE` (case-sensitive).
- **Migration mode badge**: when `metadata.tenant_id` differs from the target tenant, show an extra orange notice — *"Cross-tenant migration: IDs will be remapped, foreign references rewritten."* — and require a third confirmation checkbox: *"I'm intentionally restoring data from a different organization."*
- During import: a blocking overlay shows a stepped progress list ("Validating… Uploading… Backing up current data… Deleting… Restoring members… Restoring payments… Verifying…") driven by Server-Sent Events from the edge function (or sequential POSTs with progress polling — see Technical).
- On success: toast + summary card. On failure: toast + a "Download error log" button that saves a `.txt` of the server-returned error trace.

**Edge function `branch-import`**
- Accepts a multipart upload of the zip. Auth: must be admin/owner of the **target** tenant. Limit 100 MB.
- **Phase A — Validate**: unzip in memory, assert `metadata.json` schema, version === supported, every `data/*.json` parses, manifest hashes match, no path traversal in `files/`.
- **Phase B — Auto-backup**: invokes `branch-export` internally for the target branch and uploads the resulting zip to `member-documents` bucket at `{branch_id}/_backups/auto-backup-before-import-{ts}.zip`. Returns the storage URL to the client so the user can download it from a "Pre-restore backup" link in the success toast. Import is aborted if this step fails.
- **Phase C — ID remap**: builds an in-memory map `{ oldId → newId }` for every primary key in every table by generating a fresh UUID. The target `branch_id` is forced to the current branch (not the source). All foreign keys (`member_id`, `subscription_id`, `personal_trainer_id`, `time_slot_id`, `event_id`, `package_id`, `staff_id`, etc.) are rewritten through the map before insert. This guarantees referential integrity and prevents collisions with other branches/tenants.
- **Phase D — Delete current branch data**: a single PostgreSQL transaction (via `rpc('branch_purge', { _branch_id })`) deletes rows from every in-scope table in dependency order. Tables NOT touched: `staff`, `staff_permissions`, `tenants`, `tenant_members`, `tenant_limits`, `user_roles`, `auth.users`, `platform_*`. `staff_branch_assignments` is wiped for this branch then recreated only when a backup-side staff phone matches an existing staff row in the target tenant; otherwise that assignment is skipped (per "snapshot only" decision).
- **Phase E — Insert in order**: rows are inserted in batches of 500 in dependency order (packages → members → member_details → subscriptions → personal_trainers → pt_subscriptions → time_slots → time_slot_members → payments → invoices → ledger_entries → attendance/biometric → events → event_*  → logs). Everything runs inside one DB transaction (`rpc('branch_restore_tx', { payload })`). Any error → `ROLLBACK`, the pre-restore backup remains untouched, the user sees the error.
- **Phase F — Files**: storage objects are uploaded under the **new** branch_id with rewritten paths. Storage uploads happen after the DB commit; if a file fails, the import is reported as "completed with N file warnings" and the warnings are added to the error log (DB integrity is preserved).
- **Phase G — Verify**: re-counts every restored table and compares with `metadata.record_counts`. Mismatch → returns a warning (not a hard fail since logs may have been filtered server-side).
- **Tenant limit guard**: before Phase D, calls `tenant_can_add_resource` for `member`, `staff`, `branch` against the post-restore counts. If the restore would exceed the tenant's plan, abort with a clear message before any destructive action.
- Logs the operation to `admin_activity_logs` (`activity_category: "restore"`, `metadata` includes source branch, counts, pre-restore backup URL).

---

### 3. Database changes

A single migration adds two helper RPCs (no schema changes to existing tables):

| RPC | Purpose |
|---|---|
| `branch_purge(_branch_id uuid)` | `SECURITY DEFINER` function that deletes branch-scoped rows in dependency order. Caller authorization is checked via `is_tenant_admin(auth.uid(), get_tenant_from_branch(_branch_id))`. |
| `branch_restore_tx(_branch_id uuid, _payload jsonb)` | `SECURITY DEFINER` function that wraps purge + bulk insert in one transaction. Receives the already-remapped JSON payload from the edge function. |

Both are invoked **only** from the edge function with the service-role key, so the existing `protectedFetch` flow is untouched.

---

### 4. Frontend additions

| File | Purpose |
|---|---|
| `src/pages/admin/Settings.tsx` | Add "Backup & Restore" tab gated by `useIsAdmin().isGymOwner` (hidden for staff entirely). |
| `src/components/admin/backup/BackupRestoreTab.tsx` | Container with two cards. |
| `src/components/admin/backup/ExportCard.tsx` | Triggers download, tracks last-export time in `localStorage`. |
| `src/components/admin/backup/ImportCard.tsx` | File picker, preview, two-step confirmation, migration-mode banner, progress overlay, error-log download. |
| `src/components/admin/backup/ImportProgressOverlay.tsx` | Full-screen overlay (matches existing `WhatsAppSendingOverlay` style) with stepped progress. |
| `src/lib/backup/zipReader.ts` | Browser-side JSZip helper to read metadata + counts without uploading. |
| `src/api/backup.ts` | `exportBranch()` and `importBranch(file, onProgress)` wrappers around the edge functions via `invokeEdgeFunction`. |

`jszip` is added to `package.json` (already a common Vite-friendly dep; no native modules).

---

### 5. Safety guarantees

- **Pre-restore auto-backup** is mandatory and stored in private storage; surfaced as a downloadable link in the success/error toast.
- **Atomic restore**: all DB writes in a single transaction; any failure ROLLBACKs and leaves the branch unchanged.
- **No staff/auth mutations** ever — staff rows, auth users, and tenant memberships are read-only across the entire feature.
- **Tenant-scoped authorization**: edge functions reject any caller who is not admin/owner of the **target** tenant; super_admins are allowed.
- **Tenant limit guard** runs *before* the destructive phase to prevent restoring a backup that would breach the plan.
- **Path-traversal & zip-bomb guards**: reject entries with `..`, absolute paths, or aggregate uncompressed size > 500 MB.
- **Hash verification** via `manifest.json` ensures the zip isn't tampered with mid-flight.
- **Cross-tenant migration** is opt-in (extra checkbox) and always remaps every UUID, so it cannot accidentally collide with or overwrite another tenant's rows.
- **No effect on other features**: only new files, one new tab, two new edge functions, two new RPCs. Existing queries, RLS, and UI are untouched.

---

### 6. Out of scope (called out so we don't surprise you)

- Restoring `staff`, `auth.users`, `tenants`, `user_roles`, `platform_*`, `tenant_limits`, `tenant_billing_info`. Staff are snapshotted for reference only.
- Restoring data into a branch you don't own (admin/owner gate).
- Scheduled / automatic backups — a future iteration could schedule `branch-export` via `pg_cron` to upload to storage nightly.

