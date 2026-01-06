import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRazorpay } from "@/hooks/useRazorpay";
import PackageSelectionForm, { type PackageSelectionData } from "@/components/registration/PackageSelectionForm";

interface Member {
  id: string;
  name: string;
  phone: string;
  join_date: string;
}

const Renew = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { initiatePayment, isLoading: isPaymentLoading } = useRazorpay();
  const member = (location.state as { member: Member })?.member;

  useEffect(() => {
    if (!member) {
      navigate("/");
    }
  }, [member, navigate]);

  const handlePackageSubmit = (packageData: PackageSelectionData) => {
    initiatePayment({
      amount: packageData.totalAmount,
      memberId: member.id,
      memberName: member.name,
      memberPhone: member.phone,
      isNewMember: false,
      months: packageData.isCustomPackage ? 0 : packageData.selectedMonths,
      customDays: packageData.customPackage?.duration_days,
      trainerId: packageData.selectedTrainer?.id,
      trainerFee: packageData.trainerFee,
      onSuccess: (data) => {
        const endDate = new Date(data.endDate);
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
        toast({
          title: "Renewal Failed",
          description: error,
          variant: "destructive",
        });
      },
    });
  };

  if (!member) return null;

  return (
    <div className="min-h-screen bg-background">
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
          onBack={() => navigate("/")}
          isLoading={isPaymentLoading}
        />
      </main>
    </div>
  );
};

export default Renew;
