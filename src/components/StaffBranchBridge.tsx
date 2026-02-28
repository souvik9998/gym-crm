import { useEffect, ReactNode, useContext } from "react";
import { useBranch } from "@/contexts/BranchContext";
import { StaffAuthContext } from "@/contexts/StaffAuthContext";

/**
 * Bridge component to connect StaffAuth with BranchContext.
 * Gracefully handles cases where StaffAuthProvider is not yet mounted
 * (e.g., during HMR or error recovery) to prevent blank screens.
 */
export const StaffBranchBridge = ({ children }: { children: ReactNode }) => {
  const { setStaffBranchRestriction } = useBranch();
  const staffAuth = useContext(StaffAuthContext);
  
  useEffect(() => {
    if (staffAuth) {
      staffAuth.setBranchRestrictionCallback(setStaffBranchRestriction);
      return () => staffAuth.setBranchRestrictionCallback(null);
    }
  }, [staffAuth, setStaffBranchRestriction]);
  
  return <>{children}</>;
};
