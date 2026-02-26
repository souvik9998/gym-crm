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
  
  const { selectedBranchId, setSelectedBranchId } = useDashboardStore();
  
  // Refs for preventing duplicate/overlapping calls
  const currentBranchRef = useRef<Branch | null>(null);
  const fetchBranchesInFlight = useRef(false);
  const fetchTenantInFlight = useRef(false);
  const tenantCheckedOnce = useRef(false);
  
  // Keep refs in sync with state
  const staffRestrictionRef = useRef(staffRestriction);
  const selectedBranchIdRef = useRef(selectedBranchId);
  const isInitializedRef = useRef(isInitialized);
  const tenantIdRef = useRef(tenantId);
  
  useEffect(() => { currentBranchRef.current = currentBranch; }, [currentBranch]);
  useEffect(() => { staffRestrictionRef.current = staffRestriction; }, [staffRestriction]);
  useEffect(() => { selectedBranchIdRef.current = selectedBranchId; }, [selectedBranchId]);
  useEffect(() => { isInitializedRef.current = isInitialized; }, [isInitialized]);
  useEffect(() => { tenantIdRef.current = tenantId; }, [tenantId]);
  
  const isStaffRestricted = staffRestriction !== null && staffRestriction.branchIds.length > 0;
  
  const branches = isStaffRestricted 
    ? allBranches.filter(b => staffRestriction!.branchIds.includes(b.id))
    : allBranches;

  // Fetch user tenant — guarded against duplicate calls
  const fetchUserTenant = useCallback(async () => {
    // Prevent overlapping calls
    if (fetchTenantInFlight.current) return;
    fetchTenantInFlight.current = true;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setUserChecked(true);
        return;
      }

      const user = session.user;

      const { data: superAdminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();

      if (superAdminRole) {
        setTenantId(null);
        setUserChecked(true);
        return;
      }

      const { data: tenantMember } = await supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      setTenantId(tenantMember?.tenant_id || null);
      setUserChecked(true);
    } catch (error) {
      console.error("Error fetching user tenant:", error);
      setUserChecked(true);
    } finally {
      fetchTenantInFlight.current = false;
    }
  }, []);

  // Initial tenant check on mount
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      await fetchUserTenant();
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session) {
        setTenantId(null);
        setUserChecked(true);
        return;
      }
      // Re-fetch tenant on sign-in, but only if not already checked
      if (!tenantCheckedOnce.current) {
        tenantCheckedOnce.current = true;
        fetchUserTenant();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchUserTenant]);

  // Fetch branches — guarded against duplicate/overlapping calls
  // Uses refs for all dependencies to keep the callback stable (no re-creation)
  const fetchBranches = useCallback(async () => {
    if (!userChecked) return;
    if (fetchBranchesInFlight.current) return;
    fetchBranchesInFlight.current = true;
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsLoading(false);
      fetchBranchesInFlight.current = false;
      return;
    }

    setIsLoading(true);
    try {
      let query = supabase
        .from("branches")
        .select("*")
        .is("deleted_at", null)
        .order("name");

      if (tenantIdRef.current) {
        query = query.eq("tenant_id", tenantIdRef.current);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching branches:", error);
        setAllBranches([]);
        return;
      }

      const branchList = (data || []) as Branch[];
      setAllBranches(branchList);

      const restriction = staffRestrictionRef.current;
      const filteredBranches = restriction 
        ? branchList.filter(b => restriction.branchIds.includes(b.id))
        : branchList;

      if (filteredBranches.length > 0) {
        let selectedBranch: Branch | undefined;
        
        if (selectedBranchIdRef.current) {
          selectedBranch = filteredBranches.find(b => b.id === selectedBranchIdRef.current);
        }
        
        if (!selectedBranch) {
          const savedBranchId = localStorage.getItem(CURRENT_BRANCH_KEY);
          if (savedBranchId) {
            selectedBranch = filteredBranches.find(b => b.id === savedBranchId);
          }
        }
        
        if (!selectedBranch && restriction?.primaryBranchId) {
          selectedBranch = filteredBranches.find(b => b.id === restriction.primaryBranchId);
        }
        
        if (!selectedBranch) {
          selectedBranch = filteredBranches.find(b => b.is_default);
        }
        
        if (!selectedBranch) {
          selectedBranch = filteredBranches[0];
        }

        const currentIsAllowed = currentBranchRef.current && filteredBranches.some(b => b.id === currentBranchRef.current?.id);
        
        if (!currentBranchRef.current || !currentIsAllowed || !isInitializedRef.current) {
          setCurrentBranchState(selectedBranch);
          localStorage.setItem(CURRENT_BRANCH_KEY, selectedBranch.id);
          setSelectedBranchId(selectedBranch.id);
        } else if (currentBranchRef.current) {
          const updatedCurrentBranch = filteredBranches.find(b => b.id === currentBranchRef.current?.id);
          if (updatedCurrentBranch && JSON.stringify(updatedCurrentBranch) !== JSON.stringify(currentBranchRef.current)) {
            setCurrentBranchState(updatedCurrentBranch);
          }
        }
        
        setIsInitialized(true);
      } else if (filteredBranches.length === 0 && restriction) {
        setCurrentBranchState(null);
        setSelectedBranchId(null);
      }
    } finally {
      setIsLoading(false);
      fetchBranchesInFlight.current = false;
    }
  // Stable callback — all mutable values read from refs
  }, [userChecked, setSelectedBranchId]);

  const setCurrentBranch = useCallback((branch: Branch) => {
    if (staffRestriction) {
      const isAllowed = staffRestriction.branchIds.includes(branch.id);
      if (!isAllowed) {
        console.warn("Staff user attempted to switch to unauthorized branch");
        return;
      }
    }
    
    setCurrentBranchState(branch);
    localStorage.setItem(CURRENT_BRANCH_KEY, branch.id);
    setSelectedBranchId(branch.id);
  }, [staffRestriction, setSelectedBranchId]);

  const setStaffBranchRestriction = useCallback((restriction: StaffBranchRestriction | null) => {
    setStaffRestriction(restriction);
  }, []);

  // Fetch branches when userChecked or tenantId changes
  useEffect(() => {
    if (userChecked) {
      fetchBranches();
    }
  }, [userChecked, tenantId, staffRestriction, fetchBranches]);

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
