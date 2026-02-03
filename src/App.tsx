import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BranchProvider, useBranch } from "@/contexts/BranchContext";
import { StaffAuthProvider, useStaffAuth } from "@/contexts/StaffAuthContext";
import { PageLoader } from "@/components/ui/skeleton-loaders";
import { ProtectedRoute } from "@/components/admin/ProtectedRoute";
import { AdminLayoutRoute } from "@/components/admin/AdminLayoutRoute";
import { queryClient } from "@/lib/queryClient";
import Register from "./pages/Register";
import Renew from "./pages/Renew";
import ExtendPT from "./pages/ExtendPT";
import Success from "./pages/Success";
import MemberProfile from "./pages/MemberProfile";
import AdminLogin from "./pages/admin/Login";
import NotFound from "./pages/NotFound";

// Lazy load admin pages for better initial load time
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const StaffDashboard = lazy(() => import("./pages/admin/StaffDashboard"));
const AdminQRCode = lazy(() => import("./pages/admin/QRCode"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminAnalytics = lazy(() => import("./pages/admin/Analytics"));
const BranchAnalytics = lazy(() => import("./pages/admin/BranchAnalytics"));
const AdminLedger = lazy(() => import("./pages/admin/Ledger"));
const Logs = lazy(() => import("./pages/admin/Logs"));
const StaffManagement = lazy(() => import("./pages/admin/StaffManagement"));
const TrainersPage = lazy(() => import("./pages/admin/Trainers"));

// Lazy load Super Admin pages
const SuperAdminDashboard = lazy(() => import("./pages/superadmin/Dashboard"));
const TenantList = lazy(() => import("./pages/superadmin/TenantList"));
const CreateTenant = lazy(() => import("./pages/superadmin/CreateTenant"));
const AuditLogs = lazy(() => import("./pages/superadmin/AuditLogs"));

// Bridge component to connect StaffAuth with BranchContext
const StaffBranchBridge = ({ children }: { children: React.ReactNode }) => {
  const { setStaffBranchRestriction } = useBranch();
  const { setBranchRestrictionCallback } = useStaffAuth();
  
  useEffect(() => {
    setBranchRestrictionCallback(setStaffBranchRestriction);
    return () => setBranchRestrictionCallback(null);
  }, [setBranchRestrictionCallback, setStaffBranchRestriction]);
  
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BranchProvider>
        <StaffAuthProvider>
          <StaffBranchBridge>
            <Toaster />
            <BrowserRouter>
            <Routes>
              {/* Default route - redirect to admin login */}
              <Route path="/" element={<Navigate to="/admin/login" replace />} />
              
              {/* Public routes for member registration (branch-specific only) */}
              <Route path="/register" element={<Navigate to="/admin/login" replace />} />
              <Route path="/renew" element={<Navigate to="/admin/login" replace />} />
              <Route path="/extend-pt" element={<Navigate to="/admin/login" replace />} />
              <Route path="/success" element={<Success />} />
              <Route path="/profile" element={<MemberProfile />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              
              {/* Admin routes with persistent layout */}
              <Route element={
                <ProtectedRoute requiredPermission="admin_only">
                  <AdminLayoutRoute />
                </ProtectedRoute>
              }>
                <Route path="/admin/dashboard" element={
                  <Suspense fallback={<PageLoader />}>
                    <AdminDashboard />
                  </Suspense>
                } />
                <Route path="/admin/staff" element={
                  <Suspense fallback={<PageLoader />}>
                    <StaffManagement />
                  </Suspense>
                } />
                <Route path="/admin/trainers" element={
                  <Suspense fallback={<PageLoader />}>
                    <TrainersPage />
                  </Suspense>
                } />
                <Route path="/admin/logs" element={
                  <Suspense fallback={<PageLoader />}>
                    <Logs />
                  </Suspense>
                } />
                <Route path="/admin/branch-analytics" element={
                  <Suspense fallback={<PageLoader />}>
                    <BranchAnalytics />
                  </Suspense>
                } />
              </Route>

              {/* Permission-gated routes with persistent layout */}
              <Route element={
                <ProtectedRoute requiredPermission="can_change_settings">
                  <AdminLayoutRoute />
                </ProtectedRoute>
              }>
                <Route path="/admin/qr-code" element={
                  <Suspense fallback={<PageLoader />}>
                    <AdminQRCode />
                  </Suspense>
                } />
                <Route path="/admin/settings" element={
                  <Suspense fallback={<PageLoader />}>
                    <AdminSettings />
                  </Suspense>
                } />
              </Route>

              <Route element={
                <ProtectedRoute requiredPermission="can_access_analytics">
                  <AdminLayoutRoute />
                </ProtectedRoute>
              }>
                <Route path="/admin/analytics" element={
                  <Suspense fallback={<PageLoader />}>
                    <AdminAnalytics />
                  </Suspense>
                } />
              </Route>

              <Route element={
                <ProtectedRoute requiredPermission="can_access_ledger">
                  <AdminLayoutRoute />
                </ProtectedRoute>
              }>
                <Route path="/admin/ledger" element={
                  <Suspense fallback={<PageLoader />}>
                    <AdminLedger />
                  </Suspense>
                } />
              </Route>
              
              {/* Staff Dashboard Route - staff only */}
              <Route element={
                <ProtectedRoute staffOnly>
                  <AdminLayoutRoute />
                </ProtectedRoute>
              }>
                <Route path="/staff/dashboard" element={
                  <Suspense fallback={<PageLoader />}>
                    <StaffDashboard />
                  </Suspense>
                } />
              </Route>
              
              {/* Super Admin Routes */}
              <Route path="/superadmin/dashboard" element={
                <Suspense fallback={<PageLoader />}>
                  <SuperAdminDashboard />
                </Suspense>
              } />
              <Route path="/superadmin/tenants" element={
                <Suspense fallback={<PageLoader />}>
                  <TenantList />
                </Suspense>
              } />
              <Route path="/superadmin/tenants/new" element={
                <Suspense fallback={<PageLoader />}>
                  <CreateTenant />
                </Suspense>
              } />
              <Route path="/superadmin/audit-logs" element={
                <Suspense fallback={<PageLoader />}>
                  <AuditLogs />
                </Suspense>
              } />
              
              {/* Branch-specific routes for member registration */}
              <Route path="/b/:branchId" element={<Register />} />
              <Route path="/b/:branchId/register" element={<Register />} />
              <Route path="/b/:branchId/renew" element={<Renew />} />
              <Route path="/b/:branchId/extend-pt" element={<ExtendPT />} />
              
              {/* Catch all - redirect to admin login */}
              <Route path="*" element={<Navigate to="/admin/login" replace />} />
            </Routes>
            </BrowserRouter>
          </StaffBranchBridge>
        </StaffAuthProvider>
      </BranchProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
