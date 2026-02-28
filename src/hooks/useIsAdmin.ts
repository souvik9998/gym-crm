/**
 * Hook to check if the current user is a gym owner (admin role)
 * 
 * NOW DELEGATES to the centralized AuthProvider instead of making
 * its own Supabase API calls. This eliminates redundant auth checks.
 */
import { useAuth } from "@/contexts/AuthContext";

export const useIsAdmin = () => {
  const { isAdmin, isSuperAdmin, isGymOwner, isLoading } = useAuth();
  return { isAdmin, isSuperAdmin, isGymOwner, isLoading };
};
