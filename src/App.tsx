import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BranchProvider, useBranch } from "@/contexts/BranchContext";
import { StaffAuthProvider, useStaffAuth } from "@/contexts/StaffAuthContext";
import Index from "./pages/Index";
import Register from "./pages/Register";
import Renew from "./pages/Renew";
import ExtendPT from "./pages/ExtendPT";
import Success from "./pages/Success";
import MemberProfile from "./pages/MemberProfile";
import AdminLogin from "./pages/admin/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminQRCode from "./pages/admin/QRCode";
import AdminSettings from "./pages/admin/Settings";
import AdminAnalytics from "./pages/admin/Analytics";
import AdminLedger from "./pages/admin/Ledger";
import Logs from "./pages/admin/Logs";
import StaffManagement from "./pages/admin/StaffManagement";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/qr-code" element={<AdminQRCode />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/analytics" element={<AdminAnalytics />} />
              <Route path="/admin/ledger" element={<AdminLedger />} />
              <Route path="/admin/logs" element={<Logs />} />
              <Route path="/admin/staff" element={<StaffManagement />} />
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
