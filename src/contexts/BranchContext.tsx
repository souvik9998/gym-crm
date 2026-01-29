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
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

const CURRENT_BRANCH_KEY = "admin-current-branch-id";

export const BranchProvider = ({ children }: { children: ReactNode }) => {
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranchState] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [staffRestriction, setStaffRestriction] = useState<StaffBranchRestriction | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
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

  const fetchBranches = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching branches:", error);
        return;
      }

      // Filter out soft-deleted branches for regular display
      const branchList = ((data || []) as Branch[]).filter(b => !b.deleted_at);
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
  }, [staffRestriction, selectedBranchId, setSelectedBranchId, isInitialized]);

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
