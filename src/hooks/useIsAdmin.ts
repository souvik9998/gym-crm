import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout, AUTH_TIMEOUT_MS } from "@/lib/networkUtils";

/**
 * Hook to check if the current user is a gym owner (admin role)
 * 
 * Uses in-flight guard to prevent duplicate role-check requests
 * from overlapping onAuthStateChange + initial getSession calls.
 */
export const useIsAdmin = () => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [isGymOwner, setIsGymOwner] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);
  const checkInFlight = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    let initDone = false;

    const checkAdminRole = async (userId: string) => {
      // Prevent overlapping role checks
      if (checkInFlight.current) return;
      checkInFlight.current = true;

      try {
        const { data, error } = await withTimeout(
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .in("role", ["admin", "super_admin"]),
          AUTH_TIMEOUT_MS,
          "Admin role check"
        );

        if (!isMounted.current) return;

        if (error) {
          console.error("Error checking admin status:", error);
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setIsGymOwner(false);
        } else {
          const roles = (data || []).map(r => r.role);
          setIsAdmin(roles.length > 0);
          setIsSuperAdmin(roles.includes("super_admin"));
          setIsGymOwner(roles.includes("admin"));
        }
      } catch (error) {
        if (!isMounted.current) return;
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setIsGymOwner(false);
      } finally {
        checkInFlight.current = false;
      }
    };

    // Listener for ONGOING auth changes — only fires after init completes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted.current || !initDone) return;
        
        if (session?.user) {
          setTimeout(() => {
            checkAdminRole(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setIsGymOwner(false);
        }
      }
    );

    // INITIAL load
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          "Auth init"
        );
        if (!isMounted.current) return;

        if (session?.user) {
          await checkAdminRole(session.user.id);
        } else {
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setIsGymOwner(false);
        }
      } catch (error) {
        if (!isMounted.current) return;
        console.error("Error initializing auth:", error);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setIsGymOwner(false);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
          initDone = true;
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  return { 
    isAdmin: isAdmin ?? false, 
    isSuperAdmin,
    isGymOwner,
    isLoading 
  };
};