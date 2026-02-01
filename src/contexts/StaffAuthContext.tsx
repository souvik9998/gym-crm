import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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

interface StaffAuthContextType {
  staffUser: StaffUser | null;
  permissions: StaffPermissions | null;
  branches: StaffBranch[];
  isLoading: boolean;
  isStaffLoggedIn: boolean;
  login: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setBranchRestrictionCallback: (callback: ((restriction: StaffBranchRestriction | null) => void) | null) => void;
}

const StaffAuthContext = createContext<StaffAuthContextType | undefined>(undefined);

export const StaffAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [branches, setBranches] = useState<StaffBranch[]>([]);
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

  // Verify session using the edge function
  const verifySession = useCallback(async (): Promise<boolean> => {
    try {
      // Get current Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        return false;
      }

      const { data } = await supabase.functions.invoke("staff-auth?action=verify-session", {
        body: {},
        headers: {
          Authorization: `Bearer ${session.access_token}`,
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
        // Check if there's a Supabase session and if the user is staff
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          // Check if this user is a staff member
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", "staff")
            .single();
          
          if (roleData) {
            // This is a staff user, verify their session
            const isValid = await verifySession();
            if (!isValid) {
              clearAuth();
            }
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

    // Listen to Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        clearAuth();
      } else if (event === "SIGNED_IN" && session?.user) {
        // Check if this is a staff user
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "staff")
          .single();
        
        if (roleData) {
          await verifySession();
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [clearAuth, verifySession]);

  const login = async (phone: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // CRITICAL: Clear any existing Supabase admin session before staff login
      // This prevents the bug where staff gets admin access due to lingering session
      await supabase.auth.signOut();
      
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

      // Set the Supabase session with the tokens from edge function
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: response.session.access_token,
        refresh_token: response.session.refresh_token,
      });

      if (sessionError) {
        console.error("Error setting session:", sessionError);
        return { success: false, error: "Failed to establish session" };
      }

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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        await supabase.functions.invoke("staff-auth?action=logout", {
          body: {},
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Sign out from Supabase
      await supabase.auth.signOut();
      clearAuth();
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
  const { permissions } = useStaffAuth();
  return permissions?.[permission] || false;
};
