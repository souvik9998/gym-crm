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
  onSuccess: (data: {
    memberId: string;
    subscriptionId: string;
    endDate: string;
  }) => void;
  onError?: (error: string) => void;
}

declare global {
  interface Window {
    Razorpay: any;
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
            },
          }
        );

        if (orderError || !orderData) {
          throw new Error(orderError?.message || "Failed to create order");
        }

        console.log("Order created:", orderData);

        // Open Razorpay checkout
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Pro Plus Fitness",
          description: `${months} Month${months > 1 ? "s" : ""} Membership`,
          order_id: orderData.orderId,
          prefill: {
            name: memberName,
            contact: memberPhone,
          },
          theme: {
            color: "#F97316", // accent color
          },
          handler: async function (response: any) {
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
                    isNewMember,
                  },
                }
              );

              if (verifyError || !verifyData?.success) {
                throw new Error(verifyError?.message || "Payment verification failed");
              }

              onSuccess({
                memberId: verifyData.memberId,
                subscriptionId: verifyData.subscriptionId,
                endDate: verifyData.endDate,
              });
            } catch (error: any) {
              console.error("Verification error:", error);
              onError?.(error.message || "Payment verification failed");
              toast({
                title: "Payment Verification Failed",
                description: error.message,
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

        const razorpay = new window.Razorpay(options);
        razorpay.on("payment.failed", function (response: any) {
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
      } catch (error: any) {
        console.error("Payment initiation error:", error);
        onError?.(error.message || "Failed to initiate payment");
        toast({
          title: "Payment Error",
          description: error.message,
          variant: "destructive",
        });
        setIsLoading(false);
      }
    },
    [loadRazorpayScript, toast]
  );

  return { initiatePayment, isLoading };
};
