import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  gymStartDate?: string; // For renewals: the day after existing membership ends
  isDailyPass?: boolean; // Flag for daily pass purchases
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

export const useRazorpay = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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
      customPackage,
      memberDetails,
      onSuccess,
      onError,
    }: RazorpayOptions) => {
      setIsLoading(true);

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
            try {
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
                    customPackage,
                  },
                }
              );

              if (verifyError || !verifyData?.success) {
                throw new Error(verifyError?.message || "Payment verification failed");
              }

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
              onError?.(errorMessage);
              toast({
                title: "Payment Verification Failed",
                description: errorMessage,
                variant: "destructive",
              });
            } finally {
              setIsLoading(false);
            }
          },
          modal: {
            ondismiss: function () {
              setIsLoading(false);
            },
          },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const razorpay = new (window.Razorpay as any)(options);
        razorpay.on("payment.failed", function (response: { error: { description: string } }) {
          console.error("Payment failed:", response.error);
          onError?.(response.error.description || "Payment failed");
          toast({
            title: "Payment Failed",
            description: response.error.description,
            variant: "destructive",
          });
          setIsLoading(false);
        });

        razorpay.open();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Failed to initiate payment";
        console.error("Payment initiation error:", error);
        onError?.(errorMessage);
        toast({
          title: "Payment Error",
          description: errorMessage,
          variant: "destructive",
        });
        setIsLoading(false);
      }
    },
    [loadRazorpayScript, toast]
  );

  return { initiatePayment, isLoading };
};
