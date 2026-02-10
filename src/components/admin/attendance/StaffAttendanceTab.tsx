import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAttendanceLogs } from "@/hooks/queries/useAttendance";
import { useBranch } from "@/contexts/BranchContext";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

export const StaffAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useAttendanceLogs({
    branchId: currentBranch?.id,
    dateFrom,
    dateTo,
    userType: "staff",
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

  const isLate = (checkInAt: string) => {
    const hour = new Date(checkInAt).getHours();
    return hour >= 10;
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg">Staff Attendance</CardTitle>
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
          <div className="text-center py-8 text-muted-foreground">No staff attendance records found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(log.date)}</TableCell>
                      <TableCell className="font-medium">{log.staff?.full_name || "—"}</TableCell>
                      <TableCell className="capitalize">{log.staff?.role || "—"}</TableCell>
                      <TableCell>{formatTime(log.check_in_at)}</TableCell>
                      <TableCell>{formatTime(log.check_out_at)}</TableCell>
                      <TableCell>{log.total_hours ? `${log.total_hours}h` : "—"}</TableCell>
                      <TableCell>
                        {isLate(log.check_in_at) ? (
                          <Badge className="bg-red-500/10 text-red-600 border-red-200">Late</Badge>
                        ) : (
                          <Badge className="bg-green-500/10 text-green-600 border-green-200">On Time</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono" title={log.device_fingerprint || ""}>
                        {log.device_fingerprint ? log.device_fingerprint.substring(0, 8) + "…" : "—"}
                      </TableCell>
                      <TableCell>
                        {log.status === "checked_in" ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-200">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Done</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
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
    </Card>
  );
};