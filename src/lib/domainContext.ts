/**
 * Domain context resolver
 *
 * Determines whether the current hostname is the GymKloud platform
 * (admin/super-admin/lovable preview) or a tenant's custom branded
 * domain (e.g. https://5threalm.in). When it's a tenant domain, we
 * resolve the tenant + branch via a public RPC so the public
 * registration / renewal / check-in pages can run from the gym's own
 * domain without needing a /b/:slug URL segment.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ResolvedTenantDomain {
  tenant_id: string;
  tenant_name: string;
  branch_id: string | null;
  branch_slug: string | null;
  branch_name: string | null;
  branch_logo_url: string | null;
  is_verified: boolean;
}

export type DomainMode = "platform" | "tenant";

export interface DomainContextValue {
  mode: DomainMode;
  hostname: string;
  tenantId: string | null;
  branchId: string | null;
  branchSlug: string | null;
  branchName: string | null;
  branchLogoUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hostnames that are always treated as the platform itself,
 * never as a tenant custom domain.
 */
const PLATFORM_HOST_SUFFIXES = [
  "gymkloud.in",
  "lovable.app",
  "lovable.dev",
  "lovableproject.com",
  "localhost",
];

const PLATFORM_HOST_EXACT = ["localhost", "127.0.0.1", "0.0.0.0"];

export function getCurrentHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

export function isPlatformHost(host: string): boolean {
  const h = (host || "").toLowerCase().trim();
  if (!h) return true;
  if (PLATFORM_HOST_EXACT.includes(h)) return true;
  return PLATFORM_HOST_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`)
  );
}

const CACHE_KEY_PREFIX = "td_resolve_v1:";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedResolve {
  ts: number;
  data: ResolvedTenantDomain | null;
}

function readCache(host: string): CachedResolve | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(CACHE_KEY_PREFIX + host);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedResolve;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(host: string, data: ResolvedTenantDomain | null) {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(
      CACHE_KEY_PREFIX + host,
      JSON.stringify({ ts: Date.now(), data })
    );
  } catch {
    // ignore quota/serialization errors
  }
}

export async function resolveTenantByHost(
  host: string
): Promise<ResolvedTenantDomain | null> {
  if (!host || isPlatformHost(host)) return null;

  const cached = readCache(host);
  if (cached) return cached.data;

  // RPC is SECURITY DEFINER and granted to anon — safe to call without auth.
  const { data, error } = await supabase.rpc("resolve_tenant_by_hostname", {
    _hostname: host,
  });

  if (error) {
    // Don't cache errors so we can retry on next mount.
    console.warn("[domainContext] resolve failed:", error.message);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | ResolvedTenantDomain
    | undefined;
  const value = row ?? null;
  writeCache(host, value);
  return value;
}
