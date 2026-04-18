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
  can_send_whatsapp: boolean;
  can_access_attendance: boolean;
  can_manage_events: boolean;
  member_access_type?: string;
  can_manage_time_slots?: boolean;
  can_create_time_slots?: boolean;
  can_edit_delete_time_slots?: boolean;
  can_view_time_slots?: boolean;
  can_assign_members_to_slots?: boolean;
  can_view_slot_members?: boolean;
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
  enabledModules: Record<string, boolean> | null;
  planExpired: boolean;
  branches: StaffBranch[];
  isLoading: boolean;
  isStaffLoggedIn: boolean;
  login: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearStaffState: () => void;
  setBranchRestrictionCallback: (callback: ((restriction: StaffBranchRestriction | null) => void) | null) => void;
}

export const StaffAuthContext = createContext<StaffAuthContextType | undefined>(undefined);

// Helper to check if email is a staff email
function isStaffEmail(email: string | undefined): boolean {
  if (!email) return false;
  return email.startsWith("staff_") && email.endsWith("@gym.local");
}

export const StaffAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean> | null>(null);
  const [planExpired, setPlanExpired] = useState(false);
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Use a ref for the branch restriction callback to avoid circular dependency
  const branchRestrictionCallbackRef = useRef<((restriction: StaffBranchRestriction | null) => void) | null>(null);
  
  const setBranchRestrictionCallback = useCallback((callback: ((restriction: StaffBranchRestriction | null) => void) | null) => {
    branchRestrictionCallbackRef.current = callback;
  }, []);

  // Public method to clear staff state (called when admin logs in)
  const clearStaffState = useCallback(() => {
    setStaffUser(null);
    setPermissions(null);
    setEnabledModules(null);
    setPlanExpired(false);
    setBranches([]);
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
  const verifySession = useCallback(async (options?: { source?: string }): Promise<boolean> => {
    try {
      // Get current Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        return false;
      }

      // CRITICAL: Skip verification for non-staff emails (admin users)
      if (!isStaffEmail(session.user?.email)) {
        return false;
      }

       // IMPORTANT: When using supabase-js `functions.invoke`, don't manually set
       // `Content-Type` while passing an object body, otherwise the body can be
       // coerced to the string "[object Object]" in some runtimes.
       // Pass action via querystring to avoid body parsing issues entirely.
       const queryParams = options?.source === "login" ? "action=verify-session&source=login" : "action=verify-session";
       const { data, error: invokeError } = await supabase.functions.invoke(`staff-auth?${queryParams}`, {
         headers: {
           Authorization: `Bearer ${session.access_token}`,
         },
       });

      // Parse response - check if it's a string
      const response = typeof data === "string" ? JSON.parse(data) : data;

      if (response?.valid) {
        console.log("[Staff Auth] Permissions loaded:", response.permissions);
        console.log("[Staff Auth] Staff user:", response.staff);
        console.log("[Staff Auth] Branches:", response.branches);
        setStaffUser(response.staff);
        setPermissions(response.permissions);
        setEnabledModules(response.enabledModules || null);
        setPlanExpired(response.planExpired === true);
        const staffBranches = response.branches || [];
        setBranches(staffBranches);
        // Apply branch restrictions for staff
        applyBranchRestrictions(staffBranches);
        return true;
      }

      // Session is invalid/expired on the server (e.g. revoked, password changed,
      // refresh token rotated out). Clear local Supabase session so the user lands
      // on the login screen instead of getting stuck on a blank protected route.
      const errMsg = String(response?.error || invokeError?.message || "");
      console.warn("[Staff Auth] verify-session failed, signing out:", errMsg);
      clearStaffState();
      await supabase.auth.signOut().catch(() => {});
      return false;
    } catch (error: any) {
      // supabase-js throws on non-2xx responses (e.g. 401 from verify-session).
      // Treat any thrown error here the same as a stale session and sign out
      // so the user is redirected to login instead of seeing a blank screen.
      console.warn("[Staff Auth] verify-session threw, signing out:", error?.message || error);
      clearStaffState();
      await supabase.auth.signOut().catch(() => {});
      return false;
    }
  }, [applyBranchRestrictions, clearStaffState]);

  useEffect(() => {
    let isMounted = true;

    // Listener for ONGOING auth changes (does NOT control isLoading)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        if (event === "SIGNED_OUT") {
          clearStaffState();
        } else if (event === "SIGNED_IN" && session?.user) {
          // CRITICAL: Only process staff users
          if (isStaffEmail(session.user.email)) {
            // Use setTimeout(0) to avoid Supabase deadlock
            setTimeout(() => {
              if (isMounted) verifySession();
            }, 0);
          } else {
            // Admin user logged in - clear any lingering staff state
            clearStaffState();
          }
        }
      }
    );

    // INITIAL load (controls isLoading)
    const initAuth = async () => {
      try {
        // Check if there's a Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        
        if (session?.user) {
          // CRITICAL: Only verify staff session if the email matches staff pattern
          // This prevents querying user_roles for admin users (which causes 406 errors)
          if (isStaffEmail(session.user.email)) {
            const isValid = await verifySession();
            if (!isMounted) return;
            if (!isValid) {
              clearStaffState();
            }
          }
          // If not a staff email, just skip - this is an admin user
        }
      } catch (error) {
        if (!isMounted) return;
        console.error("Auth init error:", error);
        clearStaffState();
      } finally {
        if (isMounted) setIsLoading(false);
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
      console.log("[Staff Login] Starting login for phone:", phone);
      
      // Clear any existing Supabase session (non-blocking with timeout)
      // Don't let this block login for too long
      try {
        const signOutPromise = supabase.auth.signOut({ scope: 'local' });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SignOut timeout')), 2000)
        );
        await Promise.race([signOutPromise, timeoutPromise]);
        console.log("[Staff Login] Previous session cleared");
      } catch (signOutError) {
        console.warn("[Staff Login] SignOut skipped (non-critical):", signOutError);
        // Continue anyway - this is not critical
      }

      // Use native auth directly (email pattern staff_{phone}@gym.local)
      const staffEmail = getStaffEmailFromPhone(phone);
      console.log("[Staff Login] Attempting signIn with email:", staffEmail);
      
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: staffEmail,
        password,
      });

      console.log("[Staff Login] SignIn result:", { error: signInError?.message, hasSession: !!signInData?.session });

      if (signInError) {
        return { success: false, error: signInError.message || "Login failed" };
      }

      console.log("[Staff Login] SignIn successful, verifying session...");
      const ok = await verifySession({ source: "login" });
      console.log("[Staff Login] Session verification result:", ok);
      
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
      // Clear all app state (localStorage, React Query cache, etc.)
      const { clearAllAppState } = await import("@/lib/logout");
      clearAllAppState();
      
      // Sign out from Supabase
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
    enabledModules,
    planExpired,
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

