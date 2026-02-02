import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsSuperAdmin } from "@/hooks/useUserRoles";
import { fetchPlatformAuditLogs } from "@/api/tenants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  UserIcon,
  BuildingOffice2Icon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  action_type: string;
  description: string;
  actor_user_id: string | null;
  target_tenant_id: string | null;
  target_user_id: string | null;
  old_value: any;
  new_value: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export default function AuditLogs() {
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/admin/login");
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    const loadLogs = async () => {
      try {
        const data = await fetchPlatformAuditLogs(200);
        setLogs(data);
        setFilteredLogs(data);
      } catch (error) {
        console.error("Error loading audit logs:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isSuperAdmin) {
      loadLogs();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = logs.filter(
        (log) =>
          log.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredLogs(filtered);
    } else {
      setFilteredLogs(logs);
    }
  }, [searchQuery, logs]);

  const getActionBadgeVariant = (actionType: string) => {
    if (actionType.includes("create") || actionType.includes("add")) return "default";
    if (actionType.includes("delete") || actionType.includes("remove")) return "destructive";
    if (actionType.includes("update") || actionType.includes("edit")) return "secondary";
    return "outline";
  };

  const getActionIcon = (actionType: string) => {
    if (actionType.includes("tenant") || actionType.includes("organization")) {
      return <BuildingOffice2Icon className="w-4 h-4" />;
    }
    if (actionType.includes("user") || actionType.includes("staff")) {
      return <UserIcon className="w-4 h-4" />;
    }
    if (actionType.includes("admin") || actionType.includes("permission")) {
      return <ShieldCheckIcon className="w-4 h-4" />;
    }
    return <DocumentTextIcon className="w-4 h-4" />;
  };

  if (roleLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-12 w-full max-w-sm" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/superadmin/dashboard")}
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Platform Audit Logs</h1>
              <p className="text-sm text-muted-foreground">
                Complete history of platform-level actions
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Audit Trail</CardTitle>
                <CardDescription>
                  {filteredLogs.length} log entries
                </CardDescription>
              </div>
              <div className="relative w-64">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                          {getActionIcon(log.action_type)}
                        </div>
                        <Badge variant={getActionBadgeVariant(log.action_type)}>
                          {log.action_type}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-foreground">{log.description}</p>
                      {log.old_value || log.new_value ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          {log.old_value && `Old: ${JSON.stringify(log.old_value).slice(0, 50)}...`}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.ip_address || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}

                {filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12">
                      <DocumentTextIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        {searchQuery ? "No logs found" : "No audit logs yet"}
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
