import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth, StaffPermissions } from "@/contexts/StaffAuthContext";
import { ShieldExclamationIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PermissionKey = keyof StaffPermissions;

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** 
   * Required permission(s) for staff users to access this route.
   * If array, staff must have at least ONE of the permissions (OR logic).
   * Use "admin_only" to block staff entirely.
   */
  requiredPermission?: PermissionKey | PermissionKey[] | "admin_only";
  /** 
   * If true, only staff can access (blocks admin users).
   * Use for /staff/* routes.
   * Staff with at least one permission can access.
   */
  staffOnly?: boolean;
}

// Helper to check if email is a staff email pattern
function isStaffEmail(email: string | undefined): boolean {
  if (!email) return false;
  return email.startsWith("staff_") && email.endsWith("@gym.local");
}

/**
 * ProtectedRoute guards admin pages based on user type and permissions.
 * 
 * SECURITY: This component now verifies that authenticated users have valid roles.
 * Users in auth.users but not in user_roles/tenant_members will be denied access.
 * 
 * Flow:
 * 1. Checks if user is authenticated (either admin or staff)
 * 2. For admin users, verifies they have valid role in user_roles AND tenant membership
 * 3. For staff users, verifies they have the required permission
 * 4. Shows access denied page if unauthorized
 */
export const ProtectedRoute = ({
  children,
  requiredPermission,
  staffOnly = false,
}: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const { 
    isStaffLoggedIn, 
    permissions, 
    isLoading: staffLoading,
    staffUser 
  } = useStaffAuth();
  
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSessionUser(session?.user ?? null);
        
        // If no session at all, redirect to login
        if (!session?.user) {
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }
        
        // If this is a staff email, let staff auth context handle authorization
        if (isStaffEmail(session.user.email)) {
          setIsAuthorized(true); // Staff auth context will handle permissions
          setIsLoading(false);
          return;
        }
        
        // CRITICAL SECURITY: For admin users, verify they have valid role AND tenant membership
        // This prevents users in auth.users (who survived data truncation) from accessing admin
        const userId = session.user.id;
        
        // Check user_roles for admin or super_admin role
        const { data: roles, error: rolesError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .in("role", ["admin", "super_admin"]);
        
        if (rolesError) {
          console.error("Error checking user roles:", rolesError);
          setAuthError("Failed to verify authorization");
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }
        
        // No valid role found - user is not authorized
        if (!roles || roles.length === 0) {
          console.warn("User authenticated but no valid admin role found");
          setAuthError("No admin privileges. Please contact the super admin to get access.");
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }
        
        const userRoles = roles.map(r => r.role);
        const isSuperAdmin = userRoles.includes("super_admin");
        const isGymOwner = userRoles.includes("admin");
        
        // Super admins don't need tenant membership
        if (isSuperAdmin) {
          setIsAuthorized(true);
          setIsLoading(false);
          return;
        }
        
        // Gym owners (admin role) must have tenant membership
        if (isGymOwner) {
          const { data: tenantMembership, error: tenantError } = await supabase
            .from("tenant_members")
            .select("tenant_id")
            .eq("user_id", userId)
            .limit(1);
          
          if (tenantError) {
            console.error("Error checking tenant membership:", tenantError);
            setAuthError("Failed to verify organization membership");
            setIsAuthorized(false);
            setIsLoading(false);
            return;
          }
          
          if (!tenantMembership || tenantMembership.length === 0) {
            console.warn("Gym owner has no tenant membership");
            setAuthError("Not assigned to any organization. Please contact support.");
            setIsAuthorized(false);
            setIsLoading(false);
            return;
          }
          
          setIsAuthorized(true);
          setIsLoading(false);
          return;
        }
        
        // Unknown role state
        setAuthError("Invalid authorization state");
        setIsAuthorized(false);
        setIsLoading(false);
        
      } catch (error) {
        console.error("Auth check error:", error);
        setAuthError("Authentication error occurred");
        setIsAuthorized(false);
        setIsLoading(false);
      }
    };
    
    checkAuth();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) {
        setSessionUser(null);
        setIsAuthorized(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Still loading
  if (isLoading || staffLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated or not authorized - redirect to login or show error
  if (!isAuthorized || !sessionUser) {
    if (authError) {
      return <AccessDenied message={authError} showLogout />;
    }
    navigate("/admin/login");
    return null;
  }

  // Determine user type based on session email pattern
  const isStaffSession = isStaffEmail(sessionUser?.email);
  const isAdminSession = !isStaffSession;

  // Staff-only route but admin (non-staff) is trying to access
  if (staffOnly && isAdminSession) {
    navigate("/admin/dashboard");
    return null;
  }

  // Admin-only route but staff is trying to access
  if (requiredPermission === "admin_only" && (isStaffLoggedIn || isStaffSession)) {
    return <AccessDenied message="This section is only accessible to administrators." />;
  }

  // Staff user trying to access - check permissions
  const isEffectivelyStaff = isStaffLoggedIn || isStaffSession;
  if (isEffectivelyStaff && !isAdminSession && requiredPermission && requiredPermission !== "admin_only") {
    const permissionsToCheck = Array.isArray(requiredPermission) 
      ? requiredPermission 
      : [requiredPermission];
    
    const hasPermission = permissionsToCheck.some(perm => permissions?.[perm] === true);
    
    if (!hasPermission) {
      return (
        <AccessDenied 
          message={`You don't have permission to access this section. Required: ${permissionsToCheck.join(" or ")}`}
          staffUser={staffUser}
        />
      );
    }
  }

  // All checks passed - render children
  return <>{children}</>;
};

// Access Denied Component
const AccessDenied = ({ 
  message, 
  staffUser,
  showLogout = false,
}: { 
  message: string;
  staffUser?: { fullName: string; role: string } | null;
  showLogout?: boolean;
}) => {
  const navigate = useNavigate();
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="border-0 shadow-lg max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldExclamationIcon className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Access Denied
          </h2>
          <p className="text-muted-foreground mb-6">
            {message}
          </p>
          {staffUser && (
            <p className="text-sm text-muted-foreground mb-6">
              Logged in as: <span className="font-medium">{staffUser.fullName}</span> ({staffUser.role})
            </p>
          )}
          <div className="flex flex-col gap-2">
            {showLogout ? (
              <Button 
                onClick={handleLogout}
                variant="destructive"
              >
                Sign Out
              </Button>
            ) : (
              <Button 
                onClick={() => navigate("/staff/dashboard")}
                variant="default"
              >
                Go to Dashboard
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProtectedRoute;
