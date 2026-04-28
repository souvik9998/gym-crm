import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAttendanceLogs } from "@/hooks/queries/useAttendance";
import { useBranch } from "@/contexts/BranchContext";
import { ArrowPathIcon, CalendarDaysIcon, ClockIcon } from "@heroicons/react/24/outline";
import { AttendanceDatePicker } from "./AttendanceDatePicker";
import { useIsMobile } from "@/hooks/use-mobile";

export const StaffAttendanceTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
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
    return new Date(isoStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const isLate = (checkInAt: string) => {
    const hour = new Date(checkInAt).getHours();
    return hour >= 10;
  };

  const MobileLogCard = ({ log }: { log: any }) => (
    <div className="bg-card border border-border/50 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{log.staff?.full_name || "—"}</p>
          <p className="text-[11px] text-muted-foreground capitalize">{log.staff?.role || "—"}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isLate(log.check_in_at) ? (
            <Badge className="bg-red-500/10 text-red-600 border-red-200 text-[10px]">Late</Badge>
          ) : (
            <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px]">On Time</Badge>
          )}
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
        <div className="flex items-center gap-2 text-[11px]">
          {log.total_hours && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <ClockIcon className="w-3 h-3" /> {log.total_hours}h
            </span>
          )}
        </div>
        {log.status === "checked_in" ? (
          <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px]">Active</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Done</Badge>
        )}
      </div>
    </div>
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3 lg:pb-4 px-3 lg:px-6 pt-3 lg:pt-6">
        <CardTitle className="text-base lg:text-lg">Staff Attendance</CardTitle>
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
            <p className="text-xs lg:text-sm text-muted-foreground">No staff attendance records found.</p>
          </div>
        ) : (
          <>
            {isMobile ? (
              <div className="space-y-2">
                {logs.map((log: any) => (
                  <MobileLogCard key={log.id} log={log} />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Role</TableHead>
                      <TableHead className="text-xs">Check In</TableHead>
                      <TableHead className="text-xs">Check Out</TableHead>
                      <TableHead className="text-xs">Hours</TableHead>
                      <TableHead className="text-xs">Late</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Device</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(log.date)}</TableCell>
                        <TableCell className="font-medium text-xs">{log.staff?.full_name || "—"}</TableCell>
                        <TableCell className="capitalize text-xs">{log.staff?.role || "—"}</TableCell>
                        <TableCell className="text-xs">{formatTime(log.check_in_at)}</TableCell>
                        <TableCell className="text-xs">{formatTime(log.check_out_at)}</TableCell>
                        <TableCell className="text-xs">{log.total_hours ? `${log.total_hours}h` : "—"}</TableCell>
                        <TableCell>
                          {isLate(log.check_in_at) ? (
                            <Badge className="bg-red-500/10 text-red-600 border-red-200 text-[10px]">Late</Badge>
                          ) : (
                            <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px]">On Time</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono hidden lg:table-cell" title={log.device_fingerprint || ""}>
                          {log.device_fingerprint ? log.device_fingerprint.substring(0, 8) + "…" : "—"}
                        </TableCell>
                        <TableCell>
                          {log.status === "checked_in" ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px]">Active</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Done</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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
    </Card>
  );
};
