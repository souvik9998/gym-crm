import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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
}

interface BranchContextType {
  branches: Branch[];
  currentBranch: Branch | null;
  setCurrentBranch: (branch: Branch) => void;
  refreshBranches: () => Promise<void>;
  isLoading: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

const CURRENT_BRANCH_KEY = "admin-current-branch-id";

export const BranchProvider = ({ children }: { children: ReactNode }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranchState] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBranches = async () => {
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

      const branchList = (data || []) as Branch[];
      setBranches(branchList);

      if (branchList.length > 0) {
        // First, try to find default branch (highest priority on login)
        let selectedBranch = branchList.find(b => b.is_default);
        
        // If no default branch, try saved branch from localStorage
        if (!selectedBranch) {
          const savedBranchId = localStorage.getItem(CURRENT_BRANCH_KEY);
          selectedBranch = branchList.find(b => b.id === savedBranchId);
        }
        
        // If still not found, use first branch
        if (!selectedBranch) {
          selectedBranch = branchList[0];
        }

        // Only update if current branch is null or if we found a different default branch
        if (!currentBranch || (selectedBranch.is_default && selectedBranch.id !== currentBranch.id)) {
          setCurrentBranchState(selectedBranch);
          localStorage.setItem(CURRENT_BRANCH_KEY, selectedBranch.id);
        } else if (currentBranch) {
          // Update current branch data if it exists in the list
          const updatedCurrentBranch = branchList.find(b => b.id === currentBranch.id);
          if (updatedCurrentBranch) {
            setCurrentBranchState(updatedCurrentBranch);
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const setCurrentBranch = (branch: Branch) => {
    setCurrentBranchState(branch);
    localStorage.setItem(CURRENT_BRANCH_KEY, branch.id);
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  return (
    <BranchContext.Provider
      value={{
        branches,
        currentBranch,
        setCurrentBranch,
        refreshBranches: fetchBranches,
        isLoading,
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
