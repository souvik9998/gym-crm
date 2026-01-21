import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  can_access_financials: boolean;
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
}

const StaffAuthContext = createContext<StaffAuthContextType | undefined>(undefined);

const STORAGE_KEY = "staff_session";

export const StaffAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = () => {
    setStaffUser(null);
    setPermissions(null);
    setBranches([]);
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const verifySession = async (token: string): Promise<boolean> => {
    try {
      const { data } = await supabase.functions.invoke("staff-auth", {
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
        setBranches(response.branches || []);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Session verification failed:", error);
      return false;
    }
  };

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
  }, []);

  const login = async (phone: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke("staff-auth", {
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
      setBranches(response.branches || []);

      return { success: true };
    } catch (error: any) {
      console.error("Login error:", error);
      return { success: false, error: error.message || "Login failed" };
    }
  };

  const logout = async () => {
    try {
      if (session?.token) {
        await supabase.functions.invoke("staff-auth", {
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
