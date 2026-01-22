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

/**
 * ProtectedRoute guards admin pages based on user type and permissions.
 * 
 * Flow:
 * 1. Checks if user is authenticated (either admin or staff)
 * 2. For staff users, verifies they have the required permission
 * 3. Shows access denied page if unauthorized
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
  
  const [adminUser, setAdminUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAdminUser(session?.user ?? null);
      setIsLoading(false);
    };
    
    checkAuth();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAdminUser(session?.user ?? null);
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

  const isAdminLoggedIn = !!adminUser;
  const isAuthenticated = isAdminLoggedIn || isStaffLoggedIn;

  // Not authenticated at all - redirect to login
  if (!isAuthenticated) {
    navigate("/admin/login");
    return null;
  }

  // Staff-only route but admin is trying to access
  if (staffOnly && isAdminLoggedIn && !isStaffLoggedIn) {
    // Redirect admin to their dashboard
    navigate("/admin/dashboard");
    return null;
  }

  // Admin-only route but staff is trying to access
  if (requiredPermission === "admin_only" && isStaffLoggedIn && !isAdminLoggedIn) {
    return <AccessDenied message="This section is only accessible to administrators." />;
  }

  // Staff user trying to access - check permissions
  if (isStaffLoggedIn && !isAdminLoggedIn && requiredPermission && requiredPermission !== "admin_only") {
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
  staffUser 
}: { 
  message: string;
  staffUser?: { fullName: string; role: string } | null;
}) => {
  const navigate = useNavigate();
  
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
          <Button 
            onClick={() => navigate("/staff/dashboard")}
            variant="default"
          >
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProtectedRoute;
