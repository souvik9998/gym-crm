import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffAuth, StaffPermissions } from "@/contexts/StaffAuthContext";
import { TenantFeaturePermissions } from "@/contexts/AuthContext";
import { ShieldExclamationIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

/**
 * ProtectedRoute guards admin pages based on user type and permissions.
 * NOW uses centralized AuthProvider instead of making its own Supabase calls.
 */
export const ProtectedRoute = ({
  children,
  requiredPermission,
  staffOnly = false,
  requiredModule,
}: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { 
    isStaffLoggedIn, 
    permissions, 
    isLoading: staffLoading,
    staffUser 
  } = useStaffAuth();

  // Still loading auth state
  if (auth.isLoading || staffLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!auth.isAuthenticated || !auth.user) {
    navigate("/admin/login");
    return null;
  }

  const isStaffSession = isStaffEmail(auth.user?.email);
  const isAdminSession = !isStaffSession;

  // For admin users (non-staff), verify they have valid roles
  if (isAdminSession && !isStaffSession) {
    if (!auth.isAdmin && !auth.isSuperAdmin) {
      return <AccessDenied message="No admin privileges. Please contact the super admin to get access." showLogout />;
    }
    // Gym owners must have a tenant
    if (auth.isGymOwner && !auth.isSuperAdmin && !auth.tenantId) {
      return <AccessDenied message="Not assigned to any organization. Please contact support." showLogout />;
    }
  }

  // Staff-only route but admin is trying to access
  if (staffOnly && isAdminSession) {
    navigate("/admin/dashboard");
    return null;
  }

  // Super admin only route
  if (requiredPermission === "super_admin_only" && !auth.isSuperAdmin) {
    return <AccessDenied message="This section is only accessible to Super Administrators." showLogout />;
  }

  // Admin-only route but staff is trying to access
  if (requiredPermission === "admin_only" && (isStaffLoggedIn || isStaffSession)) {
    return <AccessDenied message="This section is only accessible to administrators." />;
  }

  // Tenant module permission check (skip for super admins)
  if (requiredModule && !auth.isSuperAdmin) {
    if (auth.planExpired) {
      return <AccessDenied message="Your plan has expired. Contact the platform admin to renew." showLogout />;
    }
    if (!auth.isModuleEnabled(requiredModule)) {
      return <AccessDenied message="This module is not available on your current plan. Contact the platform admin to enable it." />;
    }
  }

  // Staff permission check
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
