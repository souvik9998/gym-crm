/**
 * useTenantPrimaryDomain
 *
 * Returns the verified primary custom domain for the current tenant
 * (or the first verified domain if no primary is set). Used by the
 * QR code page and other share-link CTAs so admins surface the
 * gym's own branded URL when one is configured.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TenantDomainRow {
  id: string;
  hostname: string;
  branch_id: string | null;
  is_primary: boolean;
  is_verified: boolean;
}

export function useTenantPrimaryDomain(branchId?: string | null) {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ["tenant-primary-domain", tenantId, branchId ?? "any"],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TenantDomainRow | null> => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("tenant_domains")
        .select("id, hostname, branch_id, is_primary, is_verified")
        .eq("tenant_id", tenantId)
        .eq("is_verified", true);

      if (error || !data || data.length === 0) return null;

      // Prefer: branch-specific primary -> branch-specific any -> tenant-wide primary -> tenant-wide any
      const matches = (row: TenantDomainRow) =>
        !branchId || row.branch_id === null || row.branch_id === branchId;

      const candidates = (data as TenantDomainRow[]).filter(matches);
      if (candidates.length === 0) return null;

      const primary = candidates.find((r) => r.is_primary);
      return primary ?? candidates[0];
    },
  });
}
