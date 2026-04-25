import { useBranch } from "@/contexts/BranchContext";
import { TimeSlotManagement } from "@/components/admin/staff/TimeSlotManagement";
import { useStaffPageData } from "@/hooks/queries/useStaffPageData";

/**
 * Admin-only Time Slots page.
 *
 * Hosts the same TimeSlotManagement experience that previously lived as a
 * sub-tab inside Staff Control. Splitting it into its own sidebar entry keeps
 * Staff Control focused on staff CRUD while giving time-slot administration
 * its own dedicated surface. Staff-facing /staff/time-slots is unaffected.
 */
const AdminTimeSlots = () => {
  const { currentBranch } = useBranch();
  const { staff, trainers } = useStaffPageData();

  return (
    <div className="w-full">
      <TimeSlotManagement
        trainers={trainers}
        currentBranch={currentBranch}
        allStaff={staff}
      />
    </div>
  );
};

export default AdminTimeSlots;
