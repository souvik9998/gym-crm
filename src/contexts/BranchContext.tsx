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

      // If no current branch set, try to restore from localStorage or use default
      if (!currentBranch && branchList.length > 0) {
        const savedBranchId = localStorage.getItem(CURRENT_BRANCH_KEY);
        
        // Try to find saved branch
        let selectedBranch = branchList.find(b => b.id === savedBranchId);
        
        // If not found, try default
        if (!selectedBranch) {
          selectedBranch = branchList.find(b => b.is_default);
        }
        
        // If still not found, use first branch
        if (!selectedBranch) {
          selectedBranch = branchList[0];
        }

        setCurrentBranchState(selectedBranch);
        localStorage.setItem(CURRENT_BRANCH_KEY, selectedBranch.id);
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
