import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRazorpay } from "@/hooks/useRazorpay";
import MemberDetailsForm, { type MemberDetailsData } from "@/components/registration/MemberDetailsForm";
import PackageSelectionForm, { type PackageSelectionData } from "@/components/registration/PackageSelectionForm";

type Step = "details" | "package";

const Register = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { initiatePayment, isLoading: isPaymentLoading } = useRazorpay();
  const { name, phone } = (location.state as { name: string; phone: string }) || {};
  
  const [step, setStep] = useState<Step>("details");
  const [memberDetails, setMemberDetails] = useState<MemberDetailsData | null>(null);

  useEffect(() => {
    if (!name || !phone) {
      navigate("/");
    }
  }, [name, phone, navigate]);

  const handleDetailsSubmit = (data: MemberDetailsData) => {
    setMemberDetails(data);
    setStep("package");
  };

  const handlePackageSubmit = async (packageData: PackageSelectionData) => {
    // Prepare payment data
    const paymentData = {
      amount: packageData.totalAmount,
      memberName: name,
      memberPhone: phone,
      isNewMember: true,
      months: packageData.isCustomPackage ? 0 : packageData.selectedMonths,
      customDays: packageData.customPackage?.duration_days,
      trainerId: packageData.selectedTrainer?.id,
      trainerFee: packageData.trainerFee,
      memberDetails: memberDetails,
    };

    initiatePayment({
      ...paymentData,
      onSuccess: (data) => {
        const endDate = new Date(data.endDate);
        navigate("/success", {
          state: {
            memberName: name,
            phone,
            amount: packageData.totalAmount,
            endDate: endDate.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            isNewMember: true,
            hasTrainer: packageData.wantsTrainer,
            trainerName: packageData.selectedTrainer?.name,
          },
        });
      },
      onError: (error) => {
        toast({
          title: "Payment Failed",
          description: error,
          variant: "destructive",
        });
      },
    });
  };

  if (!name || !phone) return null;

  return (
    <div className="min-h-screen bg-background">
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
            memberName={name}
            onSubmit={handleDetailsSubmit}
            onBack={() => navigate("/")}
          />
        )}

        {step === "package" && (
          <PackageSelectionForm
            isNewMember={true}
            memberName={name}
            onSubmit={handlePackageSubmit}
            onBack={() => setStep("details")}
            isLoading={isPaymentLoading}
          />
        )}
      </main>
    </div>
  );
};

export default Register;
