import { useQuery } from "@tanstack/react-query";
import { fetchAttendanceLogs, fetchAttendanceInsights } from "@/api/attendance";
import type { AttendanceLogsResponse, AttendanceInsights } from "@/api/attendance";

export function useAttendanceLogs(params: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  userType?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}) {
  return useQuery<AttendanceLogsResponse>({
    queryKey: ["attendance-logs", params.branchId, params.dateFrom, params.dateTo, params.userType, params.page],
    queryFn: () => fetchAttendanceLogs(params),
    enabled: params.enabled !== false,
    staleTime: 30 * 1000,
  });
}

export function useAttendanceInsights(params: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  enabled?: boolean;
}) {
  return useQuery<AttendanceInsights>({
    queryKey: ["attendance-insights", params.branchId, params.dateFrom, params.dateTo],
    queryFn: () => fetchAttendanceInsights(params),
    enabled: params.enabled !== false,
    staleTime: 60 * 1000,
  });
}
