import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout, AUTH_TIMEOUT_MS } from "@/lib/networkUtils";
import type { StaffBranchRestriction } from "@/contexts/BranchContext";

export interface StaffUser {
  id: string;
  fullName: string;
  phone: string;
  role: "manager" | "trainer" | "reception" | "accountant";
  isActive: boolean;
}

export interface StaffPermissions {
  can_view_members: boolean;
  can_manage_members: boolean;
  can_access_ledger: boolean;
  can_access_payments: boolean;
  can_access_analytics: boolean;
  can_change_settings: boolean;
}

export interface StaffBranch {
  id: string;
  name: string;
  isPrimary: boolean;
}

function getStaffEmailFromPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "").replace(/^0/, "");
  return `staff_${cleaned}@gym.local`;
}

interface StaffAuthContextType {
  staffUser: StaffUser | null;
  permissions: StaffPermissions | null;
  branches: StaffBranch[];
  isLoading: boolean;
  isStaffLoggedIn: boolean;
  login: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearStaffState: () => void;
  setBranchRestrictionCallback: (callback: ((restriction: StaffBranchRestriction | null) => void) | null) => void;
}

const StaffAuthContext = createContext<StaffAuthContextType | undefined>(undefined);

function isStaffEmail(email: string | undefined): boolean {
  if (!email) return false;
  return email.startsWith("staff_") && email.endsWith("@gym.local");
}

export const StaffAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const branchRestrictionCallbackRef = useRef<((restriction: StaffBranchRestriction | null) => void) | null>(null);
  // In-flight guard to prevent overlapping verifySession calls
  const verifyInFlight = useRef(false);
  
  const setBranchRestrictionCallback = useCallback((callback: ((restriction: StaffBranchRestriction | null) => void) | null) => {
    branchRestrictionCallbackRef.current = callback;
  }, []);

  const clearStaffState = useCallback(() => {
    setStaffUser(null);
    setPermissions(null);
    setBranches([]);
    branchRestrictionCallbackRef.current?.(null);
  }, []);

  const applyBranchRestrictions = useCallback((staffBranches: StaffBranch[]) => {
    if (staffBranches.length > 0) {
      const primaryBranch = staffBranches.find(b => b.isPrimary);
      branchRestrictionCallbackRef.current?.({
        branchIds: staffBranches.map(b => b.id),
        primaryBranchId: primaryBranch?.id,
      });
    } else {
      branchRestrictionCallbackRef.current?.(null);
    }
  }, []);

  // Guarded verifySession — skips if already in flight
  const verifySession = useCallback(async (): Promise<boolean> => {
    if (verifyInFlight.current) return false;
    verifyInFlight.current = true;

    try {
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_TIMEOUT_MS,
        "Staff session check"
      );
      
      if (!session?.access_token) return false;
      if (!isStaffEmail(session.user?.email)) return false;

      const { data } = await withTimeout(
        supabase.functions.invoke("staff-auth?action=verify-session", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
        AUTH_TIMEOUT_MS,
        "Staff verify"
      );

      const response = typeof data === "string" ? JSON.parse(data) : data;

      if (response?.valid) {
        setStaffUser(response.staff);
        setPermissions(response.permissions);
        const staffBranches = response.branches || [];
        setBranches(staffBranches);
        applyBranchRestrictions(staffBranches);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Session verification failed:", error);
      return false;
    } finally {
      verifyInFlight.current = false;
    }
  }, [applyBranchRestrictions]);

  useEffect(() => {
    let isMounted = true;
    // Track whether initAuth already ran to avoid duplicate verify from onAuthStateChange
    let initDone = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        if (event === "SIGNED_OUT") {
          clearStaffState();
        } else if (event === "SIGNED_IN" && session?.user && initDone) {
          // Only handle post-init sign-ins (login action)
          if (isStaffEmail(session.user.email)) {
            setTimeout(() => {
              if (isMounted) verifySession();
            }, 0);
          } else {
            clearStaffState();
          }
        }
      }
    );

    const initAuth = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          "Staff init"
        );
        if (!isMounted) return;
        
        if (session?.user && isStaffEmail(session.user.email)) {
          const isValid = await verifySession();
          if (!isMounted) return;
          if (!isValid) clearStaffState();
        }
      } catch (error) {
        if (!isMounted) return;
        console.error("Auth init error:", error);
        clearStaffState();
      } finally {
        if (isMounted) {
          setIsLoading(false);
          initDone = true;
        }
      }
    };

    initAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clearStaffState, verifySession]);

  const login = async (phone: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      try {
        const signOutPromise = supabase.auth.signOut({ scope: 'local' });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SignOut timeout')), 2000)
        );
        await Promise.race([signOutPromise, timeoutPromise]);
      } catch {
        // Non-critical
      }

      const staffEmail = getStaffEmailFromPhone(phone);
      
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: staffEmail,
        password,
      });

      if (signInError) {
        return { success: false, error: signInError.message || "Login failed" };
      }

      const ok = await verifySession();
      
      if (!ok) {
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // ignore
        }
        clearStaffState();
        return { success: false, error: "Session established, but staff verification failed" };
      }

      return { success: true };
    } catch (error: any) {
      console.error("[Staff Login] Error:", error);
      return { success: false, error: error.message || "Login failed" };
    }
  };

  const logout = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        await supabase.functions.invoke("staff-auth?action=logout", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      const { clearAllAppState } = await import("@/lib/logout");
      clearAllAppState();
      await supabase.auth.signOut();
      clearStaffState();
    }
  };

  const refreshSession = async () => {
    await verifySession();
  };

  const value: StaffAuthContextType = {
    staffUser,
    permissions,
    branches,
    isLoading,
    isStaffLoggedIn: !!staffUser,
    login,
    logout,
    refreshSession,
    clearStaffState,
    setBranchRestrictionCallback,
  };

  return (
    <StaffAuthContext.Provider value={value}>
      {children}
    </StaffAuthContext.Provider>
  );
};

export const useStaffAuth = () => {
  const context = useContext(StaffAuthContext);
  if (!context) {
    throw new Error("useStaffAuth must be used within a StaffAuthProvider");
  }
  return context;
};

export const useStaffPermission = (permission: keyof StaffPermissions): boolean => {
  const { permissions } = useStaffAuth();
  return permissions?.[permission] || false;
};