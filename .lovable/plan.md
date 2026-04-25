
# Custom Tenant Domains — End-to-End Plan

Goal: Each gym owner can have their **own domain** (e.g. `https://5threalm.in`) host the public registration / renewal / check-in pages. Razorpay payment requests originate from that domain (matching the merchant's registered domain on Razorpay), while all backend (DB, edge functions, API, success flow, invoices, WhatsApp) continues to run on GymKloud infrastructure (Supabase + Lovable hosting).

Super Admin will be able to **add, verify, and manage** these custom domains for any tenant from the Super Admin Portal.

---

## 1. Database Schema (Migration)

New table `tenant_domains`:

```sql
create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade, -- NULL = applies to whole tenant (default branch)
  hostname text not null unique,           -- normalized lowercase, no protocol, e.g. "5threalm.in"
  is_primary boolean not null default false, -- one primary per tenant
  is_verified boolean not null default false,
  verification_token text not null default encode(gen_random_bytes(16), 'hex'),
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tenant_domains_tenant on public.tenant_domains(tenant_id);
create index idx_tenant_domains_hostname on public.tenant_domains(lower(hostname));

alter table public.tenant_domains enable row level security;

-- Only super admins can read/write the management table
create policy "Super admins manage tenant_domains" on public.tenant_domains
for all to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

-- Tenant admins can READ their own
create policy "Tenant admins read own domains" on public.tenant_domains
for select to authenticated
using (public.is_tenant_admin(auth.uid(), tenant_id));
```

**Public RPC** (so the frontend can resolve hostname → branch without a session):

```sql
create or replace function public.resolve_tenant_by_hostname(_hostname text)
returns table(
  tenant_id uuid,
  tenant_name text,
  branch_id uuid,
  branch_slug text,
  branch_name text,
  branch_logo_url text,
  is_verified boolean
)
language sql stable security definer set search_path = public as $$
  select
    t.id, t.name,
    coalesce(td.branch_id, b.id),
    b.slug, b.name, b.logo_url,
    td.is_verified
  from public.tenant_domains td
  join public.tenants t on t.id = td.tenant_id
  left join public.branches b on b.id = coalesce(
    td.branch_id,
    (select id from public.branches
       where tenant_id = td.tenant_id and is_default = true and is_active = true
       order by created_at limit 1)
  )
  where lower(td.hostname) = lower(_hostname)
    and td.is_verified = true
    and t.is_active = true
  limit 1;
$$;

grant execute on function public.resolve_tenant_by_hostname(text) to anon, authenticated;
```

---

## 2. Domain Resolution Layer (Frontend)

**New file: `src/lib/domainContext.ts`**
- `getCurrentHostname()` — reads `window.location.hostname`.
- `isPlatformHost(host)` — returns true for `gymkloud.in`, `*.gymkloud.in`, `*.lovable.app`, `localhost`. These are "Admin Mode".
- `resolveTenantByHost(host)` — calls the `resolve_tenant_by_hostname` RPC and caches the result in `sessionStorage` for 10 min.
- Exports a React hook `useDomainContext()` returning `{ mode: "platform" | "tenant", tenantId, branchId, branchSlug, branchName, isLoading }`.

**New file: `src/contexts/DomainContext.tsx`** — Provider that runs the lookup once on mount and exposes the result throughout the app (added high in the tree, above `BranchProvider`).

---

## 3. Routing (`src/App.tsx`)

Conditionally render routes based on hostname mode:

- **Platform mode** (`gymkloud.in`, `*.lovable.app`): keep all existing routes (admin login, super admin, `/b/:branchSlug/...` etc.) — current behaviour preserved.
- **Tenant mode** (custom domain like `5threalm.in`): expose only the public flows, with branch auto-resolved from the hostname (no `/b/:slug` segment in URL):
  - `/` → `<Index />` (no slug param needed)
  - `/register` → `<Register />`
  - `/renew` → `<Renew />`
  - `/extend-pt` → `<ExtendPT />`
  - `/success` → `<Success />`
  - `/profile` → `<MemberProfile />`
  - `/invoice/:invoiceId` → `<InvoicePage />`
  - `/check-in` → `<CheckIn />`
  - `/event/:eventSlug` → `<EventRegistration />`
  - Admin routes are blocked / redirect away on tenant domains (admin still uses `gymkloud.in/admin/login`).

Refactor `Index.tsx`, `Register.tsx`, `Renew.tsx`, `ExtendPT.tsx`, `CheckIn.tsx` to:
1. Read `branchSlug` from `useParams()` if present (platform mode).
2. Otherwise read `branchId` / `branchSlug` from `useDomainContext()` (tenant mode).
3. Use the same downstream logic for both.

This keeps Razorpay's `Razorpay({ key, ... }).open()` running with `window.location.origin = https://5threalm.in`, satisfying the merchant-domain requirement.

---

## 4. Super Admin UI — Custom Domain Management

**New file: `src/components/superadmin/TenantDomainsTab.tsx`**

Added as a new **"Domains"** tab inside `src/pages/superadmin/TenantDetail.tsx` (between "Payments" and "Users").

Features:
- Table of existing domains (`hostname`, `branch`, `Primary` toggle, `Verified` badge, `Verification token`, actions).
- **Add Domain** dialog:
  - Input: hostname (auto-normalize: strip `https://`, trailing `/`, lowercase).
  - Optional: select a specific `branch_id` (defaults to tenant's default branch).
  - Saves to `tenant_domains` with `is_verified=false`.
- **Verification panel** (per row):
  - Shows DNS instructions:
    - **A record** → `185.158.133.1` (Lovable hosting IP — already in `<custom-domains>` docs).
    - **TXT record** → `_lovable` = `lovable_verify=<token>` for ownership verification.
  - "Check verification" button → calls a new edge function `verify-tenant-domain` that performs a DNS lookup and updates `is_verified` + `verified_at`.
- Toggle **Primary** (only one per tenant).
- Delete domain (confirm dialog).
- "Copy registration link" button → copies `https://<hostname>/register` (or `/` for the landing).
- Inline help: explains the gym owner must (a) point DNS to Lovable, and (b) add the same domain in **Lovable Project Settings → Domains** so SSL is provisioned. Once both are done, click verify here.

**New file: `supabase/functions/verify-tenant-domain/index.ts`**
- Super-admin gated edge function.
- Performs `Deno.resolveDns(hostname, "A")` and `Deno.resolveDns("_lovable." + hostname, "TXT")`.
- Verifies the TXT contains `lovable_verify=<token>` and the A record matches `185.158.133.1`.
- On success: `update tenant_domains set is_verified=true, verified_at=now()`.
- Returns `{ verified, dns: { a, txt }, errors }` for UI feedback.

(Configured as a normal Lovable edge function; uses `invokeEdgeFunction` per project standards.)

---

## 5. Admin UI — Reflecting Custom Domain in Existing Pages

**`src/pages/admin/QRCode.tsx`** (and any "share registration link" CTAs):
- Update `getPortalUrl()` / `getAttendanceUrl()` to:
  1. Look up the tenant's primary verified domain via a new helper `useTenantPrimaryDomain()`.
  2. If found: `https://<custom-domain>/` (no `/b/:slug` needed).
  3. Else: fall back to `https://<window.location.origin>/b/<slug>`.
- QR code regenerates accordingly. Same logic for the registration QR and the attendance check-in QR.

**`src/pages/admin/Settings.tsx`** (Branch tab — read only):
- Add a small "Custom Domain" info card showing the verified domain (if any) with a "Managed by GymKloud Support" note for tenant admins (since only Super Admin can change it).

---

## 6. Razorpay / Payment Flow

No code change needed in `useRazorpay` itself — Razorpay reads `window.location.origin` automatically when the checkout opens. Because the user is on `https://5threalm.in/register`, the order is created against the tenant's own Razorpay credentials (already stored per-tenant via `RazorpayCredentialsTab`) and the request appears to Razorpay/RBI as originating from `5threalm.in`.

Backend edge functions (`create-razorpay-order`, `verify-razorpay-payment`, `finalize-event-payment`, etc.) keep running on the GymKloud Supabase project — they're called via `invokeEdgeFunction` over CORS and do not need to be on the tenant's domain.

CORS: edge functions already use `Access-Control-Allow-Origin: *` so they accept calls from any tenant hostname.

---

## 7. Lovable Hosting Setup (Operational, per tenant)

For each new tenant domain, the Super Admin (or GymKloud ops) will:

1. Add the row in the new **Super Admin → Tenant → Domains** tab (generates verification token).
2. Ask the gym owner to add DNS records at their registrar:
   - `A @ → 185.158.133.1`
   - `A www → 185.158.133.1`
   - `TXT _lovable → lovable_verify=<token>`
3. Add the domain in **Lovable Project Settings → Domains** (so Lovable provisions SSL).
4. Click **Check verification** in the Super Admin tab once DNS propagates.
5. Optionally toggle as **Primary** so the QR code page surfaces the new branded link.

This is documented inside the Domains tab UI itself (collapsible "Setup instructions" panel).

---

## 8. Files Touched

**New**
- `supabase/migrations/<timestamp>_tenant_domains.sql`
- `src/lib/domainContext.ts`
- `src/contexts/DomainContext.tsx`
- `src/hooks/useTenantPrimaryDomain.ts`
- `src/components/superadmin/TenantDomainsTab.tsx`
- `supabase/functions/verify-tenant-domain/index.ts`

**Modified**
- `src/App.tsx` (conditional routing based on domain mode, wrap in `DomainProvider`)
- `src/pages/Index.tsx`, `src/pages/Register.tsx`, `src/pages/Renew.tsx`, `src/pages/ExtendPT.tsx`, `src/pages/CheckIn.tsx` (accept branch from domain context as fallback to URL param)
- `src/pages/superadmin/TenantDetail.tsx` (add Domains tab)
- `src/pages/admin/QRCode.tsx` (use primary custom domain when present)

---

## 9. Backwards Compatibility

- Existing `https://dev.gymkloud.in/b/<slug>` URLs continue to work indefinitely (platform mode is unchanged).
- Tenants without a custom domain see no difference.
- No breaking changes to existing payments, invoices, WhatsApp, or auth flows.

---

## 10. Out of Scope (for this iteration)

- Automatic DNS provisioning at the registrar (still manual by gym owner).
- Email sending from the tenant's domain (Resend stays on `hello@gymkloud.in` per existing memory; can be added later).
- Per-domain Open Graph branding overrides.

---

**Ready to implement once approved.**
