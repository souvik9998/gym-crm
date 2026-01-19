import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useRazorpay } from "@/hooks/useRazorpay";
import { supabase } from "@/integrations/supabase/client";
import { PaymentProcessingOverlay } from "@/components/ui/payment-processing-overlay";
import PackageSelectionForm, { type PackageSelectionData } from "@/components/registration/PackageSelectionForm";

interface Member {
  id: string;
  name: string;
  phone: string;
  join_date: string;
  branch_id: string | null;
}

const Renew = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { initiatePayment, isLoading: isPaymentLoading, paymentStage } = useRazorpay();
  const { member, branchId: stateBranchId, branchName: stateBranchName } = (location.state as { member: Member; branchId?: string; branchName?: string }) || {};
  const [ptStartDate, setPtStartDate] = useState<string | null>(null);
  const [existingMembershipEndDate, setExistingMembershipEndDate] = useState<string | null>(null);
  const [existingPTEndDate, setExistingPTEndDate] = useState<string | null>(null);
  const [branchInfo, setBranchInfo] = useState<{ id: string; name: string } | null>(null);

  const branchId = stateBranchId || member?.branch_id;

  useEffect(() => {
    if (!member) {
      navigate("/");
      return;
    }

    // Set branch info from state or fetch it
    if (stateBranchName && branchId) {
      setBranchInfo({ id: branchId, name: stateBranchName });
    } else if (branchId) {
      supabase
        .from("branches")
        .select("id, name")
        .eq("id", branchId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setBranchInfo(data);
          }
        });
    }

    const fetchMemberData = async () => {
      const today = new Date().toISOString().split("T")[0];
      
      // Fetch existing active gym subscription to get membership end date
      const { data: activeSubscription } = await supabase
        .from("subscriptions")
        .select("end_date")
        .eq("member_id", member.id)
        .eq("status", "active")
        .gte("end_date", today)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSubscription) {
        setExistingMembershipEndDate(activeSubscription.end_date);
      }

      // Fetch existing active PT subscription to determine PT start date
      const { data: activePT } = await supabase
        .from("pt_subscriptions")
        .select("end_date")
        .eq("member_id", member.id)
        .eq("status", "active")
        .gte("end_date", today)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activePT) {
        setExistingPTEndDate(activePT.end_date);
        // PT start date should be existing end_date + 1
        const existingEndDate = new Date(activePT.end_date);
        existingEndDate.setDate(existingEndDate.getDate() + 1);
        setPtStartDate(existingEndDate.toISOString().split("T")[0]);
      } else {
        // No active PT, start from current date
        setPtStartDate(today);
      }
    };

    fetchMemberData();
  }, [member, navigate, branchId, stateBranchName]);

  const handlePackageSubmit = (packageData: PackageSelectionData) => {
    // Use the custom start date from package selection
    const gymStart = packageData.startDate;

    initiatePayment({
      amount: packageData.totalAmount,
      memberId: member.id,
      memberName: member.name,
      memberPhone: member.phone,
      isNewMember: false,
      months: packageData.isCustomPackage ? 0 : packageData.selectedMonths,
      customDays: packageData.wantsTrainer && packageData.ptDays ? packageData.ptDays : packageData.customPackage?.duration_days,
      trainerId: packageData.selectedTrainer?.id,
      trainerFee: packageData.trainerFee,
      gymFee: packageData.subscriptionAmount + packageData.joiningFee,
      ptStartDate: packageData.ptStartDate,
      gymStartDate: gymStart,
      branchId: branchId || undefined,
      onSuccess: async (data) => {
        const endDate = new Date(data.endDate);
        
        // Send WhatsApp notification for renewal
        try {
          await supabase.functions.invoke("send-whatsapp", {
            body: {
              phone: member.phone,
              name: member.name,
              endDate: data.endDate,
              type: "renewal",
              memberIds: [member.id],
              isManual: false,
              branchId: branchId,
              branchName: branchInfo?.name,
            },
          });
        } catch (err) {
          console.error("Failed to send WhatsApp notification:", err);
        }
        
        navigate("/success", {
          state: {
            memberName: member.name,
            phone: member.phone,
            amount: packageData.totalAmount,
            endDate: endDate.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            isNewMember: false,
            hasTrainer: packageData.wantsTrainer,
            trainerName: packageData.selectedTrainer?.name,
          },
        });
      },
      onError: (error) => {
        toast.error("Renewal Failed", {
          description: error,
        });
      },
    });
  };

  if (!member) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Payment Processing Overlay */}
      <PaymentProcessingOverlay
        isVisible={paymentStage !== "idle"}
        stage={paymentStage === "idle" ? "verifying" : paymentStage}
      />

      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Dumbbell className="w-6 h-6 text-accent" />
          <span className="text-xl font-semibold text-foreground">
            Renew Membership
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="px-4 pb-8">
        <PackageSelectionForm
          isNewMember={false}
          memberName={member.name}
          onSubmit={handlePackageSubmit}
          onBack={() => navigate("/", { state: { returnToOptions: true, phone: member.phone } })}
          isLoading={isPaymentLoading}
          ptStartDate={existingPTEndDate && ptStartDate ? ptStartDate : undefined}
          existingMembershipEndDate={existingMembershipEndDate || undefined}
          existingPTEndDate={existingPTEndDate || undefined}
          branchId={member.branch_id || undefined}
        />
      </main>
    </div>
  );
};

export default Renew;
