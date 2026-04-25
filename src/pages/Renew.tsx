import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { BranchLogo } from "@/components/admin/BranchLogo";
import { toast } from "@/components/ui/sonner";
import { useRazorpay } from "@/hooks/useRazorpay";
import { supabase } from "@/integrations/supabase/client";
import { PaymentProcessingOverlay } from "@/components/ui/payment-processing-overlay";
import PackageSelectionForm, { type PackageSelectionData } from "@/components/registration/PackageSelectionForm";
import { fetchPublicBranch } from "@/api/publicData";
import { getWhatsAppAutoSendPreference } from "@/utils/whatsappAutoSend";
import PoweredByBadge from "@/components/PoweredByBadge";
import RegistrationPageSkeleton from "@/components/registration/RegistrationPageSkeleton";

interface Member {
  id: string;
  name: string;
  phone: string;
  join_date: string;
  branch_id: string | null;
}

function parseDateOnly(dateStr?: string | null): Date | null {
  if (!dateStr) return null;

  const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    let yearNum = parseInt(y, 10);
    if (yearNum < 100) yearNum += 2000;

    const dayNum = parseInt(d, 10);
    const monthNum = parseInt(m, 10);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;

    const result = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
    if (result.getUTCDate() !== dayNum || result.getUTCMonth() !== monthNum - 1) return null;
    return result;
  }

  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const result = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    if (result.getUTCDate() !== +iso[3] || result.getUTCMonth() !== +iso[2] - 1) return null;
    return result;
  }

  return null;
}

function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const Renew = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { initiatePayment, isLoading: isPaymentLoading, paymentStage } = useRazorpay();
  const { member, branchId: stateBranchId, branchName: stateBranchName, branchSlug: stateBranchSlug } = (location.state as { member: Member; branchId?: string; branchName?: string; branchSlug?: string }) || {};
  const [ptStartDate, setPtStartDate] = useState<string | null>(null);
  const [existingMembershipEndDate, setExistingMembershipEndDate] = useState<string | null>(null);
  const [existingPTEndDate, setExistingPTEndDate] = useState<string | null>(null);
  const [branchInfo, setBranchInfo] = useState<{ id: string; name: string } | null>(null);
  const [allowSelfSelectTrainer, setAllowSelfSelectTrainer] = useState(true);
  const [allowDailyPass, setAllowDailyPass] = useState(true);

  const branchId = stateBranchId || member?.branch_id;

  useEffect(() => {
    if (!member) {
      navigate("/admin/login", { replace: true });
      return;
    }

    let cancelled = false;

    (async () => {
      if (branchId) {
        const branch = await fetchPublicBranch(branchId);
        if (cancelled) return;

        if (branch) {
          setBranchInfo({ id: branch.id, name: stateBranchName || branch.name });
          setAllowSelfSelectTrainer(branch.allowSelfSelectTrainer !== false);
          setAllowDailyPass(branch.allowDailyPass !== false);
        } else if (stateBranchName) {
          setBranchInfo({ id: branchId, name: stateBranchName });
        }
      }

      const fetchMemberData = async () => {
        const today = toIsoDate(new Date());
        
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
          const existingEndDate = parseDateOnly(activePT.end_date);
          if (existingEndDate) {
            existingEndDate.setUTCDate(existingEndDate.getUTCDate() + 1);
            setPtStartDate(toIsoDate(existingEndDate));
          }
        } else {
          setPtStartDate(today);
        }
      };

      await fetchMemberData();
    })();

    return () => {
      cancelled = true;
    };
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
        const endDate = parseDateOnly(data.endDate) ?? new Date(data.endDate);

        // Record coupon usage if applied (mirrors Register.tsx logic)
        if (packageData.couponId) {
          try {
            await supabase.from("coupon_usage").insert({
              coupon_id: packageData.couponId,
              member_id: member.id,
              discount_applied: packageData.couponDiscount || 0,
              branch_id: branchId,
            });
            const { data: couponData } = await supabase
              .from("coupons")
              .select("usage_count")
              .eq("id", packageData.couponId)
              .single();
            if (couponData) {
              await supabase
                .from("coupons")
                .update({ usage_count: (couponData.usage_count || 0) + 1 })
                .eq("id", packageData.couponId);
            }
          } catch (err) {
            console.error("Failed to record coupon usage:", err);
          }
        }

        // Send WhatsApp notification for renewal (if auto-send enabled)
        try {
          const shouldAutoSend = await getWhatsAppAutoSendPreference(branchId, "renewal");
          if (shouldAutoSend) {
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
          }
          
          // Send payment receipt if enabled
          const shouldSendReceipt = await getWhatsAppAutoSendPreference(branchId, "payment_details");
          if (shouldSendReceipt) {
            await supabase.functions.invoke("send-whatsapp", {
              body: {
                phone: member.phone,
                name: member.name,
                endDate: data.endDate,
                type: "payment_details",
                memberIds: [member.id],
                isManual: false,
                branchId: branchId,
                branchName: branchInfo?.name,
              },
            });
          }
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
                timeZone: "UTC",
            }),
            isNewMember: false,
            hasTrainer: packageData.wantsTrainer,
            trainerName: packageData.selectedTrainer?.name,
            branchName: branchInfo?.name,
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

  // Show skeleton until branch + subscription data resolves
  if (branchId && !branchInfo) {
    return <RegistrationPageSkeleton variant="package" />;
  }

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
            onClick={() => navigate(stateBranchSlug ? `/b/${stateBranchSlug}` : branchId ? `/b/${branchId}` : "/admin/login", { state: { returnToOptions: true, phone: member?.phone } })}
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
          memberId={member.id}
          onSubmit={handlePackageSubmit}
          onBack={() => navigate(stateBranchSlug ? `/b/${stateBranchSlug}` : branchId ? `/b/${branchId}` : "/admin/login", { state: { returnToOptions: true, phone: member.phone } })}
          isLoading={isPaymentLoading}
          ptStartDate={existingPTEndDate && ptStartDate ? ptStartDate : undefined}
          existingMembershipEndDate={existingMembershipEndDate || undefined}
          existingPTEndDate={existingPTEndDate || undefined}
          branchId={branchId || undefined}
          allowSelfSelectTrainer={allowSelfSelectTrainer}
          allowDailyPass={allowDailyPass}
        />
      </main>
      <PoweredByBadge />
    </div>
  );
};

export default Renew;
