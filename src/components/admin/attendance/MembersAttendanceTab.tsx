import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAttendanceLogs } from "@/hooks/queries/useAttendance";
import { useBranch } from "@/contexts/BranchContext";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

export const MembersAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [page, setPage] = useState(1);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "checked_in": return <Badge className="bg-green-500/10 text-green-600 border-green-200">Checked In</Badge>;
      case "checked_out": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Checked Out</Badge>;
      case "expired": return <Badge className="bg-orange-500/10 text-orange-600 border-orange-200">Expired</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

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
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.members?.name || "—"}</TableCell>
                      <TableCell>{log.members?.phone || "—"}</TableCell>
                      <TableCell>{formatTime(log.check_in_at)}</TableCell>
                      <TableCell>{formatTime(log.check_out_at)}</TableCell>
                      <TableCell>{log.total_hours ? `${log.total_hours}h` : "—"}</TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
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
