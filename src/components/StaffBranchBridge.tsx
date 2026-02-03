import { useEffect, ReactNode } from "react";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

/**
 * Bridge component to connect StaffAuth with BranchContext
 * This allows staff branch restrictions to be applied to the branch context
 * when a staff user logs in.
 * 
 * IMPORTANT: This component must be rendered INSIDE both BranchProvider and StaffAuthProvider
 */
export const StaffBranchBridge = ({ children }: { children: ReactNode }) => {
  const { setStaffBranchRestriction } = useBranch();
  const { setBranchRestrictionCallback } = useStaffAuth();
  
  useEffect(() => {
    setBranchRestrictionCallback(setStaffBranchRestriction);
    return () => setBranchRestrictionCallback(null);
  }, [setBranchRestrictionCallback, setStaffBranchRestriction]);
  
  return <>{children}</>;
};
