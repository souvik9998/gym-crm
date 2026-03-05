import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, MessageCircle } from "lucide-react";

export type WhatsAppOverlayState = "idle" | "sending" | "success" | "error";

interface WhatsAppSendingOverlayProps {
  state: WhatsAppOverlayState;
  recipientName?: string;
  errorMessage?: string;
  onDismiss?: () => void;
}

export const WhatsAppSendingOverlay = ({
  state,
  recipientName,
  errorMessage,
  onDismiss,
}: WhatsAppSendingOverlayProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state !== "idle") {
      setVisible(true);
    }
  }, [state]);

  // Auto-dismiss success/error after delay
  useEffect(() => {
    if (state === "success" || state === "error") {
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => onDismiss?.(), 300);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state, onDismiss]);

  if (state === "idle" && !visible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300",
        visible && state !== "idle" ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (state === "success" || state === "error") {
          setVisible(false);
          setTimeout(() => onDismiss?.(), 300);
        }
      }}
    >
      <div
        className={cn(
          "relative flex flex-col items-center gap-4 rounded-2xl bg-card border border-border shadow-2xl px-8 py-8 min-w-[260px] max-w-[320px] transition-all duration-500",
          visible ? "scale-100 opacity-100" : "scale-90 opacity-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sending state */}
        {state === "sending" && (
          <>
            <div className="relative flex items-center justify-center w-16 h-16">
              {/* Pulsing ring */}
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
              <div className="absolute inset-1 rounded-full bg-emerald-500/10 animate-pulse" />
              <div className="relative z-10 flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500 text-white shadow-lg">
                <MessageCircle className="w-7 h-7 animate-bounce" style={{ animationDuration: "1.2s" }} />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">Sending WhatsApp</p>
              {recipientName && (
                <p className="text-sm text-muted-foreground">to {recipientName}</p>
              )}
            </div>
            {/* Animated dots */}
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-emerald-500"
                  style={{
                    animation: "whatsapp-dot 1.4s ease-in-out infinite",
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* Success state */}
        {state === "success" && (
          <>
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 ring-2 ring-emerald-500/30">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 animate-scale-in" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">Message Sent!</p>
              {recipientName && (
                <p className="text-sm text-muted-foreground">
                  Delivered to {recipientName}
                </p>
              )}
            </div>
          </>
        )}

        {/* Error state */}
        {state === "error" && (
          <>
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 ring-2 ring-destructive/30">
              <XCircle className="w-10 h-10 text-destructive animate-scale-in" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">Failed to Send</p>
              <p className="text-sm text-muted-foreground">
                {errorMessage || "Please try again"}
              </p>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes whatsapp-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1.2); opacity: 1; }
        }
        @keyframes scale-in {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
};
