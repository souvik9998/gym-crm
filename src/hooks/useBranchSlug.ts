/**
 * useBranchSlug
 *
 * Returns the branch slug to use for the public registration / renewal /
 * extend-pt / check-in flows, sourced from either:
 *   1. The `:branchSlug` URL param (platform mode, /b/:slug)
 *   2. The DomainContext (tenant custom-domain mode — slug derived from
 *      the verified tenant_domains row)
 */
import { useParams } from "react-router-dom";
import { useDomainContext } from "@/contexts/DomainContext";

export function useBranchSlug(): string | undefined {
  const { branchSlug: urlSlug } = useParams<{ branchSlug?: string }>();
  const domain = useDomainContext();

  if (urlSlug) return urlSlug;
  if (domain.mode === "tenant" && !domain.isLoading && domain.branchSlug) {
    return domain.branchSlug;
  }
  return undefined;
}
