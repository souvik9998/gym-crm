import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUserRoles";
import { fetchPlatformStats, fetchTenants, Tenant } from "@/api/tenants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  UsersIcon,
  ChartBarIcon,
  PlusIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";

interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalBranches: number;
  totalMembers: number;
  totalStaff: number;
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/admin/login");
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [statsData, tenantsData] = await Promise.all([
          fetchPlatformStats(),
          fetchTenants(),
        ]);
        setStats(statsData);
        setTenants(tenantsData);
      } catch (error) {
        console.error("Error loading platform data:", error);
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
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
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
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheckIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Platform Management Console</p>
          </div>
        </div>
        <Button onClick={() => navigate("/superadmin/tenants/new")}>
          <PlusIcon className="w-4 h-4 mr-2" />
          New Organization
        </Button>
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

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card 
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/superadmin/tenants")}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BuildingOffice2Icon className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">Manage Organizations</p>
                <p className="text-sm text-muted-foreground">View and manage all tenants</p>
              </div>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card 
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/superadmin/audit-logs")}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <ChartBarIcon className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">Audit Logs</p>
                <p className="text-sm text-muted-foreground">Platform activity history</p>
              </div>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card 
          className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/admin/dashboard")}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <UsersIcon className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">Admin Dashboard</p>
                <p className="text-sm text-muted-foreground">Switch to gym admin view</p>
              </div>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Recent Tenants */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Organizations</CardTitle>
            <CardDescription>Recently created gym organizations</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/superadmin/tenants")}>
            View All
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tenants.slice(0, 5).map((tenant) => (
              <div
                key={tenant.id}
                className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                onClick={() => navigate(`/superadmin/tenants/${tenant.id}`)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BuildingOffice2Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{tenant.name}</p>
                    <p className="text-sm text-muted-foreground">{tenant.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={tenant.is_active ? "default" : "secondary"}>
                    {tenant.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(tenant.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            ))}

            {tenants.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <BuildingOffice2Icon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No organizations yet</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => navigate("/superadmin/tenants/new")}
                >
                  Create First Organization
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
