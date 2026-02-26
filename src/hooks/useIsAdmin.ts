import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout, AUTH_TIMEOUT_MS } from "@/lib/networkUtils";

/**
 * Hook to check if the current user is a gym owner (admin role)
 * Role hierarchy: super_admin (SaaS owner) > admin (gym owner)
 * Returns true if user has 'admin' or 'super_admin' role in user_roles table
 * 
 * IMPORTANT: Uses separate initial load vs ongoing changes pattern to prevent
 * race conditions on page refresh.
 */
export const useIsAdmin = () => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [isGymOwner, setIsGymOwner] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const checkAdminRole = async (userId: string) => {
      try {
        // Check if user has admin or super_admin role
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
      }
    };

    // Listener for ONGOING auth changes (does NOT control isLoading)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted.current) return;
        
        // Fire and forget - don't await, don't set loading
        if (session?.user) {
          // Use setTimeout(0) to avoid Supabase deadlock
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

    // INITIAL load (controls isLoading)
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          "Auth init"
        );
        if (!isMounted.current) return;

        if (session?.user) {
          // Fetch role BEFORE setting loading false
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
        if (isMounted.current) setIsLoading(false);
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
