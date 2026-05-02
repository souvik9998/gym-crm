import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import { StaffAuthProvider } from "@/contexts/StaffAuthContext";
import { StaffBranchBridge } from "@/components/StaffBranchBridge";
import { DomainProvider, useDomainContext } from "@/contexts/DomainContext";
import { PageLoader, DashboardFullSkeleton } from "@/components/ui/skeleton-loaders";
import { ProtectedRoute } from "@/components/admin/ProtectedRoute";
import { AdminLayoutRoute } from "@/components/admin/AdminLayoutRoute";
import { queryClient } from "@/lib/queryClient";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import Index from "./pages/Index";
import Register from "./pages/Register";
import Renew from "./pages/Renew";
import ExtendPT from "./pages/ExtendPT";
import Success from "./pages/Success";
import MemberProfile from "./pages/MemberProfile";
import AdminLogin from "./pages/admin/Login";
import ResetPassword from "./pages/admin/ResetPassword";
import CheckIn from "./pages/CheckIn";
import NotFound from "./pages/NotFound";
const InvoicePage = lazyWithRetry(() => import("./pages/Invoice"));

// Lazy load admin pages for better initial load time
const AdminDashboard = lazyWithRetry(() => import("./pages/admin/Dashboard"));
const StaffDashboard = lazyWithRetry(() => import("./pages/admin/StaffDashboard"));
const StaffTimeSlots = lazyWithRetry(() => import("./pages/admin/StaffTimeSlots"));
const AdminQRCode = lazyWithRetry(() => import("./pages/admin/QRCode"));
const AdminSettings = lazyWithRetry(() => import("./pages/admin/Settings"));
const AdminCalendar = lazyWithRetry(() => import("./pages/admin/Calendar"));
const AdminAnalytics = lazyWithRetry(() => import("./pages/admin/Analytics"));
const BranchAnalytics = lazyWithRetry(() => import("./pages/admin/BranchAnalytics"));
const AdminLedger = lazyWithRetry(() => import("./pages/admin/Ledger"));
const Logs = lazyWithRetry(() => import("./pages/admin/Logs"));
const StaffManagement = lazyWithRetry(() => import("./pages/admin/StaffManagement"));
const AdminTimeSlots = lazyWithRetry(() => import("./pages/admin/AdminTimeSlots"));
const TrainersPage = lazyWithRetry(() => import("./pages/admin/Trainers"));
const Attendance = lazyWithRetry(() => import("./pages/admin/Attendance"));
const Events = lazyWithRetry(() => import("./pages/admin/Events"));
const EventDetail = lazyWithRetry(() => import("./pages/admin/EventDetail"));
const EventRegistration = lazyWithRetry(() => import("./pages/EventRegistration"));
const PublicCalendar = lazyWithRetry(() => import("./pages/PublicCalendar"));

// Lazy load Super Admin pages
const SuperAdminDashboard = lazyWithRetry(() => import("./pages/superadmin/Dashboard"));
const TenantList = lazyWithRetry(() => import("./pages/superadmin/TenantList"));
const TenantDetail = lazyWithRetry(() => import("./pages/superadmin/TenantDetail"));
const CreateTenant = lazyWithRetry(() => import("./pages/superadmin/CreateTenant"));
const AuditLogs = lazyWithRetry(() => import("./pages/superadmin/AuditLogs"));
const SuperAdminUsers = lazyWithRetry(() => import("./pages/superadmin/Users"));
const SuperAdminAnalytics = lazyWithRetry(() => import("./pages/superadmin/Analytics"));
const SuperAdminSettings = lazyWithRetry(() => import("./pages/superadmin/Settings"));

// Import SuperAdmin layout
import { SuperAdminLayout } from "@/components/superadmin/SuperAdminLayout";

/**
 * Routes shown when the app is served from a tenant's custom branded
 * domain (e.g. https://5threalm.in). Branch is auto-resolved from the
 * hostname by DomainProvider — no /b/:slug segment needed.
 *
 * Admin routes are intentionally NOT exposed on tenant domains; admins
 * always log in at gymkloud.in/admin/login.
 */
const TenantDomainRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/register" element={<Register />} />
    <Route path="/renew" element={<Renew />} />
    <Route path="/extend-pt" element={<ExtendPT />} />
    <Route path="/success" element={<Success />} />
    <Route path="/profile" element={<MemberProfile />} />
    <Route path="/check-in" element={<CheckIn />} />
    <Route path="/invoice/:invoiceId" element={
      <Suspense fallback={<PageLoader />}><InvoicePage /></Suspense>
    } />
    <Route path="/event/:eventSlug" element={
      <Suspense fallback={<PageLoader />}><EventRegistration /></Suspense>
    } />
    <Route path="/calendar" element={
      <Suspense fallback={<PageLoader />}><PublicCalendar /></Suspense>
    } />
    <Route path="/b/:branchSlug/calendar" element={
      <Suspense fallback={<PageLoader />}><PublicCalendar /></Suspense>
    } />
    {/* Branch-specific routes also work on tenant custom domains so the
        same QR/share links remain valid (https://customdomain/b/:slug). */}
    <Route path="/b/:branchSlug" element={<Index />} />
    <Route path="/b/:branchSlug/register" element={<Register />} />
    <Route path="/b/:branchSlug/renew" element={<Renew />} />
    <Route path="/b/:branchSlug/extend-pt" element={<ExtendPT />} />
    {/* Catch-all on tenant domains -> landing */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

/** Full admin + public routes served on the GymKloud platform host. */
const PlatformRoutes = () => (
  <Routes>
    {/* Default route - redirect to admin login */}
    <Route path="/" element={<Navigate to="/admin/login" replace />} />

    {/* Public routes for member registration (branch-specific only) */}
    <Route path="/register" element={<Navigate to="/admin/login" replace />} />
    <Route path="/renew" element={<Navigate to="/admin/login" replace />} />
    <Route path="/extend-pt" element={<Navigate to="/admin/login" replace />} />
    <Route path="/success" element={<Success />} />
    <Route path="/profile" element={<MemberProfile />} />
    <Route path="/invoice/:invoiceId" element={
      <Suspense fallback={<PageLoader />}><InvoicePage /></Suspense>
    } />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/event/:eventSlug" element={
      <Suspense fallback={<PageLoader />}><EventRegistration /></Suspense>
    } />
    <Route path="/b/:branchSlug/calendar" element={
      <Suspense fallback={<PageLoader />}><PublicCalendar /></Suspense>
    } />
    <Route path="/check-in" element={<CheckIn />} />

    {/* Admin routes with persistent layout */}
    <Route element={
      <ProtectedRoute requiredPermission="admin_only">
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/dashboard" element={
        <Suspense fallback={null}>
          <AdminDashboard />
        </Suspense>
      } />
      <Route path="/admin/staff" element={
        <ProtectedRoute requiredPermission="admin_only" requiredModule="staff_management">
          <Suspense fallback={<PageLoader />}><StaffManagement /></Suspense>
        </ProtectedRoute>
      } />
      <Route path="/admin/time-slots" element={
        <ProtectedRoute requiredPermission="admin_only" requiredModule="staff_management">
          <Suspense fallback={<PageLoader />}><AdminTimeSlots /></Suspense>
        </ProtectedRoute>
      } />
      <Route path="/admin/trainers" element={
        <Suspense fallback={<PageLoader />}><TrainersPage /></Suspense>
      } />
      <Route path="/admin/logs" element={
        <Suspense fallback={<PageLoader />}><Logs /></Suspense>
      } />
      <Route path="/admin/branch-analytics" element={
        <ProtectedRoute requiredPermission="admin_only" requiredModule="branch_analytics">
          <Suspense fallback={<PageLoader />}><BranchAnalytics /></Suspense>
        </ProtectedRoute>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="can_access_attendance" requiredModule="attendance">
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/attendance" element={
        <Suspense fallback={<PageLoader />}><Attendance /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission={["can_view_settings", "can_change_settings"]}>
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/qr-code" element={
        <Suspense fallback={<PageLoader />}><AdminQRCode /></Suspense>
      } />
      <Route path="/admin/settings" element={
        <Suspense fallback={<PageLoader />}><AdminSettings /></Suspense>
      } />
      <Route path="/admin/calendar" element={
        <Suspense fallback={<PageLoader />}><AdminCalendar /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="can_access_analytics" requiredModule="reports_analytics">
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/analytics" element={
        <Suspense fallback={<PageLoader />}><AdminAnalytics /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="can_access_ledger" requiredModule="payments_billing">
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/ledger" element={
        <Suspense fallback={<PageLoader />}><AdminLedger /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="can_manage_events" requiredModule="event_management">
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/events" element={
        <Suspense fallback={<PageLoader />}><Events /></Suspense>
      } />
      <Route path="/admin/events/:eventId" element={
        <Suspense fallback={<PageLoader />}><EventDetail /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute staffOnly>
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/staff/dashboard" element={
        <Suspense fallback={<PageLoader />}><StaffDashboard /></Suspense>
      } />
      <Route path="/staff/time-slots" element={
        <Suspense fallback={<PageLoader />}><StaffTimeSlots /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="super_admin_only">
        <SuperAdminLayout />
      </ProtectedRoute>
    }>
      <Route path="/superadmin/dashboard" element={
        <Suspense fallback={<PageLoader />}><SuperAdminDashboard /></Suspense>
      } />
      <Route path="/superadmin/tenants" element={
        <Suspense fallback={<PageLoader />}><TenantList /></Suspense>
      } />
      <Route path="/superadmin/tenants/new" element={
        <Suspense fallback={<PageLoader />}><CreateTenant /></Suspense>
      } />
      <Route path="/superadmin/tenants/:tenantId" element={
        <Suspense fallback={<PageLoader />}><TenantDetail /></Suspense>
      } />
      <Route path="/superadmin/users" element={
        <Suspense fallback={<PageLoader />}><SuperAdminUsers /></Suspense>
      } />
      <Route path="/superadmin/analytics" element={
        <Suspense fallback={<PageLoader />}><SuperAdminAnalytics /></Suspense>
      } />
      <Route path="/superadmin/audit-logs" element={
        <Suspense fallback={<PageLoader />}><AuditLogs /></Suspense>
      } />
      <Route path="/superadmin/settings" element={
        <Suspense fallback={<PageLoader />}><SuperAdminSettings /></Suspense>
      } />
    </Route>

    {/* Branch-specific routes for member registration (slug or UUID) */}
    <Route path="/b/:branchSlug" element={<Index />} />
    <Route path="/b/:branchSlug/register" element={<Register />} />
    <Route path="/b/:branchSlug/renew" element={<Renew />} />
    <Route path="/b/:branchSlug/extend-pt" element={<ExtendPT />} />

    <Route path="*" element={<Navigate to="/admin/login" replace />} />
  </Routes>
);

const RoutesByDomain = () => {
  const { mode, isLoading } = useDomainContext();
  // While resolving tenant domain, render nothing so the page-level
  // skeleton (RegistrationPageSkeleton / DashboardFullSkeleton) is the
  // ONLY loading UI the user sees — avoids the spinner→skeleton flash.
  if (isLoading) return null;
  return mode === "tenant" ? <TenantDomainRoutes /> : <PlatformRoutes />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DomainProvider>
      <AuthProvider>
        <TooltipProvider>
          <BranchProvider>
            <StaffAuthProvider>
              <StaffBranchBridge>
                <Toaster />
                <BrowserRouter>
                  <RoutesByDomain />
                </BrowserRouter>
              </StaffBranchBridge>
            </StaffAuthProvider>
          </BranchProvider>
        </TooltipProvider>
      </AuthProvider>
    </DomainProvider>
  </QueryClientProvider>
);

export default App;

