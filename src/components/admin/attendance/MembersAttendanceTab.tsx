import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAttendanceLogs } from "@/hooks/queries/useAttendance";
import { useBranch } from "@/contexts/BranchContext";
import { ArrowPathIcon, DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import { resetAttendanceDevice } from "@/api/attendance";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";

export const MembersAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [page, setPage] = useState(1);
  const [resetTarget, setResetTarget] = useState<{ memberId: string; name: string } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const { data, isLoading, refetch } = useAttendanceLogs({
    branchId: currentBranch?.id,
    dateFrom,
    dateTo,
    userType: "member",
    page,
    limit: 50,
  });

  const logs = data?.data || [];
  const total = data?.total || 0;

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return "—";
    return new Date(isoStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "checked_in": return <Badge className="bg-green-500/10 text-green-600 border-green-200">Checked In</Badge>;
      case "checked_out": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Checked Out</Badge>;
      case "expired": return <Badge className="bg-orange-500/10 text-orange-600 border-orange-200">Expired</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getSubStatusBadge = (status: string | null) => {
    if (!status) return "—";
    switch (status) {
      case "active": return <Badge className="bg-green-500/10 text-green-600 border-green-200">Active</Badge>;
      case "expired": return <Badge className="bg-red-500/10 text-red-600 border-red-200">Expired</Badge>;
      case "expiring_soon": return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-200">Expiring</Badge>;
      case "no_subscription": return <Badge className="bg-gray-500/10 text-gray-600 border-gray-200">None</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleResetDevice = async () => {
    if (!resetTarget || !currentBranch?.id) return;
    setIsResetting(true);
    try {
      await resetAttendanceDevice({ memberId: resetTarget.memberId, branchId: currentBranch.id });
      toast({ title: "Device reset", description: `Device registration cleared for ${resetTarget.name}.` });
      refetch();
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setIsResetting(false);
      setResetTarget(null);
    }
  };

  // Deduplicate members for device reset (show reset only once per member)
  const seenMembers = new Set<string>();

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg">Members Attendance</CardTitle>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-40" />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No attendance records found for this period.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => {
                    const memberId = log.member_id;
                    const showReset = memberId && !seenMembers.has(memberId);
                    if (memberId) seenMembers.add(memberId);

                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(log.date)}</TableCell>
                        <TableCell className="font-medium">{log.members?.name || "—"}</TableCell>
                        <TableCell>{log.members?.phone || "—"}</TableCell>
                        <TableCell className="text-xs">{log.members?.email || "—"}</TableCell>
                        <TableCell>{formatTime(log.check_in_at)}</TableCell>
                        <TableCell>{formatTime(log.check_out_at)}</TableCell>
                        <TableCell>{log.total_hours ? `${log.total_hours}h` : "—"}</TableCell>
                        <TableCell>{getSubStatusBadge(log.subscription_status)}</TableCell>
                        <TableCell className="text-xs font-mono" title={log.device_fingerprint || ""}>
                          {log.device_fingerprint ? log.device_fingerprint.substring(0, 8) + "…" : "—"}
                        </TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                        <TableCell>
                          {showReset && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={() => setResetTarget({ memberId, name: log.members?.name || "Member" })}
                            >
                              <DevicePhoneMobileIcon className="w-3.5 h-3.5" />
                              Reset
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Showing {logs.length} of {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={logs.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title="Reset Device Registration"
        description={`This will clear the registered device for ${resetTarget?.name}. They will need to re-register on their next check-in.`}
        confirmText={isResetting ? "Resetting..." : "Reset Device"}
        variant="destructive"
        onConfirm={handleResetDevice}
      />
    </Card>
  );
};