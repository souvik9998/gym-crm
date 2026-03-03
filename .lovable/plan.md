

## Backend Performance Optimization Plan

### 1. Database Indexes (Migration)

Add indexes on frequently filtered/joined columns across all major tables. These are missing and cause sequential scans:

```sql
-- Members
CREATE INDEX IF NOT EXISTS idx_members_branch_id ON members(branch_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_created_at ON members(created_at);

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_member_id ON subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_branch_id ON subscriptions(branch_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_branch_status ON subscriptions(branch_id, status);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_branch_id ON payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_branch_status_created ON payments(branch_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments(member_id);

-- Ledger
CREATE INDEX IF NOT EXISTS idx_ledger_branch_id ON ledger_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_type ON ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_category ON ledger_entries(category);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_date ON ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_branch_type_cat ON ledger_entries(branch_id, entry_type, category);

-- PT Subscriptions
CREATE INDEX IF NOT EXISTS idx_pt_subs_member_id ON pt_subscriptions(member_id);
CREATE INDEX IF NOT EXISTS idx_pt_subs_branch_id ON pt_subscriptions(branch_id);
CREATE INDEX IF NOT EXISTS idx_pt_subs_trainer_id ON pt_subscriptions(personal_trainer_id);
CREATE INDEX IF NOT EXISTS idx_pt_subs_status ON pt_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_pt_subs_end_date ON pt_subscriptions(end_date);

-- Activity Logs
CREATE INDEX IF NOT EXISTS idx_admin_logs_branch_id ON admin_activity_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_user_id ON admin_activity_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_branch_id ON user_activity_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_created_at ON user_activity_logs(created_at);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_branch_id ON attendance_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_logs(date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance_logs(member_id);

-- Staff
CREATE INDEX IF NOT EXISTS idx_staff_auth_user_id ON staff(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_branch_assignments_branch ON staff_branch_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_branch_assignments_staff ON staff_branch_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_permissions_staff ON staff_permissions(staff_id);

-- Daily pass
CREATE INDEX IF NOT EXISTS idx_daily_pass_branch_id ON daily_pass_users(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_pass_subs_user ON daily_pass_subscriptions(daily_pass_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_pass_subs_branch ON daily_pass_subscriptions(branch_id);

-- Branches
CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON branches(tenant_id);

-- Tenant
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);
```

### 2. Optimize Edge Function: Move Aggregations to SQL

**`dashboard-stats` action**: Replace the current 5+ sequential queries + JS aggregation with a single call to the existing `get_dashboard_stats` RPC function (already exists in the database). The edge function currently duplicates this logic inefficiently.

**`log-stats` action (category counting)**: Currently fetches ALL rows to count categories in JS. Replace with `GROUP BY` via a small RPC or simply use `select("activity_category")` with `.limit(10000)` — but better: use `count` with filters per category. However since Supabase JS doesn't support GROUP BY, the current approach of fetching just the category column is acceptable, but add `.limit(50000)` to prevent unbounded fetches.

**`staff-page-data` ledger aggregation**: Currently fetches all matching ledger amounts and sums in JS. Replace with a count-only approach using `select("amount")` which is already minimal — acceptable as-is.

**`branch-analytics-data`**: The `fetchBranchMetrics` function makes 9 parallel queries PER branch PER period. For 5 branches with previous period = 90 queries. Optimize by:
- Fetching payments/expenses/members for ALL branches in single queries, then grouping by branch_id in JS
- This reduces from N*9*2 queries to ~9*2 queries total

### 3. Optimize `members` Action N+1 Problem

Currently fetches members, then runs 2 queries per member (subscription + PT). For 25 members = 50 extra queries. Replace with:
- Batch fetch all subscriptions for the member IDs in one query
- Batch fetch all PT subscriptions for the member IDs in one query
- Join in JS (already have member IDs from the page)

### 4. Optimize `daily-pass-users` N+1 Problem

Same pattern — fetches subscription per user. Replace with batch fetch.

### 5. Add Cache-Control Headers

Add `Cache-Control` response headers for read-heavy, non-transactional endpoints:
- `dashboard-stats`: `max-age=30` (30s)
- `analytics-data`: `max-age=60` (1min)
- `branch-analytics-data`: `max-age=120` (2min)
- `log-stats`: `max-age=60` (1min)
- `settings-page-data`: `max-age=120` (2min)
- `staff-page-data`: `max-age=60` (1min)
- Transactional endpoints (members, payments, ledger): no cache

### 6. Select Only Required Columns

Audit each action and replace `select("*")` with explicit column lists where possible. Key areas:
- `dashboard-stats`: members only needs `id`, subscriptions needs `member_id, status, end_date`
- `log-stats`: already optimized (head: true counts)
- `members`: keep `*` since all fields displayed
- `payments`: reduce join fields

### Summary of Changes

| Change | Files |
|--------|-------|
| Database indexes | Migration SQL |
| Dashboard-stats: use RPC | `protected-data/index.ts` |
| Members N+1 fix (batch) | `protected-data/index.ts` |
| Daily-pass N+1 fix (batch) | `protected-data/index.ts` |
| Branch-analytics batch queries | `protected-data/index.ts` |
| Cache-Control headers | `protected-data/index.ts` |
| Column pruning | `protected-data/index.ts` |

No frontend or business logic changes. Only backend query structure, indexing, and caching improvements.

