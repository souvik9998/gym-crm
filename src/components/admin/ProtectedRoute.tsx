import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth, StaffPermissions } from "@/contexts/StaffAuthContext";
import { useTenantPermissions, TenantFeaturePermissions } from "@/hooks/useTenantPermissions";
import { ShieldExclamationIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { withTimeout, AUTH_TIMEOUT_MS } from "@/lib/networkUtils";

type PermissionKey = keyof StaffPermissions;

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: PermissionKey | PermissionKey[] | "admin_only" | "super_admin_only";
  staffOnly?: boolean;
  requiredModule?: keyof TenantFeaturePermissions;
}

function isStaffEmail(email: string | undefined): boolean {
  if (!email) return false;
  return email.startsWith("staff_") && email.endsWith("@gym.local");
}

export const ProtectedRoute = ({
  children,
  requiredPermission,
  staffOnly = false,
  requiredModule,
}: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const { 
    isStaffLoggedIn, 
    permissions, 
    isLoading: staffLoading,
    staffUser 
  } = useStaffAuth();
  const { isModuleEnabled, planExpired, isLoading: tenantPermLoading } = useTenantPermissions();
  
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        // Wrap getSession with timeout for mobile network resilience
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          "Session check"
        );

        if (!isMounted) return;
        setSessionUser(session?.user ?? null);
        
        if (!session?.user) {
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }
        
        if (isStaffEmail(session.user.email)) {
          setIsAuthorized(true);
          setIsLoading(false);
          return;
        }
        
        const userId = session.user.id;
        
        const { data: roles, error: rolesError } = await withTimeout(
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .in("role", ["admin", "super_admin"])
            ,
          AUTH_TIMEOUT_MS,
          "Role check"
        );
        
        if (!isMounted) return;

        if (rolesError) {
          console.error("Error checking user roles:", rolesError);
          setAuthError("Failed to verify authorization. Please check your network connection.");
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }
        
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
        
        setIsSuperAdminUser(isSuperAdmin);
        
        if (isSuperAdmin) {
          setIsAuthorized(true);
          setIsLoading(false);
          return;
        }
        
        if (isGymOwner) {
          const { data: tenantMembership, error: tenantError } = await withTimeout(
            supabase
              .from("tenant_members")
              .select("tenant_id")
              .eq("user_id", userId)
              .limit(1)
              ,
            AUTH_TIMEOUT_MS,
            "Tenant check"
          );
          
          if (!isMounted) return;

          if (tenantError) {
            console.error("Error checking tenant membership:", tenantError);
            setAuthError("Failed to verify organization membership. Please check your network.");
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
        
        setAuthError("Invalid authorization state");
        setIsAuthorized(false);
        setIsLoading(false);
        
      } catch (error: any) {
        if (!isMounted) return;
        console.error("Auth check error:", error);
        const isTimeout = error.message?.includes("timed out");
        setAuthError(
          isTimeout
            ? "Network timeout. Please check your connection and refresh the page."
            : "Authentication error occurred"
        );
        setIsAuthorized(false);
        setIsLoading(false);
      }
    };
    
    checkAuth();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!isMounted) return;
      if (!session) {
        setSessionUser(null);
        setIsAuthorized(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading || staffLoading || tenantPermLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthorized || !sessionUser) {
    if (authError) {
      return <AccessDenied message={authError} showLogout />;
    }
    navigate("/admin/login");
    return null;
  }

  const isStaffSession = isStaffEmail(sessionUser?.email);
  const isAdminSession = !isStaffSession;

  if (staffOnly && isAdminSession) {
    navigate("/admin/dashboard");
    return null;
  }

  if (requiredPermission === "super_admin_only" && !isSuperAdminUser) {
    return <AccessDenied message="This section is only accessible to Super Administrators." showLogout />;
  }

  if (requiredPermission === "admin_only" && (isStaffLoggedIn || isStaffSession)) {
    return <AccessDenied message="This section is only accessible to administrators." />;
  }

  if (requiredModule && !isSuperAdminUser) {
    if (planExpired) {
      return <AccessDenied message="Your plan has expired. Contact the platform admin to renew." showLogout />;
    }
    if (!isModuleEnabled(requiredModule)) {
      return <AccessDenied message="This module is not available on your current plan. Contact the platform admin to enable it." />;
    }
  }

  const isEffectivelyStaff = isStaffLoggedIn || isStaffSession;
  if (isEffectivelyStaff && !isAdminSession && requiredPermission && requiredPermission !== "admin_only" && requiredPermission !== "super_admin_only") {
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

  return <>{children}</>;
};

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
    const { performFullLogout } = await import("@/lib/logout");
    await performFullLogout();
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
