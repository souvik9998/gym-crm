import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardStore } from "@/stores/dashboardStore";

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tenant_id: string | null;
  logo_url: string | null;
}

export interface StaffBranchRestriction {
  branchIds: string[];
  primaryBranchId?: string;
}

interface BranchContextType {
  branches: Branch[];
  allBranches: Branch[];
  currentBranch: Branch | null;
  setCurrentBranch: (branch: Branch) => void;
  refreshBranches: () => Promise<void>;
  isLoading: boolean;
  isStaffRestricted: boolean;
  setStaffBranchRestriction: (restriction: StaffBranchRestriction | null) => void;
  tenantId: string | null;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

const CURRENT_BRANCH_KEY = "admin-current-branch-id";

export const BranchProvider = ({ children }: { children: ReactNode }) => {
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranchState] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [staffRestriction, setStaffRestriction] = useState<StaffBranchRestriction | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  
  // Get persisted branch ID from Zustand store
  const { selectedBranchId, setSelectedBranchId } = useDashboardStore();
  
  // Use ref to track current branch without causing re-renders in fetchBranches
  const currentBranchRef = useRef<Branch | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    currentBranchRef.current = currentBranch;
  }, [currentBranch]);
  
  const isStaffRestricted = staffRestriction !== null && staffRestriction.branchIds.length > 0;
  
  // Filter branches based on staff restriction
  const branches = isStaffRestricted 
    ? allBranches.filter(b => staffRestriction!.branchIds.includes(b.id))
    : allBranches;

  // Get user's tenant ID on mount — but ONLY if there's an active session.
  // On public pages (no auth) we skip the auth calls entirely to avoid
  // triggering token-refresh network requests that hang on mobile.
  useEffect(() => {
    let cancelled = false;

    const fetchUserTenant = async () => {
      try {
        // Use getSession() (local/fast) instead of getUser() (network call)
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) setUserChecked(true);
          return;
        }

        const user = session.user;

        // Check if super_admin (can see all branches)
        const { data: superAdminRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "super_admin")
          .maybeSingle();

        if (cancelled) return;

        if (superAdminRole) {
          setTenantId(null);
          setUserChecked(true);
          return;
        }

        // Get user's tenant
        const { data: tenantMember } = await supabase
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cancelled) {
          setTenantId(tenantMember?.tenant_id || null);
          setUserChecked(true);
        }
      } catch (error) {
        console.error("Error fetching user tenant:", error);
        if (!cancelled) setUserChecked(true);
      }
    };

    fetchUserTenant();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        // Signed out — reset immediately, no network calls
        setTenantId(null);
        setUserChecked(true);
        return;
      }
      fetchUserTenant();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const fetchBranches = useCallback(async () => {
    if (!userChecked) return;
    
    // On public pages there's no authenticated session — skip branch fetch
    // (public pages use fetchPublicBranch from publicData.ts instead)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // RLS policies now enforce tenant isolation at the database level.
      // - Super admins: see ALL branches (no tenant_id filter in RLS)
      // - Tenant admins/members: see ONLY branches where tenant_id matches their tenant
      // - Staff: see ONLY branches they are assigned to
      // We still filter by tenant_id here for super admins who want to scope to a tenant,
      // but for regular tenant users, RLS does the heavy lifting.
      let query = supabase
        .from("branches")
        .select("*")
        .is("deleted_at", null)
        .order("name");

      // Only apply tenant filter for super admins who have explicitly selected a tenant
      // Regular tenant users will be automatically scoped by RLS
      // (tenantId is null for super admins, so this won't affect tenant users)
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching branches:", error);
        setAllBranches([]);
        return;
      }

      // RLS already filters, no need for client-side deleted_at filter
      const branchList = (data || []) as Branch[];
      setAllBranches(branchList);

      // Get the filtered list based on staff restriction
      const filteredBranches = staffRestriction 
        ? branchList.filter(b => staffRestriction.branchIds.includes(b.id))
        : branchList;

      if (filteredBranches.length > 0) {
        let selectedBranch: Branch | undefined;
        
        // PRIORITY 1: Use persisted branch ID from Zustand store
        if (selectedBranchId) {
          selectedBranch = filteredBranches.find(b => b.id === selectedBranchId);
        }
        
        // PRIORITY 2: Check localStorage fallback (for backward compatibility)
        if (!selectedBranch) {
          const savedBranchId = localStorage.getItem(CURRENT_BRANCH_KEY);
          if (savedBranchId) {
            selectedBranch = filteredBranches.find(b => b.id === savedBranchId);
          }
        }
        
        // PRIORITY 3: For staff users, use their primary branch
        if (!selectedBranch && staffRestriction?.primaryBranchId) {
          selectedBranch = filteredBranches.find(b => b.id === staffRestriction.primaryBranchId);
        }
        
        // PRIORITY 4: Try default branch
        if (!selectedBranch) {
          selectedBranch = filteredBranches.find(b => b.is_default);
        }
        
        // PRIORITY 5: Use first branch
        if (!selectedBranch) {
          selectedBranch = filteredBranches[0];
        }

        // Only set if different or not initialized
        const currentIsAllowed = currentBranchRef.current && filteredBranches.some(b => b.id === currentBranchRef.current?.id);
        
        if (!currentBranchRef.current || !currentIsAllowed || !isInitialized) {
          setCurrentBranchState(selectedBranch);
          // Sync both localStorage and Zustand
          localStorage.setItem(CURRENT_BRANCH_KEY, selectedBranch.id);
          setSelectedBranchId(selectedBranch.id);
        } else if (currentBranchRef.current) {
          // Update current branch data if it exists in the list (in case branch details changed)
          const updatedCurrentBranch = filteredBranches.find(b => b.id === currentBranchRef.current?.id);
          if (updatedCurrentBranch && JSON.stringify(updatedCurrentBranch) !== JSON.stringify(currentBranchRef.current)) {
            setCurrentBranchState(updatedCurrentBranch);
          }
        }
        
        setIsInitialized(true);
      } else if (filteredBranches.length === 0 && staffRestriction) {
        // Staff has no assigned branches - clear current branch
        setCurrentBranchState(null);
        setSelectedBranchId(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [staffRestriction, selectedBranchId, setSelectedBranchId, isInitialized, userChecked, tenantId]);

  const setCurrentBranch = useCallback((branch: Branch) => {
    // For staff users, verify the branch is in their allowed list
    if (staffRestriction) {
      const isAllowed = staffRestriction.branchIds.includes(branch.id);
      if (!isAllowed) {
        console.warn("Staff user attempted to switch to unauthorized branch");
        return;
      }
    }
    
    setCurrentBranchState(branch);
    // Sync both localStorage and Zustand store
    localStorage.setItem(CURRENT_BRANCH_KEY, branch.id);
    setSelectedBranchId(branch.id);
  }, [staffRestriction, setSelectedBranchId]);

  const setStaffBranchRestriction = useCallback((restriction: StaffBranchRestriction | null) => {
    setStaffRestriction(restriction);
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  return (
    <BranchContext.Provider
      value={{
        branches,
        allBranches,
        currentBranch,
        setCurrentBranch,
        refreshBranches: fetchBranches,
        isLoading,
        isStaffRestricted,
        setStaffBranchRestriction,
        tenantId,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return context;
};
