import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to check if the current user is a gym owner (admin role)
 * Role hierarchy: super_admin (SaaS owner) > admin (gym owner)
 * Returns true if user has 'admin' or 'super_admin' role in user_roles table
 */
export const useIsAdmin = () => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [isGymOwner, setIsGymOwner] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setIsGymOwner(false);
          setIsLoading(false);
          return;
        }

        // Check if user has admin or super_admin role
        // admin = gym owner, super_admin = SaaS owner
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["admin", "super_admin"]);

        if (error) {
          console.error("Error checking admin status:", error);
          setIsAdmin(false);
        } else {
          const roles = (data || []).map(r => r.role);
          setIsAdmin(roles.length > 0);
          setIsSuperAdmin(roles.includes("super_admin"));
          setIsGymOwner(roles.includes("admin")); // admin = gym owner
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
    isGymOwner,  // admin = gym owner
    isLoading 
  };
};
