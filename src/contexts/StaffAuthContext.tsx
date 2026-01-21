import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { StaffBranchRestriction } from "@/contexts/BranchContext";

export interface StaffUser {
  id: string;
  fullName: string;
  phone: string;
  role: "admin" | "manager" | "trainer" | "reception" | "accountant";
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

interface StaffSession {
  token: string;
  expiresAt: string;
}

interface StaffAuthContextType {
  staffUser: StaffUser | null;
  permissions: StaffPermissions | null;
  branches: StaffBranch[];
  session: StaffSession | null;
  isLoading: boolean;
  isStaffLoggedIn: boolean;
  login: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setBranchRestrictionCallback: (callback: ((restriction: StaffBranchRestriction | null) => void) | null) => void;
}

const StaffAuthContext = createContext<StaffAuthContextType | undefined>(undefined);

const STORAGE_KEY = "staff_session";

export const StaffAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Use a ref for the branch restriction callback to avoid circular dependency
  const branchRestrictionCallbackRef = useRef<((restriction: StaffBranchRestriction | null) => void) | null>(null);
  
  const setBranchRestrictionCallback = useCallback((callback: ((restriction: StaffBranchRestriction | null) => void) | null) => {
    branchRestrictionCallbackRef.current = callback;
  }, []);

  const clearAuth = useCallback(() => {
    setStaffUser(null);
    setPermissions(null);
    setBranches([]);
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
    // Clear branch restrictions when logging out
    branchRestrictionCallbackRef.current?.(null);
  }, []);

  // Apply branch restrictions based on staff branches
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

  const verifySession = useCallback(async (token: string): Promise<boolean> => {
    try {
      const { data } = await supabase.functions.invoke("staff-auth?action=verify-session", {
        body: {},
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Parse response - check if it's a string
      const response = typeof data === "string" ? JSON.parse(data) : data;

      if (response?.valid) {
        setStaffUser(response.staff);
        setPermissions(response.permissions);
        const staffBranches = response.branches || [];
        setBranches(staffBranches);
        // Apply branch restrictions for staff
        applyBranchRestrictions(staffBranches);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Session verification failed:", error);
      return false;
    }
  }, [applyBranchRestrictions]);

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const { token, expiresAt } = JSON.parse(stored);
          
          // Check if session is expired
          if (new Date(expiresAt) <= new Date()) {
            clearAuth();
            return;
          }

          const isValid = await verifySession(token);
          if (isValid) {
            setSession({ token, expiresAt });
          } else {
            clearAuth();
          }
        }
      } catch (error) {
        console.error("Auth init error:", error);
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [clearAuth, verifySession]);

  const login = async (phone: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke("staff-auth?action=login", {
        body: { phone, password },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // Handle the response - check if it's a string
      const response = typeof data === "string" ? JSON.parse(data) : data;

      if (!response?.success) {
        return { success: false, error: response?.error || "Login failed" };
      }

      // Store session
      const sessionData = {
        token: response.session.token,
        expiresAt: response.session.expiresAt,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
      
      setSession(sessionData);
      setStaffUser(response.staff);
      setPermissions(response.permissions);
      const staffBranches = response.branches || [];
      setBranches(staffBranches);
      
      // Apply branch restrictions for staff
      applyBranchRestrictions(staffBranches);

      return { success: true };
    } catch (error: any) {
      console.error("Login error:", error);
      return { success: false, error: error.message || "Login failed" };
    }
  };

  const logout = async () => {
    try {
      if (session?.token) {
        await supabase.functions.invoke("staff-auth?action=logout", {
          body: {},
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearAuth();
    }
  };

  const refreshSession = async () => {
    if (session?.token) {
      await verifySession(session.token);
    }
  };

  const value: StaffAuthContextType = {
    staffUser,
    permissions,
    branches,
    session,
    isLoading,
    isStaffLoggedIn: !!staffUser && !!session,
    login,
    logout,
    refreshSession,
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

// Helper hook to check permissions
export const useStaffPermission = (permission: keyof StaffPermissions): boolean => {
  const { permissions, staffUser } = useStaffAuth();
  
  // Admin always has all permissions
  if (staffUser?.role === "admin") return true;
  
  return permissions?.[permission] || false;
};
