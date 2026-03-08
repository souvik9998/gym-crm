import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAttendanceLogs } from "@/hooks/queries/useAttendance";
import { useBranch } from "@/contexts/BranchContext";
import { ArrowPathIcon, DevicePhoneMobileIcon, ClockIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { resetAttendanceDevice } from "@/api/attendance";
import { AttendanceDatePicker } from "./AttendanceDatePicker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

export const MembersAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
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
      case "checked_in": return <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px] lg:text-xs">Checked In</Badge>;
      case "checked_out": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 text-[10px] lg:text-xs">Checked Out</Badge>;
      case "expired": return <Badge className="bg-orange-500/10 text-orange-600 border-orange-200 text-[10px] lg:text-xs">Expired</Badge>;
      default: return <Badge variant="secondary" className="text-[10px] lg:text-xs">{status}</Badge>;
    }
  };

  const getSubStatusBadge = (status: string | null) => {
    if (!status) return "—";
    switch (status) {
      case "active": return <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px] lg:text-xs">Active</Badge>;
      case "expired": return <Badge className="bg-red-500/10 text-red-600 border-red-200 text-[10px] lg:text-xs">Expired</Badge>;
      case "expiring_soon": return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-200 text-[10px] lg:text-xs">Expiring</Badge>;
      case "no_subscription": return <Badge className="bg-muted text-muted-foreground text-[10px] lg:text-xs">None</Badge>;
      default: return <Badge variant="secondary" className="text-[10px] lg:text-xs">{status}</Badge>;
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

  const seenMembers = new Set<string>();

  // Mobile card view for each log
  const MobileLogCard = ({ log }: { log: any }) => {
    const memberId = log.member_id;
    const showReset = memberId && !seenMembers.has(memberId);
    if (memberId) seenMembers.add(memberId);

    return (
      <div className="bg-card border border-border/50 rounded-xl p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{log.members?.name || "—"}</p>
            <p className="text-[11px] text-muted-foreground">{log.members?.phone || "—"}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {getStatusBadge(log.status)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <span className="text-muted-foreground block">Date</span>
            <span className="font-medium">{formatDate(log.date)}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">In</span>
            <span className="font-medium">{formatTime(log.check_in_at)}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Out</span>
            <span className="font-medium">{formatTime(log.check_out_at)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <div className="flex items-center gap-3 text-[11px]">
            {log.total_hours && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <ClockIcon className="w-3 h-3" /> {log.total_hours}h
              </span>
            )}
            {getSubStatusBadge(log.subscription_status)}
          </div>
          {showReset && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-[10px] h-7 px-2"
              onClick={() => setResetTarget({ memberId, name: log.members?.name || "Member" })}
            >
              <DevicePhoneMobileIcon className="w-3 h-3" /> Reset
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3 lg:pb-4 px-3 lg:px-6 pt-3 lg:pt-6">
        <CardTitle className="text-base lg:text-lg">Members Attendance</CardTitle>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1 h-8 text-xs lg:text-sm">
          <ArrowPathIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 lg:space-y-4 px-3 lg:px-6 pb-3 lg:pb-6">
        <div className="flex gap-2 lg:gap-3 flex-wrap">
          <AttendanceDatePicker label="From" value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} className="min-w-[140px] max-w-[180px]" />
          <AttendanceDatePicker label="To" value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} className="min-w-[140px] max-w-[180px]" />
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10 lg:py-12 space-y-2">
            <CalendarDaysIcon className="w-10 h-10 lg:w-12 lg:h-12 mx-auto text-muted-foreground/30" />
            <p className="text-xs lg:text-sm text-muted-foreground">No attendance records found for this period.</p>
          </div>
        ) : (
          <>
            {/* Mobile card layout */}
            {isMobile ? (
              <div className="space-y-2">
                {logs.map((log: any) => (
                  <MobileLogCard key={log.id} log={log} />
                ))}
              </div>
            ) : (
              /* Desktop table */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Phone</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Email</TableHead>
                      <TableHead className="text-xs">Check In</TableHead>
                      <TableHead className="text-xs">Check Out</TableHead>
                      <TableHead className="text-xs">Hours</TableHead>
                      <TableHead className="text-xs">Subscription</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Device</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log: any) => {
                      const memberId = log.member_id;
                      const showReset = memberId && !seenMembers.has(memberId);
                      if (memberId) seenMembers.add(memberId);

                      return (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-xs">{formatDate(log.date)}</TableCell>
                          <TableCell className="font-medium text-xs">{log.members?.name || "—"}</TableCell>
                          <TableCell className="text-xs">{log.members?.phone || "—"}</TableCell>
                          <TableCell className="text-[11px] hidden xl:table-cell">{log.members?.email || "—"}</TableCell>
                          <TableCell className="text-xs">{formatTime(log.check_in_at)}</TableCell>
                          <TableCell className="text-xs">{formatTime(log.check_out_at)}</TableCell>
                          <TableCell className="text-xs">{log.total_hours ? `${log.total_hours}h` : "—"}</TableCell>
                          <TableCell>{getSubStatusBadge(log.subscription_status)}</TableCell>
                          <TableCell className="text-[11px] font-mono hidden lg:table-cell" title={log.device_fingerprint || ""}>
                            {log.device_fingerprint ? log.device_fingerprint.substring(0, 8) + "…" : "—"}
                          </TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell>
                            {showReset && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-[11px] h-7"
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
            )}
            <div className="flex items-center justify-between text-[11px] lg:text-sm text-muted-foreground pt-1">
              <span>Showing {logs.length} of {total}</span>
              <div className="flex gap-1.5 lg:gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 lg:h-8 text-[11px] lg:text-xs px-2 lg:px-3">Previous</Button>
                <Button variant="outline" size="sm" disabled={logs.length < 50} onClick={() => setPage(p => p + 1)} className="h-7 lg:h-8 text-[11px] lg:text-xs px-2 lg:px-3">Next</Button>
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
