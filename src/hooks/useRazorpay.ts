import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

interface RazorpayOptions {
  amount: number;
  memberId?: string;
  memberName: string;
  memberPhone: string;
  isNewMember: boolean;
  months: number;
  customDays?: number;
  trainerId?: string;
  trainerFee?: number;
  gymFee?: number;
  ptStartDate?: string;
  gymStartDate?: string;
  isDailyPass?: boolean;
  branchId?: string;
  customPackage?: {
    id: string;
    name: string;
    duration_days: number;
    price: number;
  };
  memberDetails?: {
    photoIdType: string;
    photoIdNumber: string;
    address: string;
    gender: string;
    dateOfBirth?: string;
  };
  onSuccess: (data: {
    memberId?: string;
    dailyPassUserId?: string;
    subscriptionId: string;
    endDate: string;
    isDailyPass?: boolean;
  }) => void;
  onError?: (error: string) => void;
}

declare global {
  interface Window {
    Razorpay: unknown;
  }
}

export type PaymentStage = "idle" | "verifying" | "processing" | "success";

export const useRazorpay = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [paymentStage, setPaymentStage] = useState<PaymentStage>("idle");
  const isVerifyingRef = useRef(false);

  const loadRazorpayScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const initiatePayment = useCallback(
    async ({
      amount,
      memberId,
      memberName,
      memberPhone,
      isNewMember,
      months,
      customDays,
      trainerId,
      trainerFee,
      gymFee,
      ptStartDate,
      gymStartDate,
      isDailyPass,
      branchId,
      customPackage,
      memberDetails,
      onSuccess,
      onError,
    }: RazorpayOptions) => {
      setIsLoading(true);
      isVerifyingRef.current = false;
      setPaymentStage("idle");
      try {
        // Load Razorpay script
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded) {
          throw new Error("Failed to load payment gateway");
        }

        // Create order
        const { data: orderData, error: orderError } = await supabase.functions.invoke(
          "create-razorpay-order",
          {
            body: {
              amount,
              memberId,
              memberName,
              memberPhone,
              isNewMember,
              months,
              customDays,
              trainerId,
              trainerFee,
              memberDetails,
              isDailyPass,
            },
          }
        );

        if (orderError || !orderData) {
          throw new Error(orderError?.message || "Failed to create order");
        }

        console.log("Order created:", orderData);

        const durationText = customDays 
          ? `${customDays} Day${customDays > 1 ? "s" : ""} Pass`
          : `${months} Month${months > 1 ? "s" : ""} Membership`;

        // Open Razorpay checkout
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Pro Plus Fitness",
          description: durationText,
          order_id: orderData.orderId,
          prefill: {
            name: memberName,
            contact: memberPhone,
          },
          theme: {
            color: "#F97316", // accent color
          },
          handler: async function (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
            // Mark verification in progress so Razorpay's ondismiss doesn't reset our UI
            isVerifyingRef.current = true;

            // Show verification overlay immediately after Razorpay closes
            setPaymentStage("verifying");

            try {
              // Small delay for visual feedback
              await new Promise((resolve) => setTimeout(resolve, 500));
              setPaymentStage("processing");

              // Verify payment
              const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
                "verify-razorpay-payment",
                {
                  body: {
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    memberId,
                    memberName,
                    memberPhone,
                    amount,
                    months,
                    customDays,
                    trainerId,
                    trainerFee,
                    gymFee,
                    ptStartDate,
                    gymStartDate,
                    memberDetails,
                    isNewMember,
                    isDailyPass,
                    branchId,
                    customPackage,
                  },
                }
              );

              if (verifyError || !verifyData?.success) {
                throw new Error(verifyError?.message || "Payment verification failed");
              }

              // Show success state and keep overlay visible during navigation
              setPaymentStage("success");
              setIsLoading(false);
              
              // Brief delay to show success state, then navigate (overlay stays visible)
              await new Promise((resolve) => setTimeout(resolve, 800));

              // Call onSuccess which triggers navigation - overlay will unmount with component
              onSuccess({
                memberId: verifyData.memberId,
                dailyPassUserId: verifyData.dailyPassUserId,
                subscriptionId: verifyData.subscriptionId,
                endDate: verifyData.endDate,
                isDailyPass: verifyData.isDailyPass,
              });
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : "Payment verification failed";
              console.error("Verification error:", error);
              isVerifyingRef.current = false;
              setIsLoading(false);
              setPaymentStage("idle");
              onError?.(errorMessage);
              toast.error("Payment Verification Failed", {
                description: errorMessage,
              });
            }
          },
           modal: {
             ondismiss: function () {
               // Razorpay calls ondismiss even after a successful payment.
               // If we're already verifying, don't hide the overlay.
               if (isVerifyingRef.current) return;
               setIsLoading(false);
               setPaymentStage("idle");
             },
           },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const razorpay = new (window.Razorpay as any)(options);
        razorpay.on("payment.failed", function (response: { error: { description: string } }) {
          console.error("Payment failed:", response.error);
          isVerifyingRef.current = false;
          onError?.(response.error.description || "Payment failed");
          toast.error("Payment Failed", {
            description: response.error.description,
          });
          setIsLoading(false);
          setPaymentStage("idle");
        });

        razorpay.open();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Failed to initiate payment";
        console.error("Payment initiation error:", error);
        onError?.(errorMessage);
        toast.error("Payment Error", {
          description: errorMessage,
        });
        setIsLoading(false);
        setPaymentStage("idle");
      }
    },
    [loadRazorpayScript]
  );

  return { initiatePayment, isLoading, paymentStage };
};
