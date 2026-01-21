import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BranchProvider, useBranch } from "@/contexts/BranchContext";
import { StaffAuthProvider, useStaffAuth } from "@/contexts/StaffAuthContext";
import { PageLoader } from "@/components/ui/skeleton-loaders";
import Index from "./pages/Index";
import Register from "./pages/Register";
import Renew from "./pages/Renew";
import ExtendPT from "./pages/ExtendPT";
import Success from "./pages/Success";
import MemberProfile from "./pages/MemberProfile";
import AdminLogin from "./pages/admin/Login";
import NotFound from "./pages/NotFound";

// Lazy load admin pages for better initial load time
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminQRCode = lazy(() => import("./pages/admin/QRCode"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminAnalytics = lazy(() => import("./pages/admin/Analytics"));
const AdminLedger = lazy(() => import("./pages/admin/Ledger"));
const Logs = lazy(() => import("./pages/admin/Logs"));
const StaffManagement = lazy(() => import("./pages/admin/StaffManagement"));

// Optimized QueryClient configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 2 minutes
      staleTime: 1000 * 60 * 2,
      // Keep unused data in cache for 30 minutes  
      gcTime: 1000 * 60 * 30,
      // Don't refetch on window focus (prevents unnecessary API calls)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect automatically
      refetchOnReconnect: false,
      // Retry failed requests once
      retry: 1,
      // Retry delay
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});

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
              <Route path="/" element={<Index />} />
              <Route path="/register" element={<Register />} />
              <Route path="/renew" element={<Renew />} />
              <Route path="/extend-pt" element={<ExtendPT />} />
              <Route path="/success" element={<Success />} />
              <Route path="/profile" element={<MemberProfile />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={
                <Suspense fallback={<PageLoader />}>
                  <AdminDashboard />
                </Suspense>
              } />
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
              <Route path="/admin/analytics" element={
                <Suspense fallback={<PageLoader />}>
                  <AdminAnalytics />
                </Suspense>
              } />
              <Route path="/admin/ledger" element={
                <Suspense fallback={<PageLoader />}>
                  <AdminLedger />
                </Suspense>
              } />
              <Route path="/admin/logs" element={
                <Suspense fallback={<PageLoader />}>
                  <Logs />
                </Suspense>
              } />
              <Route path="/admin/staff" element={
                <Suspense fallback={<PageLoader />}>
                  <StaffManagement />
                </Suspense>
              } />
              {/* Branch-specific routes */}
              <Route path="/b/:branchId" element={<Index />} />
              <Route path="/b/:branchId/register" element={<Register />} />
              <Route path="/b/:branchId/renew" element={<Renew />} />
              <Route path="/b/:branchId/extend-pt" element={<ExtendPT />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </BrowserRouter>
          </StaffBranchBridge>
        </StaffAuthProvider>
      </BranchProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
