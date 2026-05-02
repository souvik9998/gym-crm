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
import {
  AdminSectionSkeleton,
  AnalyticsSectionSkeleton,
  AttendanceSectionSkeleton,
  BranchAnalyticsSkeleton,
  DashboardFullSkeleton,
  EventsSectionSkeleton,
  PageLoader,
  SettingsSectionSkeleton,
  StaffManagementSkeleton,
  SuperAdminFormSkeleton,
  SuperAdminTableSkeleton,
  TimeSlotsSkeleton,
} from "@/components/ui/skeleton-loaders";
import { ProtectedRoute } from "@/components/admin/ProtectedRoute";
import { AdminLayoutRoute } from "@/components/admin/AdminLayoutRoute";
import { LedgerSkeleton } from "@/components/admin/LedgerSkeleton";
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
import StaffDashboard from "./pages/admin/StaffDashboard";
import StaffTimeSlots from "./pages/admin/StaffTimeSlots";
import AdminQRCode from "./pages/admin/QRCode";
import AdminSettings from "./pages/admin/Settings";
import AdminCalendar from "./pages/admin/Calendar";
import AdminAnalytics from "./pages/admin/Analytics";
import BranchAnalytics from "./pages/admin/BranchAnalytics";
import AdminLedger from "./pages/admin/Ledger";
import Logs from "./pages/admin/Logs";
import StaffManagement from "./pages/admin/StaffManagement";
import AdminTimeSlots from "./pages/admin/AdminTimeSlots";
import TrainersPage from "./pages/admin/Trainers";
import Attendance from "./pages/admin/Attendance";
import Events from "./pages/admin/Events";
import EventDetail from "./pages/admin/EventDetail";
import TenantList from "./pages/superadmin/TenantList";
import TenantDetail from "./pages/superadmin/TenantDetail";
import CreateTenant from "./pages/superadmin/CreateTenant";
import AuditLogs from "./pages/superadmin/AuditLogs";
import SuperAdminUsers from "./pages/superadmin/Users";
import SuperAdminAnalytics from "./pages/superadmin/Analytics";
import SuperAdminSettings from "./pages/superadmin/Settings";
const InvoicePage = lazyWithRetry(() => import("./pages/Invoice"));

// Lazy load admin pages for better initial load time
const AdminDashboard = lazyWithRetry(() => import("./pages/admin/Dashboard"));
const EventRegistration = lazyWithRetry(() => import("./pages/EventRegistration"));
const PublicCalendar = lazyWithRetry(() => import("./pages/PublicCalendar"));

// Lazy load Super Admin pages
const SuperAdminDashboard = lazyWithRetry(() => import("./pages/superadmin/Dashboard"));

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
        <Suspense fallback={<DashboardFullSkeleton />}>
          <AdminDashboard />
        </Suspense>
      } />
      <Route path="/admin/staff" element={
        <ProtectedRoute requiredPermission="admin_only" requiredModule="staff_management">
          <Suspense fallback={<StaffManagementSkeleton />}><StaffManagement /></Suspense>
        </ProtectedRoute>
      } />
      <Route path="/admin/time-slots" element={
        <ProtectedRoute requiredPermission="admin_only" requiredModule="staff_management">
          <Suspense fallback={<TimeSlotsSkeleton />}><AdminTimeSlots /></Suspense>
        </ProtectedRoute>
      } />
      <Route path="/admin/trainers" element={
        <Suspense fallback={<AdminSectionSkeleton />}><TrainersPage /></Suspense>
      } />
      <Route path="/admin/logs" element={
        <Suspense fallback={<AdminSectionSkeleton />}><Logs /></Suspense>
      } />
      <Route path="/admin/branch-analytics" element={
        <ProtectedRoute requiredPermission="admin_only" requiredModule="branch_analytics">
          <Suspense fallback={<BranchAnalyticsSkeleton />}><BranchAnalytics /></Suspense>
        </ProtectedRoute>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="can_access_attendance" requiredModule="attendance">
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/attendance" element={
        <Suspense fallback={<AttendanceSectionSkeleton />}><Attendance /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission={["can_view_settings", "can_change_settings"]}>
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/qr-code" element={
        <Suspense fallback={<AdminSectionSkeleton />}><AdminQRCode /></Suspense>
      } />
      <Route path="/admin/settings" element={
        <Suspense fallback={<SettingsSectionSkeleton />}><AdminSettings /></Suspense>
      } />
      <Route path="/admin/calendar" element={
        <Suspense fallback={<AdminSectionSkeleton />}><AdminCalendar /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="can_access_analytics" requiredModule="reports_analytics">
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/analytics" element={
        <Suspense fallback={<AnalyticsSectionSkeleton />}><AdminAnalytics /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="can_access_ledger" requiredModule="payments_billing">
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/ledger" element={
        <Suspense fallback={<LedgerSkeleton />}><AdminLedger /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="can_manage_events" requiredModule="event_management">
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/admin/events" element={
        <Suspense fallback={<EventsSectionSkeleton />}><Events /></Suspense>
      } />
      <Route path="/admin/events/:eventId" element={
        <Suspense fallback={<AdminSectionSkeleton />}><EventDetail /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute staffOnly>
        <AdminLayoutRoute />
      </ProtectedRoute>
    }>
      <Route path="/staff/dashboard" element={
        <Suspense fallback={<AdminSectionSkeleton />}><StaffDashboard /></Suspense>
      } />
      <Route path="/staff/time-slots" element={
        <Suspense fallback={<TimeSlotsSkeleton />}><StaffTimeSlots /></Suspense>
      } />
    </Route>

    <Route element={
      <ProtectedRoute requiredPermission="super_admin_only">
        <SuperAdminLayout />
      </ProtectedRoute>
    }>
      <Route path="/superadmin/dashboard" element={
        <Suspense fallback={<AdminSectionSkeleton />}><SuperAdminDashboard /></Suspense>
      } />
      <Route path="/superadmin/tenants" element={
        <Suspense fallback={<SuperAdminTableSkeleton />}><TenantList /></Suspense>
      } />
      <Route path="/superadmin/tenants/new" element={
        <Suspense fallback={<SuperAdminFormSkeleton />}><CreateTenant /></Suspense>
      } />
      <Route path="/superadmin/tenants/:tenantId" element={
        <Suspense fallback={<AdminSectionSkeleton />}><TenantDetail /></Suspense>
      } />
      <Route path="/superadmin/users" element={
        <Suspense fallback={<AdminSectionSkeleton />}><SuperAdminUsers /></Suspense>
      } />
      <Route path="/superadmin/analytics" element={
        <Suspense fallback={<AdminSectionSkeleton />}><SuperAdminAnalytics /></Suspense>
      } />
      <Route path="/superadmin/audit-logs" element={
        <Suspense fallback={<AdminSectionSkeleton />}><AuditLogs /></Suspense>
      } />
      <Route path="/superadmin/settings" element={
        <Suspense fallback={<AdminSectionSkeleton />}><SuperAdminSettings /></Suspense>
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
  // While resolving tenant domain, show the centered spinner so the user
  // never sees a blank screen on initial load.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }
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

