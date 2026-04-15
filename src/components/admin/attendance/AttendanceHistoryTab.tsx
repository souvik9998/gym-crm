import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { AttendanceDatePicker } from "./AttendanceDatePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  MagnifyingGlassIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

export const AttendanceHistoryTab = () => {
  const { currentBranch } = useBranch();
  const isMobile = useIsMobile();
  const branchId = currentBranch?.id;

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: records = [], isLoading, refetch } = useQuery({
    queryKey: ["attendance-history", branchId, dateFrom, dateTo],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("id, member_id, date, status, time_slot_id, marked_by_type, created_at, members(name, phone)")
        .eq("branch_id", branchId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  const filteredRecords = useMemo(() => {
    let list = records;
    if (statusFilter !== "all") {
      list = list.filter((r: any) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) =>
        r.members?.name?.toLowerCase().includes(q) || r.members?.phone?.includes(q)
      );
    }
    return list;
  }, [records, statusFilter, search]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredRecords.forEach((r: any) => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredRecords]);

  const formatDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "present": return <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px]">Present</Badge>;
      case "late": return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-[10px]">Late</Badge>;
      case "absent": return <Badge className="bg-red-500/10 text-red-500 border-red-200 text-[10px]">Absent</Badge>;
      default: return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
    }
  };

  // Stats summary
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const present = filteredRecords.filter((r: any) => r.status === "present").length;
    const late = filteredRecords.filter((r: any) => r.status === "late").length;
    const absent = filteredRecords.filter((r: any) => r.status === "absent").length;
    return { total, present, late, absent };
  }, [filteredRecords]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-wrap">
        <AttendanceDatePicker label="From" value={dateFrom} onChange={setDateFrom} className="min-w-[140px] max-w-[180px]" />
        <AttendanceDatePicker label="To" value={dateTo} onChange={setDateTo} className="min-w-[140px] max-w-[180px]" />
        <div className="flex gap-1.5">
          {["all", "present", "late", "absent"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border/50 text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm rounded-xl" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1 h-9 text-xs">
          <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>{stats.total} records</span>
        <span className="text-green-600">{stats.present} present</span>
        <span className="text-amber-600">{stats.late} late</span>
        <span className="text-red-500">{stats.absent} absent</span>
      </div>

      {/* Records grouped by date */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">Loading history...</div>
      ) : groupedByDate.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <CalendarDaysIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No attendance records found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDate.map(([date, dayRecords]) => (
            <Card key={date} className="border border-border/40 shadow-sm overflow-hidden">
              <CardHeader className="px-3 lg:px-4 py-2 lg:py-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs lg:text-sm font-semibold">{formatDate(date)}</CardTitle>
                  <div className="flex gap-2 text-[10px]">
                    <span className="text-green-600">{dayRecords.filter((r: any) => r.status === "present").length}P</span>
                    <span className="text-amber-600">{dayRecords.filter((r: any) => r.status === "late").length}L</span>
                    <span className="text-red-500">{dayRecords.filter((r: any) => r.status === "absent").length}A</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isMobile ? (
                  <div className="divide-y divide-border/30">
                    {dayRecords.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{r.members?.name || "—"}</p>
                          <p className="text-[10px] text-muted-foreground">{r.members?.phone || "—"}</p>
                        </div>
                        {getStatusBadge(r.status)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Phone</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dayRecords.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs font-medium">{r.members?.name || "—"}</TableCell>
                          <TableCell className="text-xs">{r.members?.phone || "—"}</TableCell>
                          <TableCell>{getStatusBadge(r.status)}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground capitalize">{r.time_slot_id ? "Slot" : "Simple"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
