import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBranchSlug } from "@/hooks/useBranchSlug";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { BranchLogo } from "@/components/admin/BranchLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { useRazorpay } from "@/hooks/useRazorpay";
import { PaymentProcessingOverlay } from "@/components/ui/payment-processing-overlay";
import MemberDetailsForm, { type MemberDetailsData } from "@/components/registration/MemberDetailsForm";
import HealthDetailsForm, { type HealthDetailsData } from "@/components/registration/HealthDetailsForm";
import PackageSelectionForm, { type PackageSelectionData } from "@/components/registration/PackageSelectionForm";
import { fetchPublicBranch } from "@/api/publicData";
import { getWhatsAppAutoSendPreference, type WhatsAppAutoSendType } from "@/utils/whatsappAutoSend";
import PoweredByBadge from "@/components/PoweredByBadge";
import RegistrationPageSkeleton from "@/components/registration/RegistrationPageSkeleton";

type Step = "details" | "health" | "package";

interface BranchInfo {
  id: string;
  name: string;
}

interface FieldSetting {
  enabled: boolean;
  required: boolean;
  locked: boolean;
}

interface RegistrationFieldSettings {
  photo_id?: FieldSetting;
  identity_proof_upload?: FieldSetting;
  health_details?: FieldSetting;
  medical_records_upload?: FieldSetting;
  self_select_trainer?: FieldSetting;
  daily_pass_enabled?: FieldSetting;
  email?: FieldSetting;
  blood_group?: FieldSetting;
  occupation?: FieldSetting;
  emergency_contact_1?: FieldSetting;
  emergency_contact_2?: FieldSetting;
  address?: FieldSetting;
  date_of_birth?: FieldSetting;
}

