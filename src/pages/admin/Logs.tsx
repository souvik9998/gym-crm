import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import WhatsAppLogsTab from "@/components/admin/WhatsAppLogsTab";
import AdminActivityLogsTab from "@/components/admin/AdminActivityLogsTab";
import UserActivityLogsTab from "@/components/admin/UserActivityLogsTab";
import { AdminLayout } from "@/components/admin/AdminLayout";

const Logs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "activity");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["activity", "user", "whatsapp"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <AdminLayout
      title="Activity Logs"
      subtitle="Track all activities"
      onRefresh={handleRefresh}
    >
      <div className="max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full max-w-lg grid-cols-3 mb-6 bg-muted/50 p-1">
            <TabsTrigger value="activity" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ClipboardDocumentListIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Admin Activity</span>
              <span className="sm:hidden">Admin</span>
            </TabsTrigger>
            <TabsTrigger value="user" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <UserGroupIcon className="w-4 h-4" />
              <span className="hidden sm:inline">User Activity</span>
              <span className="sm:hidden">User</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ChatBubbleLeftRightIcon className="w-4 h-4" />
              WhatsApp
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-0">
            <AdminActivityLogsTab refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="user" className="mt-0">
            <UserActivityLogsTab refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="whatsapp" className="mt-0">
            <WhatsAppLogsTab refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default Logs;
