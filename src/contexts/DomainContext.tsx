/**
 * DomainContext — resolves the current hostname once at app boot
 * and exposes whether we're running on the GymKloud platform host
 * or on a tenant's custom branded domain.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  getCurrentHostname,
  isPlatformHost,
  resolveTenantByHost,
  type DomainContextValue,
} from "@/lib/domainContext";

const defaultValue: DomainContextValue = {
  mode: "platform",
  hostname: "",
  tenantId: null,
  branchId: null,
  branchSlug: null,
  branchName: null,
  branchLogoUrl: null,
  isLoading: true,
  error: null,
};

const DomainContext = createContext<DomainContextValue>(defaultValue);

export function DomainProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DomainContextValue>(() => {
    const host = getCurrentHostname();
    const platform = isPlatformHost(host);
    return {
      ...defaultValue,
      hostname: host,
      mode: platform ? "platform" : "tenant",
      isLoading: !platform, // platform mode needs no async lookup
    };
  });

  useEffect(() => {
    const host = getCurrentHostname();
    if (isPlatformHost(host)) {
      setState((s) => ({ ...s, isLoading: false, mode: "platform" }));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveTenantByHost(host);
        if (cancelled) return;
        if (!resolved) {
          setState({
            ...defaultValue,
            hostname: host,
            mode: "tenant",
            isLoading: false,
            error: "domain_not_configured",
          });
          return;
        }
        setState({
          mode: "tenant",
          hostname: host,
          tenantId: resolved.tenant_id,
          branchId: resolved.branch_id,
          branchSlug: resolved.branch_slug,
          branchName: resolved.branch_name,
          branchLogoUrl: resolved.branch_logo_url,
          isLoading: false,
          error: null,
        });
      } catch (e: any) {
        if (cancelled) return;
        setState({
          ...defaultValue,
          hostname: host,
          mode: "tenant",
          isLoading: false,
          error: e?.message || "resolve_failed",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <DomainContext.Provider value={state}>{children}</DomainContext.Provider>;
}

export function useDomainContext(): DomainContextValue {
  return useContext(DomainContext);
}
