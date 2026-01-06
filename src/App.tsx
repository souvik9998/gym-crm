import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
