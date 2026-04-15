import { useEffect, ReactNode, useContext } from "react";
import { BranchContext } from "@/contexts/BranchContext";
import { StaffAuthContext } from "@/contexts/StaffAuthContext";

/**
 * Bridge component to connect StaffAuth with BranchContext.
 * Uses useContext directly (instead of useBranch) to gracefully handle
 * cases where BranchProvider context is temporarily unavailable during HMR.
 */
export const StaffBranchBridge = ({ children }: { children: ReactNode }) => {
  const branchCtx = useContext(BranchContext);
  const staffAuth = useContext(StaffAuthContext);
  
  useEffect(() => {
    if (branchCtx && staffAuth) {
      staffAuth.setBranchRestrictionCallback(branchCtx.setStaffBranchRestriction);
      return () => staffAuth.setBranchRestrictionCallback(null);
    }
  }, [branchCtx, staffAuth]);
  
  return <>{children}</>;
};
