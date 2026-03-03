import { useQuery } from "@tanstack/react-query";
import { protectedFetch } from "@/api/authenticatedFetch";
import { useBranch } from "@/contexts/BranchContext";
import { Staff } from "@/pages/admin/StaffManagement";

interface StaffPageDataResponse {
  staff: Staff[];
  totalPaidToStaff: number;
}

export function useStaffPageData() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id;

  const { data, isLoading, refetch } = useQuery<StaffPageDataResponse>({
    queryKey: ["staff-page-data", branchId],
    queryFn: () =>
      protectedFetch<StaffPageDataResponse>({
        action: "staff-page-data",
        params: { branchId },
      }),
    staleTime: 30_000,
  });

  const staff = data?.staff || [];
  const trainers = staff.filter((s) => s.role === "trainer");
  const otherStaff = staff.filter((s) => s.role !== "trainer");
  const totalPaidToStaff = data?.totalPaidToStaff || 0;

  return {
    staff,
    trainers,
    otherStaff,
    totalPaidToStaff,
    isLoading,
    refetch,
  };
}