const Register = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const branchSlug = useBranchSlug();
  const { initiatePayment, isLoading: isPaymentLoading, paymentStage } = useRazorpay();
  const { phone, branchId: stateBranchId, branchName: stateBranchName } = (location.state as { phone: string; branchId?: string; branchName?: string }) || {};
  const branchId = stateBranchId;
  
  const [step, setStep] = useState<Step>("details");
  const [memberDetails, setMemberDetails] = useState<MemberDetailsData | null>(null);
  const [healthDetails, setHealthDetails] = useState<HealthDetailsData | null>(null);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [fieldSettings, setFieldSettings] = useState<RegistrationFieldSettings | null>(null);

  const needsHealthStep = fieldSettings && (
    fieldSettings.identity_proof_upload?.enabled ||
    fieldSettings.health_details?.enabled ||
    fieldSettings.medical_records_upload?.enabled ||
    fieldSettings.blood_group?.enabled ||
    fieldSettings.emergency_contact_1?.enabled ||
    fieldSettings.emergency_contact_2?.enabled
  );

  useEffect(() => {
    if (!branchId) return;

    let cancelled = false;

    (async () => {
      const branch = await fetchPublicBranch(branchId);
      if (cancelled) return;

      if (branch) {
        setBranchInfo({ id: branch.id, name: stateBranchName || branch.name });
        setFieldSettings((branch.registrationFieldSettings || null) as RegistrationFieldSettings | null);
      } else if (stateBranchName) {
        setBranchInfo({ id: branchId, name: stateBranchName });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, stateBranchName]);

  useEffect(() => {
    if (!phone) {
      const redirectPath = branchSlug ? `/b/${branchSlug}` : "/admin/login";
      navigate(redirectPath, { replace: true });
    }
  }, [phone, navigate, branchId]);

  const handleDetailsSubmit = (data: MemberDetailsData) => {
    setMemberDetails(data);
    if (needsHealthStep) {
      setStep("health");
    } else {
      setStep("package");
    }
  };

  const handleHealthSubmit = (data: HealthDetailsData) => {
    setHealthDetails(data);
    setStep("package");
  };

  const saveHealthData = async (memberId: string) => {
    if (!healthDetails) return;

    try {
      // Save health fields to member_details
      if (healthDetails.bloodGroup || healthDetails.heightCm || healthDetails.weightKg ||
          healthDetails.medicalConditions || healthDetails.allergies ||
          healthDetails.emergencyContactName || healthDetails.emergencyContactPhone) {
        await supabase
          .from("member_details")
          .update({
            blood_group: healthDetails.bloodGroup || null,
            height_cm: healthDetails.heightCm || null,
            weight_kg: healthDetails.weightKg || null,
            medical_conditions: healthDetails.medicalConditions || null,
            allergies: healthDetails.allergies || null,
            emergency_contact_name: healthDetails.emergencyContactName || null,
            emergency_contact_phone: healthDetails.emergencyContactPhone || null,
          })
          .eq("member_id", memberId);
      }

      // Save uploaded documents
      const docs = [
        ...(healthDetails.identityProofFiles?.map(f => ({ ...f, type: "identity_proof" })) || []),
        ...(healthDetails.medicalRecordFiles?.map(f => ({ ...f, type: "medical_record" })) || []),
      ];

      if (docs.length > 0) {
        await supabase.from("member_documents").insert(
          docs.map(doc => ({
            member_id: memberId,
            document_type: doc.type,
            file_url: doc.url,
            file_name: doc.name,
            file_size: doc.size,
            uploaded_by: "member_self",
          }))
        );
      }
    } catch (err) {
      console.error("Error saving health data:", err);
    }
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
        
        // Save health data if available
        if (healthDetails && data.memberId) {
          await saveHealthData(data.memberId);
        }

        // Record coupon usage if applied
        if (packageData.couponId && data.memberId) {
          try {
            await supabase.from("coupon_usage").insert({
              coupon_id: packageData.couponId,
              member_id: data.memberId,
              discount_applied: packageData.couponDiscount || 0,
              branch_id: branchId,
            });
            await supabase.from("coupons").update({
              usage_count: supabase.rpc ? undefined : undefined, // increment handled below
            });
            // Simple increment
            const { data: couponData } = await supabase.from("coupons").select("usage_count").eq("id", packageData.couponId).single();
            if (couponData) {
              await supabase.from("coupons").update({ usage_count: couponData.usage_count + 1 }).eq("id", packageData.couponId);
            }
          } catch (err) {
            console.error("Failed to record coupon usage:", err);
          }
        }
        
        try {
          const notificationType: WhatsAppAutoSendType = data.isDailyPass ? "daily_pass" : "new_registration";
          const messagePayload = {
            phone,
            name: memberDetails.fullName,
            endDate: data.endDate,
            memberIds: data.memberId ? [data.memberId] : [],
            dailyPassUserId: data.dailyPassUserId,
            isManual: false,
            branchId,
            branchName: branchInfo?.name,
          };

          const sendNotification = async (type: WhatsAppAutoSendType) => {
            const { data: whatsappResponse, error } = await supabase.functions.invoke("send-whatsapp", {
              body: { ...messagePayload, type },
            });
            if (error || whatsappResponse?.success === false) {
              throw error ?? new Error(whatsappResponse?.error || `Failed to send ${type} WhatsApp message`);
            }
          };

          const shouldSendReceipt = await getWhatsAppAutoSendPreference(branchId, "payment_details");
          if (shouldSendReceipt) {
            try { await sendNotification("payment_details"); } catch (err) {
              console.error("Failed to send payment receipt:", err);
            }
          }

          const shouldAutoSend = await getWhatsAppAutoSendPreference(branchId, notificationType);
          if (shouldAutoSend) {
            try { await sendNotification(notificationType); } catch (err) {
              console.error("Failed to send registration notification:", err);
            }
          }
        } catch (err) {
          console.error("Failed to send WhatsApp notification:", err);
        }
        
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
        toast.error("Payment Failed", { description: error });
      },
    });
  };

  if (!phone) return null;

  // Show full-page skeleton until branch + field settings are ready
  // to prevent field-visibility flicker once settings arrive.
  if (branchId && (!branchInfo || !fieldSettings)) {
    return <RegistrationPageSkeleton variant="form" />;
  }

  const totalSteps = needsHealthStep ? 3 : 2;
  const currentStepIndex = step === "details" ? 0 : step === "health" ? 1 : needsHealthStep ? 2 : 1;

  return (
    <div className="min-h-screen bg-background">
      <PaymentProcessingOverlay
        isVisible={paymentStage !== "idle"}
        stage={paymentStage === "idle" ? "verifying" : paymentStage}
      />

      <header className="px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => {
              if (step === "package") {
                setStep(needsHealthStep ? "health" : "details");
              } else if (step === "health") {
                setStep("details");
              } else {
                navigate(branchSlug ? `/b/${branchSlug}` : "/admin/login");
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
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-500 ${
                i === currentStepIndex ? "w-8 bg-accent" : "w-3 bg-muted"
              }`}
            />
          ))}
        </div>
      </header>

      <main className="px-4 pb-8">
        {step === "details" && (
          <MemberDetailsForm
            onSubmit={handleDetailsSubmit}
            onBack={() => navigate(branchSlug ? `/b/${branchSlug}` : "/admin/login")}
            initialData={memberDetails}
            showPhotoId={fieldSettings?.photo_id?.enabled !== false}
            photoIdRequired={fieldSettings?.photo_id?.required || false}
            showEmail={fieldSettings?.email?.enabled || false}
            emailRequired={fieldSettings?.email?.required || false}
            showOccupation={fieldSettings?.occupation?.enabled || false}
            occupationRequired={fieldSettings?.occupation?.required || false}
            showAddress={fieldSettings?.address?.enabled !== false}
            addressRequired={fieldSettings?.address?.required ?? false}
            showDateOfBirth={fieldSettings?.date_of_birth?.enabled !== false}
            dateOfBirthRequired={fieldSettings?.date_of_birth?.required ?? true}
          />
        )}

        {step === "health" && fieldSettings && (
          <HealthDetailsForm
            onSubmit={handleHealthSubmit}
            onBack={() => setStep("details")}
            initialData={healthDetails}
            showHealthDetails={fieldSettings.health_details?.enabled || false}
            showIdentityUpload={fieldSettings.identity_proof_upload?.enabled || false}
            showMedicalUpload={fieldSettings.medical_records_upload?.enabled || false}
            showBloodGroup={fieldSettings.blood_group?.enabled || false}
            bloodGroupRequired={fieldSettings.blood_group?.required || false}
            showEmergencyContact1={fieldSettings.emergency_contact_1?.enabled || false}
            emergencyContact1Required={fieldSettings.emergency_contact_1?.required || false}
            showEmergencyContact2={fieldSettings.emergency_contact_2?.enabled || false}
            emergencyContact2Required={fieldSettings.emergency_contact_2?.required || false}
            healthRequired={fieldSettings.health_details?.required || false}
            identityRequired={fieldSettings.identity_proof_upload?.required || false}
            medicalRequired={fieldSettings.medical_records_upload?.required || false}
          />
        )}

        {step === "package" && memberDetails && (
          <PackageSelectionForm
            isNewMember={true}
            memberName={memberDetails.fullName}
            onSubmit={handlePackageSubmit}
            onBack={() => setStep(needsHealthStep ? "health" : "details")}
            isLoading={isPaymentLoading}
            branchId={branchId}
            allowSelfSelectTrainer={fieldSettings?.self_select_trainer?.enabled !== false}
            allowDailyPass={fieldSettings?.daily_pass_enabled?.enabled !== false}
          />
        )}
      </main>
      <PoweredByBadge />
    </div>
  );
};

export default Register;
