

# Unify Trainer-Member Data: Single Source of Truth

## Problem

Two tables store "member assigned to trainer" data independently, causing inconsistent counts everywhere:

| Table | Members | Description |
|---|---|---|
| `pt_subscriptions` (active, current) | **18** | Created by "Assign Trainer" dialog |
| `time_slot_members` | **11** | Created by "Slot Members" tab |
| In `time_slot_members` only (no PT record) | **5** | Orphaned — invisible to trainer filter |
| In `pt_subscriptions` only (no slot entry) | **12** | Invisible to slot-based queries |

The admin trainer filter queries `time_slot_members` → shows 11. The staff login queries `pt_subscriptions` → shows 18. Manual count shows 24 (union of both). The actual correct count should be **18** (active PT with current end_date).

## Solution

Make **`pt_subscriptions`** the single source of truth. Treat `time_slot_members` as a secondary sync table (kept in sync but never used as the primary query source for counts/filters).

---

### Step 1: Data Migration — Sync orphaned records

Create `pt_subscriptions` rows for the 5 members that exist only in `time_slot_members`. Resolve trainer identity via `staff.phone → personal_trainers.id`. Also insert `time_slot_members` rows for the 12 PT members that have a `time_slot_id` set but no slot entry.

### Step 2: Fix Admin Trainer Filter (`MembersTable.tsx`)

Replace lines 719-758 — instead of querying `time_slot_members`, query `pt_subscriptions` directly:
- When `trainerFilter` (staff_id) is set → resolve to `personal_trainer_id` via phone → query `pt_subscriptions` where `status = 'active'` AND `end_date >= today`
- When `timeSlotFilter` is set → query `pt_subscriptions` where `time_slot_id` matches, active + current

### Step 3: Fix Trainer Dropdown Member Count (`TrainerFilterDropdown.tsx`)

Replace lines 81-103 — instead of counting `time_slot_members`, count distinct `pt_subscriptions.member_id` per trainer (via `personal_trainer_id`), where `status = 'active'` AND `end_date >= today`.

### Step 4: Fix Time Slot Filter Dropdown (`TimeSlotFilterDropdown.tsx`)

Replace slot member lookup to query `pt_subscriptions` where `time_slot_id` matches, active + current, instead of `time_slot_members`.

### Step 5: Simplify `useAssignedMembers.ts`

Currently runs two separate queries (by slot IDs + by trainer profile IDs) and merges. Simplify to a single query: all active `pt_subscriptions` where `personal_trainer_id` IN resolved trainer profile IDs AND `end_date >= today`. This captures both slot-based and direct assignments in one query.

### Step 6: Fix Attendance Trainer Filter (`SimpleAttendanceTab.tsx`)

Currently filters by `activePT.time_slot_id` matching trainer's slots. Change to include members whose `activePT` exists for that trainer regardless of whether they have a `time_slot_id`, when filtering by trainer (not by specific slot).

### Step 7: Remove edge function fallback (`protected-data/index.ts`)

Remove the `tsmByMember` fallback (lines 686-739) since all members will now have proper `pt_subscriptions` records after the data migration. This eliminates the dual-source confusion.

### Step 8: Ensure bidirectional sync going forward

- **AssignTrainerDialog** (already syncs to `time_slot_members` — line 227) ✓
- **SlotMembersTab** (already syncs to `pt_subscriptions` — recent fix) ✓
- Verify both paths remain in sync after these changes

---

### Technical Details

**Files to modify:**
1. `src/components/admin/MembersTable.tsx` — Trainer filter query (lines 719-758)
2. `src/components/admin/TrainerFilterDropdown.tsx` — Member count (lines 81-103)
3. `src/components/admin/TimeSlotFilterDropdown.tsx` — Slot member lookup
4. `src/hooks/useAssignedMembers.ts` — Simplify to single PT query
5. `src/components/admin/attendance/SimpleAttendanceTab.tsx` — Trainer filter logic (lines 97-114)
6. `supabase/functions/protected-data/index.ts` — Remove `tsmByMember` fallback
7. **Database migration** — Sync orphaned records between tables

**Identity resolution chain (used everywhere):**
`staff.id` → `staff.phone` → `personal_trainers.phone` → `personal_trainers.id` → `pt_subscriptions.personal_trainer_id`

**Active PT definition (universal):**
`pt_subscriptions.status = 'active' AND pt_subscriptions.end_date >= CURRENT_DATE`

