import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tenant, TenantWithDetails, fetchTenantDetails } from "@/api/tenants";

export interface SuperAdminContextType {
  isSuperAdmin: boolean;
  isLoading: boolean;
  // Tenant context switching
  selectedTenant: TenantWithDetails | null;
  setSelectedTenantId: (tenantId: string | null) => void;
  clearTenantContext: () => void;
  // Impersonation - view as admin of a specific tenant
  isImpersonating: boolean;
  impersonatedTenantId: string | null;
  startImpersonation: (tenantId: string) => void;
  stopImpersonation: () => void;
  // Super admin bypass flag - ignores all limits
  bypassLimits: boolean;
  refreshTenantDetails: () => Promise<void>;
}

const SuperAdminContext = createContext<SuperAdminContextType | undefined>(undefined);

export const SuperAdminProvider = ({ children }: { children: ReactNode }) => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTenantId, setSelectedTenantIdState] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<TenantWithDetails | null>(null);
  const [impersonatedTenantId, setImpersonatedTenantId] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);

  // Super admin always bypasses limits
  const bypassLimits = isSuperAdmin;

  // Check if current user is super admin
  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setIsSuperAdmin(false);
          setIsLoading(false);
          return;
        }

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "super_admin")
          .maybeSingle();

        setIsSuperAdmin(!!roleData);
      } catch (error) {
        console.error("Error checking super admin status:", error);
        setIsSuperAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkSuperAdmin();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkSuperAdmin();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch tenant details when selected tenant changes
  const fetchSelectedTenantDetails = useCallback(async () => {
    if (!selectedTenantId) {
      setSelectedTenant(null);
      return;
    }

    try {
      const details = await fetchTenantDetails(selectedTenantId);
      setSelectedTenant(details);
    } catch (error) {
      console.error("Error fetching tenant details:", error);
      setSelectedTenant(null);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    fetchSelectedTenantDetails();
  }, [fetchSelectedTenantDetails]);

  const setSelectedTenantId = useCallback((tenantId: string | null) => {
    setSelectedTenantIdState(tenantId);
    if (tenantId) {
      localStorage.setItem("superadmin-selected-tenant", tenantId);
    } else {
      localStorage.removeItem("superadmin-selected-tenant");
    }
  }, []);

  const clearTenantContext = useCallback(() => {
    setSelectedTenantIdState(null);
    setSelectedTenant(null);
    setIsImpersonating(false);
    setImpersonatedTenantId(null);
    localStorage.removeItem("superadmin-selected-tenant");
    localStorage.removeItem("superadmin-impersonated-tenant");
  }, []);

  const startImpersonation = useCallback((tenantId: string) => {
    setImpersonatedTenantId(tenantId);
    setIsImpersonating(true);
    localStorage.setItem("superadmin-impersonated-tenant", tenantId);
  }, []);

  const stopImpersonation = useCallback(() => {
    setImpersonatedTenantId(null);
    setIsImpersonating(false);
    localStorage.removeItem("superadmin-impersonated-tenant");
  }, []);

  const refreshTenantDetails = useCallback(async () => {
    await fetchSelectedTenantDetails();
  }, [fetchSelectedTenantDetails]);

  // Restore state from localStorage on mount
  useEffect(() => {
    const savedTenantId = localStorage.getItem("superadmin-selected-tenant");
    const savedImpersonatedId = localStorage.getItem("superadmin-impersonated-tenant");
    
    if (savedTenantId && isSuperAdmin) {
      setSelectedTenantIdState(savedTenantId);
    }
    if (savedImpersonatedId && isSuperAdmin) {
      setImpersonatedTenantId(savedImpersonatedId);
      setIsImpersonating(true);
    }
  }, [isSuperAdmin]);

  return (
    <SuperAdminContext.Provider
      value={{
        isSuperAdmin,
        isLoading,
        selectedTenant,
        setSelectedTenantId,
        clearTenantContext,
        isImpersonating,
        impersonatedTenantId,
        startImpersonation,
        stopImpersonation,
        bypassLimits,
        refreshTenantDetails,
      }}
    >
      {children}
    </SuperAdminContext.Provider>
  );
};

export const useSuperAdmin = () => {
  const context = useContext(SuperAdminContext);
  if (context === undefined) {
    throw new Error("useSuperAdmin must be used within a SuperAdminProvider");
  }
  return context;
};