// Safe fallback used when the hook is somehow called outside the provider
// (e.g. during HMR module swaps). Prevents a hard runtime crash that would
// otherwise blank out the entire app — components already handle the
// "not logged in as staff" state gracefully.
const STAFF_AUTH_FALLBACK: StaffAuthContextType = {
  staffUser: null,
  permissions: null,
  enabledModules: null,
  planExpired: false,
  branches: [],
  isLoading: false,
  isStaffLoggedIn: false,
  login: async () => ({ success: false, error: "Auth provider not ready" }),
  logout: async () => {},
  refreshSession: async () => {},
  clearStaffState: () => {},
  setBranchRestrictionCallback: () => {},
};

export const useStaffAuth = (): StaffAuthContextType => {
  const context = useContext(StaffAuthContext);
  if (!context) {
    if (import.meta.env.DEV) {
      console.warn("useStaffAuth called outside StaffAuthProvider — returning fallback (likely an HMR artifact, refresh the page).");
    }
    return STAFF_AUTH_FALLBACK;
  }
  return context;
};

// Helper hook to check permissions
export const useStaffPermission = (permission: keyof StaffPermissions): boolean => {
  const { permissions } = useStaffAuth();
  const val = permissions?.[permission];
  return typeof val === 'boolean' ? val : false;
};
