import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  MessageSquare,
  Activity,
  RefreshCw,
  LogOut,
  Settings,
  BarChart3,
  Users,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import WhatsAppLogsTab from "@/components/admin/WhatsAppLogsTab";
import AdminActivityLogsTab from "@/components/admin/AdminActivityLogsTab";
import UserActivityLogsTab from "@/components/admin/UserActivityLogsTab";

const Logs = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("activity");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/admin/login");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/admin/login");
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/dashboard")}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow overflow-hidden">
                <img
                  src="/logo.jpg"
                  alt="Icon"
                  className="w-full h-full object-cover rounded-xl"
                />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Activity Logs</h1>
                <p className="text-xs text-muted-foreground">Track all activities</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/analytics")}
                title="Analytics"
              >
                <BarChart3 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/settings")}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleRefresh}
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleSignOut}
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="activity">
              <Activity className="w-4 h-4 mr-2" />
              Admin Activity
            </TabsTrigger>
            <TabsTrigger value="user">
              <Users className="w-4 h-4 mr-2" />
              User Activity
            </TabsTrigger>
            <TabsTrigger value="whatsapp">
              <MessageSquare className="w-4 h-4 mr-2" />
              WhatsApp
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-6">
            <AdminActivityLogsTab refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="user" className="mt-6">
            <UserActivityLogsTab refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="whatsapp" className="mt-6">
            <WhatsAppLogsTab refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Logs;
