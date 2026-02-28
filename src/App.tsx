import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import { StaffAuthProvider } from "@/contexts/StaffAuthContext";
import { StaffBranchBridge } from "@/components/StaffBranchBridge";
import { PageLoader } from "@/components/ui/skeleton-loaders";
import { ProtectedRoute } from "@/components/admin/ProtectedRoute";
import { AdminLayoutRoute } from "@/components/admin/AdminLayoutRoute";
import { queryClient } from "@/lib/queryClient";
import Index from "./pages/Index";
import Register from "./pages/Register";
import Renew from "./pages/Renew";
import ExtendPT from "./pages/ExtendPT";
import Success from "./pages/Success";
import MemberProfile from "./pages/MemberProfile";
import AdminLogin from "./pages/admin/Login";
import CheckIn from "./pages/CheckIn";
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
const Attendance = lazy(() => import("./pages/admin/Attendance"));

// Lazy load Super Admin pages
const SuperAdminDashboard = lazy(() => import("./pages/superadmin/Dashboard"));
const TenantList = lazy(() => import("./pages/superadmin/TenantList"));
const TenantDetail = lazy(() => import("./pages/superadmin/TenantDetail"));
const CreateTenant = lazy(() => import("./pages/superadmin/CreateTenant"));
const AuditLogs = lazy(() => import("./pages/superadmin/AuditLogs"));
const SuperAdminUsers = lazy(() => import("./pages/superadmin/Users"));
const SuperAdminAnalytics = lazy(() => import("./pages/superadmin/Analytics"));
const SuperAdminSettings = lazy(() => import("./pages/superadmin/Settings"));

// Import SuperAdmin layout
import { SuperAdminLayout } from "@/components/superadmin/SuperAdminLayout";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
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
              <Route path="/check-in" element={<CheckIn />} />
              
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
                  <ProtectedRoute requiredPermission="admin_only" requiredModule="staff_management">
                    <Suspense fallback={<PageLoader />}>
                      <StaffManagement />
                    </Suspense>
                  </ProtectedRoute>
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
                  <ProtectedRoute requiredPermission="admin_only" requiredModule="reports_analytics">
                    <Suspense fallback={<PageLoader />}>
                      <BranchAnalytics />
                    </Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/admin/attendance" element={
                  <ProtectedRoute requiredPermission="admin_only" requiredModule="attendance">
                    <Suspense fallback={<PageLoader />}>
                      <Attendance />
                    </Suspense>
                  </ProtectedRoute>
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
                <ProtectedRoute requiredPermission="can_access_analytics" requiredModule="reports_analytics">
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
                <ProtectedRoute requiredPermission="can_access_ledger" requiredModule="payments_billing">
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
              
              {/* Super Admin Routes - Protected with Layout */}
              <Route element={
                <ProtectedRoute requiredPermission="super_admin_only">
                  <SuperAdminLayout />
                </ProtectedRoute>
              }>
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
                <Route path="/superadmin/tenants/:tenantId" element={
                  <Suspense fallback={<PageLoader />}>
                    <TenantDetail />
                  </Suspense>
                } />
                <Route path="/superadmin/users" element={
                  <Suspense fallback={<PageLoader />}>
                    <SuperAdminUsers />
                  </Suspense>
                } />
                <Route path="/superadmin/analytics" element={
                  <Suspense fallback={<PageLoader />}>
                    <SuperAdminAnalytics />
                  </Suspense>
                } />
                <Route path="/superadmin/audit-logs" element={
                  <Suspense fallback={<PageLoader />}>
                    <AuditLogs />
                  </Suspense>
                } />
                <Route path="/superadmin/settings" element={
                  <Suspense fallback={<PageLoader />}>
                    <SuperAdminSettings />
                  </Suspense>
                } />
              </Route>
              
              {/* Branch-specific routes for member registration */}
              <Route path="/b/:branchId" element={<Index />} />
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
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
