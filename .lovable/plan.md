# Multi-Tenant SaaS Architecture - Implementation Plan

## Overview

This document outlines the multi-tenant SaaS architecture implemented for the gym management platform. Each gym owner is an isolated tenant managed by a super-admin platform.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPER ADMIN LAYER                        │
│  - Platform management                                      │
│  - Tenant provisioning                                      │
│  - Usage monitoring & billing                               │
│  - Platform audit logs                                      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   TENANT A    │    │   TENANT B    │    │   TENANT N    │
│  (Gym Owner)  │    │  (Gym Owner)  │    │  (Gym Owner)  │
├───────────────┤    ├───────────────┤    ├───────────────┤
│ • Branches    │    │ • Branches    │    │ • Branches    │
│ • Staff       │    │ • Staff       │    │ • Staff       │
│ • Members     │    │ • Members     │    │ • Members     │
│ • Payments    │    │ • Payments    │    │ • Payments    │
│ • Analytics   │    │ • Analytics   │    │ • Analytics   │
└───────────────┘    └───────────────┘    └───────────────┘
```

---

## Database Schema Changes

### New Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Root entity for gym organizations |
| `tenant_limits` | Custom resource limits per tenant |
| `tenant_usage` | Monthly usage metering |
| `tenant_members` | User ↔ Tenant mapping with roles |
| `tenant_billing_info` | Billing metadata for future integration |
| `platform_audit_logs` | Super-admin action audit trail |

### Modified Tables

| Table | Change |
|-------|--------|
| `branches` | Added `tenant_id` column (nullable for backward compatibility) |

### New Enum Values

```sql
app_role: 'super_admin', 'tenant_admin' (added to existing)
```

---

## Security Functions

| Function | Purpose |
|----------|---------|
| `is_super_admin(user_id)` | Check if user has super_admin role |
| `get_user_tenant_id(user_id)` | Get user's primary tenant |
| `user_belongs_to_tenant(user_id, tenant_id)` | Verify tenant membership |
| `is_tenant_admin(user_id, tenant_id)` | Check tenant admin status |
| `get_tenant_current_usage(tenant_id)` | Get live resource counts |
| `tenant_can_add_resource(tenant_id, resource_type)` | Enforce limits |
| `increment_whatsapp_usage(tenant_id, count)` | Track WhatsApp usage |
| `get_tenant_from_branch(branch_id)` | Resolve tenant from branch |

---

## Role Hierarchy

```
super_admin
    │
    └── Full platform access
        • Create/suspend tenants
        • Set tenant limits
        • View all data across tenants
        • Platform audit access

tenant_admin (formerly "admin")
    │
    └── Full tenant access
        • Manage branches, staff, members
        • View tenant usage/limits
        • Access billing info
        • All existing admin capabilities

staff
    │
    └── Branch-scoped access
        • Based on assigned permissions
        • Limited to assigned branches
        • No tenant management access
```

---

## Limit Enforcement

### Resource Types

| Resource | Limit Field | Enforcement |
|----------|-------------|-------------|
| Branches | `max_branches` | Before branch creation |
| Staff | `max_staff_per_branch × max_branches` | Before staff creation |
| Members | `max_members` | Before member registration |
| Trainers | `max_trainers` | Before trainer creation |
| WhatsApp | `max_monthly_whatsapp_messages` | Before sending messages |

### Server-Side Validation Flow

```typescript
// Example: Before creating a branch
const { data } = await supabase.functions.invoke('tenant-operations', {
  body: { 
    tenantId: 'xxx', 
    resourceType: 'branch' 
  },
  query: { action: 'check-limit' }
});

if (!data.allowed) {
  throw new Error(data.reason); // "branch limit reached for this tenant"
}
```

---

## Edge Function: tenant-operations

### Available Actions

| Action | Auth Required | Description |
|--------|--------------|-------------|
| `create-tenant` | super_admin | Create new gym tenant |
| `update-tenant-limits` | super_admin | Modify resource limits |
| `suspend-tenant` | super_admin | Activate/deactivate tenant |
| `list-tenants` | super_admin | List all tenants |
| `get-tenant-usage` | tenant_member | Get usage stats |
| `check-limit` | any | Check if resource can be added |
| `increment-usage` | service_role | Update usage counters |
| `get-platform-logs` | super_admin | View audit logs |

---

## RLS Policies

All new tables have Row-Level Security enabled with:

1. **Super Admin Access**: Full CRUD on all tables
2. **Tenant Isolation**: Users can only see their tenant's data
3. **Backward Compatibility**: Existing data (null tenant_id) remains accessible

---

## Migration Path

### Phase 1: Schema (✅ Completed)
- Extended `app_role` enum
- Created tenant infrastructure tables
- Added `tenant_id` to branches
- Created security functions
- Applied RLS policies

### Phase 2: Tenant Operations API (✅ Completed)
- Created `tenant-operations` Edge Function
- Implemented super-admin actions
- Added limit checking endpoints
- Added usage tracking

### Phase 3: Frontend Integration (🔜 Pending)
- Super admin dashboard (if needed)
- Tenant context in existing flows
- Limit enforcement in UI

### Phase 4: Billing Integration (🔜 Pending)
- Connect Stripe/Razorpay for subscriptions
- Automatic limit updates based on plan
- Usage-based billing reports

---

## Testing Checklist

- [ ] Create a super_admin user role
- [ ] Test `create-tenant` action
- [ ] Test `update-tenant-limits` action
- [ ] Test `check-limit` before branch creation
- [ ] Verify tenant isolation (user A can't see tenant B data)
- [ ] Test WhatsApp usage metering
- [ ] Verify audit logs capture all super-admin actions

---

## Security Considerations

1. **Zero Trust**: All limits validated server-side
2. **Audit Trail**: All platform actions logged
3. **Tenant Isolation**: RLS prevents cross-tenant access
4. **Role Separation**: Super admin ≠ tenant admin ≠ staff
5. **Service Role**: Usage updates only via Edge Functions

---

## Future Enhancements

1. **Plan Templates**: Pre-defined limit configurations (Free, Pro, Enterprise)
2. **Usage Alerts**: Notify tenant admins when approaching limits
3. **Billing Webhooks**: Auto-upgrade/downgrade based on payments
4. **Multi-Region**: Tenant data residency options
5. **White-Labeling**: Custom branding per tenant
