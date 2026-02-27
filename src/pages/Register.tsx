import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useRazorpay } from "@/hooks/useRazorpay";
import { PaymentProcessingOverlay } from "@/components/ui/payment-processing-overlay";
import MemberDetailsForm, { type MemberDetailsData } from "@/components/registration/MemberDetailsForm";
import PackageSelectionForm, { type PackageSelectionData } from "@/components/registration/PackageSelectionForm";
import { fetchPublicBranch } from "@/api/publicData";
import { getWhatsAppAutoSendPreference } from "@/utils/whatsappAutoSend";
import { invokeEdgeFunction } from "@/api/customDomainFetch";

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

  // Fetch branch info using secure public API
  useEffect(() => {
    if (branchId && !stateBranchName) {
      fetchPublicBranch(branchId).then((branch) => {
        if (branch) {
          setBranchInfo(branch);
        }
      });
    } else if (stateBranchName) {
      setBranchInfo({ id: branchId || '', name: stateBranchName });
    }
  }, [branchId, stateBranchName]);

  useEffect(() => {
    if (!phone) {
      const redirectPath = branchId ? `/b/${branchId}` : "/admin/login";
      navigate(redirectPath, { replace: true });
    }
  }, [phone, navigate, branchId]);

  const handleDetailsSubmit = (data: MemberDetailsData) => {
    setMemberDetails(data);
    setStep("package");
  };

  const handlePackageSubmit = async (packageData: PackageSelectionData) => {
    if (!memberDetails) return;

    const isDailyPass = packageData.isCustomPackage;

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
        
        try {
          const notificationType = data.isDailyPass ? "daily_pass" : "new_registration";
          const shouldAutoSend = await getWhatsAppAutoSendPreference(branchId, notificationType as any);
          if (shouldAutoSend) {
            await invokeEdgeFunction("send-whatsapp", {
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
          }
        } catch (err) {
          console.error("Failed to send WhatsApp notification:", err);
        }
        
        // Clear form persistence on success
        sessionStorage.removeItem(`member-details-form-${branchId || "default"}`);
        
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
                const backPath = branchId ? `/b/${branchId}` : "/admin/login";
                navigate(backPath);
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
        {/* Step Indicator with animation */}
        <div className="flex justify-center gap-2 mt-4">
          <div className={`h-2 rounded-full transition-all duration-500 ${step === "details" ? "w-8 bg-accent" : "w-3 bg-muted"}`} />
          <div className={`h-2 rounded-full transition-all duration-500 ${step === "package" ? "w-8 bg-accent" : "w-3 bg-muted"}`} />
        </div>
      </header>

      {/* Main */}
      <main className="px-4 pb-8">
        {step === "details" && (
          <MemberDetailsForm
            onSubmit={handleDetailsSubmit}
            onBack={() => navigate(branchId ? `/b/${branchId}` : "/admin/login")}
            initialData={memberDetails}
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
