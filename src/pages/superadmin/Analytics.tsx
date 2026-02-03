import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUserRoles";
import { fetchPlatformStats } from "@/api/tenants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  UsersIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalBranches: number;
  totalMembers: number;
  totalStaff: number;
}

export default function SuperAdminAnalytics() {
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/admin/login");
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const statsData = await fetchPlatformStats();
        setStats(statsData);
      } catch (error) {
        console.error("Error loading analytics:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin]);

  if (roleLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  const statCards = [
    {
      title: "Total Organizations",
      value: stats?.totalTenants || 0,
      subtitle: `${stats?.activeTenants || 0} active`,
      icon: BuildingOffice2Icon,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Total Branches",
      value: stats?.totalBranches || 0,
      subtitle: "Across all tenants",
      icon: BuildingOffice2Icon,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Total Members",
      value: stats?.totalMembers || 0,
      subtitle: "All gym members",
      icon: UserGroupIcon,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Total Staff",
      value: stats?.totalStaff || 0,
      subtitle: "Active staff members",
      icon: UsersIcon,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Overview of all organizations and their metrics
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {stat.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Placeholder for charts */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Platform Growth</CardTitle>
          <CardDescription>Member and organization growth over time</CardDescription>
        </CardHeader>
        <CardContent className="h-[400px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <ChartBarIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Platform-wide analytics charts coming soon</p>
            <p className="text-sm">View individual organization analytics from their detail page</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
