import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUserRoles";
import { 
  fetchPlatformStats, 
  fetchFilteredPlatformStats, 
  fetchTenants, 
  fetchAllBranches,
  Tenant 
} from "@/api/tenants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  UsersIcon,
  ChartBarIcon,
  CurrencyRupeeIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalBranches: number;
  totalMembers: number;
  totalStaff: number;
}

interface FilteredStats {
  totalMembers: number;
  activeMembers: number;
  totalStaff: number;
  totalBranches: number;
  monthlyRevenue: number;
}

interface Branch {
  id: string;
  name: string;
  tenant_id: string;
  tenant_name?: string;
  is_active: boolean;
}

export default function SuperAdminAnalytics() {
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [filteredStats, setFilteredStats] = useState<FilteredStats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filteredBranches, setFilteredBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFiltered, setIsLoadingFiltered] = useState(false);
  
  // Filters
  const [selectedTenantId, setSelectedTenantId] = useState<string>("all");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/admin/login");
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [statsData, tenantsData, branchesData] = await Promise.all([
          fetchPlatformStats(),
          fetchTenants(),
          fetchAllBranches(),
        ]);
        setStats(statsData);
        setTenants(tenantsData);
        setBranches(branchesData);
        setFilteredBranches(branchesData);
      } catch (error) {
        console.error("Error loading analytics:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isSuperAdmin) {
      loadInitialData();
    }
  }, [isSuperAdmin]);

  // Load filtered stats when tenant or branch changes
  useEffect(() => {
    const loadFilteredStats = async () => {
      if (selectedTenantId === "all" && selectedBranchId === "all") {
        setFilteredStats(null);
        return;
      }

      setIsLoadingFiltered(true);
      try {
        const tenantId = selectedTenantId !== "all" ? selectedTenantId : undefined;
        const branchId = selectedBranchId !== "all" ? selectedBranchId : undefined;
        const data = await fetchFilteredPlatformStats(tenantId, branchId);
        setFilteredStats(data);
      } catch (error) {
        console.error("Error loading filtered stats:", error);
      } finally {
        setIsLoadingFiltered(false);
      }
    };

    loadFilteredStats();
  }, [selectedTenantId, selectedBranchId]);

  // Update filtered branches when tenant changes
  useEffect(() => {
    if (selectedTenantId === "all") {
      setFilteredBranches(branches);
    } else {
      setFilteredBranches(branches.filter(b => b.tenant_id === selectedTenantId));
    }
    // Reset branch selection when tenant changes
    setSelectedBranchId("all");
  }, [selectedTenantId, branches]);

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

  const platformStatCards = [
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

  const hasFilters = selectedTenantId !== "all" || selectedBranchId !== "all";

  const filteredStatCards = filteredStats ? [
    {
      title: "Total Members",
      value: filteredStats.totalMembers,
      subtitle: "In selected scope",
      icon: UserGroupIcon,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Active Members",
      value: filteredStats.activeMembers,
      subtitle: "With active subscription",
      icon: CheckCircleIcon,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Total Staff",
      value: filteredStats.totalStaff,
      subtitle: "Active staff members",
      icon: UsersIcon,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Monthly Revenue",
      value: `₹${filteredStats.monthlyRevenue.toLocaleString()}`,
      subtitle: "This month",
      icon: CurrencyRupeeIcon,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      isString: true,
    },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Overview of all organizations and their metrics
        </p>
      </div>

      {/* Platform-wide Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {platformStatCards.map((stat) => (
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

      {/* Filters Section */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Filter Analytics</CardTitle>
          <CardDescription>View detailed analytics by organization or branch</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Organization</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Organizations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organizations</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select 
                value={selectedBranchId} 
                onValueChange={setSelectedBranchId}
                disabled={filteredBranches.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {filteredBranches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                      {selectedTenantId === "all" && branch.tenant_name && (
                        <span className="text-muted-foreground ml-2">
                          ({branch.tenant_name})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtered Stats */}
      {hasFilters && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Filtered Results
            {selectedTenantId !== "all" && (
              <span className="text-muted-foreground font-normal ml-2">
                - {tenants.find(t => t.id === selectedTenantId)?.name}
              </span>
            )}
            {selectedBranchId !== "all" && (
              <span className="text-muted-foreground font-normal ml-2">
                / {filteredBranches.find(b => b.id === selectedBranchId)?.name}
              </span>
            )}
          </h2>
          
          {isLoadingFiltered ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : filteredStats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredStatCards.map((stat) => (
                <Card key={stat.title} className="border-0 shadow-sm bg-muted/30">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{stat.title}</p>
                        <p className="text-3xl font-bold text-foreground mt-1">
                          {stat.isString ? stat.value : (stat.value as number).toLocaleString()}
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
          ) : null}
        </div>
      )}

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
