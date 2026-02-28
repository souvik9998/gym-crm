import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import WhatsAppLogsTab from "@/components/admin/WhatsAppLogsTab";
import AdminActivityLogsTab from "@/components/admin/AdminActivityLogsTab";
import UserActivityLogsTab from "@/components/admin/UserActivityLogsTab";
import StaffActivityLogsTab from "@/components/admin/StaffActivityLogsTab";

const Logs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "activity");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["activity", "user", "staff", "whatsapp"].includes(tab)) {
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
    <div className="max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full max-w-2xl grid-cols-4 mb-4 lg:mb-6 bg-muted/50 p-0.5 lg:p-1 h-auto">
            <TabsTrigger value="activity" className="gap-1 lg:gap-2 text-[11px] lg:text-sm py-1.5 lg:py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ClipboardDocumentListIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              Admin
            </TabsTrigger>
            <TabsTrigger value="user" className="gap-1 lg:gap-2 text-[11px] lg:text-sm py-1.5 lg:py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <UserGroupIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              User
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-1 lg:gap-2 text-[11px] lg:text-sm py-1.5 lg:py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <UsersIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              Staff
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-1 lg:gap-2 text-[11px] lg:text-sm py-1.5 lg:py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              WhatsApp
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-0">
            <AdminActivityLogsTab refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="user" className="mt-0">
            <UserActivityLogsTab refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="staff" className="mt-0">
            <StaffActivityLogsTab refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="whatsapp" className="mt-0">
            <WhatsAppLogsTab refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>
      </div>
  );
};

export default Logs;
