import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { useRazorpay } from "@/hooks/useRazorpay";
import { PaymentProcessingOverlay } from "@/components/ui/payment-processing-overlay";
import MemberDetailsForm, { type MemberDetailsData } from "@/components/registration/MemberDetailsForm";
import PackageSelectionForm, { type PackageSelectionData } from "@/components/registration/PackageSelectionForm";

type Step = "details" | "package";

interface BranchInfo {
  id: string;
  name: string;
}

const Register = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { branchId: urlBranchId } = useParams<{ branchId?: string }>();
  const { initiatePayment, isLoading: isPaymentLoading, paymentStage } = useRazorpay();
  const { phone, branchId: stateBranchId, branchName: stateBranchName } = (location.state as { phone: string; branchId?: string; branchName?: string }) || {};
  const branchId = urlBranchId || stateBranchId;
  
  const [step, setStep] = useState<Step>("details");
  const [memberDetails, setMemberDetails] = useState<MemberDetailsData | null>(null);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);

  // Fetch branch info if branchId is present and branchName is not already in state
  useEffect(() => {
    if (branchId && !stateBranchName) {
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
    } else if (stateBranchName) {
      setBranchInfo({ id: branchId || '', name: stateBranchName });
    }
  }, [branchId, stateBranchName]);

  useEffect(() => {
    if (!phone) {
      // If no phone, redirect to the appropriate landing page
      const redirectPath = branchId ? `/b/${branchId}` : "/";
      navigate(redirectPath);
    }
  }, [phone, navigate, branchId]);

  const handleDetailsSubmit = (data: MemberDetailsData) => {
    setMemberDetails(data);
    setStep("package");
  };

  const handlePackageSubmit = async (packageData: PackageSelectionData) => {
    if (!memberDetails) return;

    const isDailyPass = packageData.isCustomPackage;

    // Prepare payment data
    const paymentData = {
      amount: packageData.totalAmount,
      memberName: memberDetails.fullName,
      memberPhone: phone,
      isNewMember: true,
      months: packageData.isCustomPackage ? 0 : packageData.selectedMonths,
      customDays: packageData.wantsTrainer && packageData.ptDays ? packageData.ptDays : packageData.customPackage?.duration_days,
      trainerId: packageData.selectedTrainer?.id,
      trainerFee: packageData.trainerFee,
      gymFee: packageData.subscriptionAmount + packageData.joiningFee,
      memberDetails: memberDetails,
      isDailyPass,
      gymStartDate: packageData.startDate,
      ptStartDate: packageData.ptStartDate,
      branchId: branchId,
      customPackage: packageData.customPackage ? {
        id: packageData.customPackage.id,
        name: packageData.customPackage.name,
        duration_days: packageData.customPackage.duration_days,
        price: packageData.customPackage.price,
      } : undefined,
    };

    initiatePayment({
      ...paymentData,
      onSuccess: async (data) => {
        const endDate = new Date(data.endDate);
        
        // Send WhatsApp notification for new registration
        try {
          const notificationType = data.isDailyPass ? "daily_pass" : "new_registration";
          await supabase.functions.invoke("send-whatsapp", {
            body: {
              phone: phone,
              name: memberDetails.fullName,
              endDate: data.endDate,
              type: notificationType,
              memberIds: data.memberId ? [data.memberId] : [],
              dailyPassUserId: data.dailyPassUserId,
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
            memberName: memberDetails.fullName,
            phone,
            amount: packageData.totalAmount,
            endDate: endDate.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            isNewMember: true,
            isDailyPass: data.isDailyPass,
            hasTrainer: packageData.wantsTrainer,
            trainerName: packageData.selectedTrainer?.name,
            branchName: branchInfo?.name,
          },
        });
      },
      onError: (error) => {
        toast.error("Payment Failed", {
          description: error,
        });
      },
    });
  };

  if (!phone) return null;

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
            onClick={() => {
              if (step === "package") {
                setStep("details");
              } else {
                navigate("/");
              }
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Dumbbell className="w-6 h-6 text-accent" />
          <span className="text-xl font-semibold text-foreground">
            New Membership
          </span>
        </div>
        {/* Step Indicator */}
        <div className="flex justify-center gap-2 mt-4">
          <div className={`w-3 h-3 rounded-full ${step === "details" ? "bg-accent" : "bg-muted"}`} />
          <div className={`w-3 h-3 rounded-full ${step === "package" ? "bg-accent" : "bg-muted"}`} />
        </div>
      </header>

      {/* Main */}
      <main className="px-4 pb-8">
        {step === "details" && (
          <MemberDetailsForm
            onSubmit={handleDetailsSubmit}
            onBack={() => navigate("/")}
          />
        )}

        {step === "package" && memberDetails && (
          <PackageSelectionForm
            isNewMember={true}
            memberName={memberDetails.fullName}
            onSubmit={handlePackageSubmit}
            onBack={() => setStep("details")}
            isLoading={isPaymentLoading}
            branchId={branchId}
          />
        )}
      </main>
    </div>
  );
};

export default Register;
