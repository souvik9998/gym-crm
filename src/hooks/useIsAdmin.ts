import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to check if the current user is an admin (not staff)
 * Returns true if user has 'admin', 'super_admin', or 'tenant_admin' role in user_roles table
 */
export const useIsAdmin = () => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [isTenantAdmin, setIsTenantAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setIsTenantAdmin(false);
          setIsLoading(false);
          return;
        }

        // Check if user has any admin role
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["admin", "super_admin", "tenant_admin"]);

        if (error) {
          console.error("Error checking admin status:", error);
          setIsAdmin(false);
        } else {
          const roles = (data || []).map(r => r.role);
          setIsAdmin(roles.length > 0);
          setIsSuperAdmin(roles.includes("super_admin"));
          setIsTenantAdmin(roles.includes("tenant_admin"));
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminStatus();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { 
    isAdmin: isAdmin ?? false, 
    isSuperAdmin,
    isTenantAdmin,
    isLoading 
  };
};
