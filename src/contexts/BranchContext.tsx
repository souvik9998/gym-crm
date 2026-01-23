import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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
        const currentBranchValue = currentBranchRef.current;
        
        // For staff users, prioritize their primary branch
        if (staffRestriction?.primaryBranchId) {
          selectedBranch = filteredBranches.find(b => b.id === staffRestriction.primaryBranchId);
        }
        
        // If no primary branch, try default branch
        if (!selectedBranch) {
          selectedBranch = filteredBranches.find(b => b.is_default);
        }
        
        // If no default branch, try saved branch from localStorage
        if (!selectedBranch) {
          const savedBranchId = localStorage.getItem(CURRENT_BRANCH_KEY);
          selectedBranch = filteredBranches.find(b => b.id === savedBranchId);
        }
        
        // If still not found, use first branch
        if (!selectedBranch) {
          selectedBranch = filteredBranches[0];
        }

        // Only update if current branch is null or if the current branch is not in the allowed list
        const currentIsAllowed = currentBranchValue && filteredBranches.some(b => b.id === currentBranchValue.id);
        
        if (!currentBranchValue || !currentIsAllowed) {
          setCurrentBranchState(selectedBranch);
          localStorage.setItem(CURRENT_BRANCH_KEY, selectedBranch.id);
        } else if (currentBranchValue) {
          // Update current branch data if it exists in the list (in case branch details changed)
          const updatedCurrentBranch = filteredBranches.find(b => b.id === currentBranchValue.id);
          if (updatedCurrentBranch && JSON.stringify(updatedCurrentBranch) !== JSON.stringify(currentBranchValue)) {
            setCurrentBranchState(updatedCurrentBranch);
          }
        }
      } else if (filteredBranches.length === 0 && staffRestriction) {
        // Staff has no assigned branches - clear current branch
        setCurrentBranchState(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [staffRestriction]);

  const setCurrentBranch = (branch: Branch) => {
    // For staff users, verify the branch is in their allowed list
    if (staffRestriction) {
      const isAllowed = staffRestriction.branchIds.includes(branch.id);
      if (!isAllowed) {
        console.warn("Staff user attempted to switch to unauthorized branch");
        return;
      }
    }
    
    setCurrentBranchState(branch);
    localStorage.setItem(CURRENT_BRANCH_KEY, branch.id);
  };

  const setStaffBranchRestriction = useCallback((restriction: StaffBranchRestriction | null) => {
    setStaffRestriction(restriction);
  }, []);

  // Separate effect for initial fetch
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
