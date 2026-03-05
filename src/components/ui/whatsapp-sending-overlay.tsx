import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Check, X, Send } from "lucide-react";

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
  const [animateContent, setAnimateContent] = useState(false);

  useEffect(() => {
    if (state !== "idle") {
      setVisible(true);
      // Stagger the content animation
      const t = setTimeout(() => setAnimateContent(true), 80);
      return () => clearTimeout(t);
    } else {
      setAnimateContent(false);
    }
  }, [state]);

  // Auto-dismiss success/error after delay
  useEffect(() => {
    if (state === "success" || state === "error") {
      const timer = setTimeout(() => {
        setAnimateContent(false);
        setTimeout(() => {
          setVisible(false);
          setTimeout(() => onDismiss?.(), 150);
        }, 250);
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [state, onDismiss]);

  if (state === "idle" && !visible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center transition-all duration-350",
        visible && state !== "idle"
          ? "opacity-100 backdrop-blur-md bg-black/30"
          : "opacity-0 pointer-events-none backdrop-blur-none bg-black/0"
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (state === "success" || state === "error") {
          setAnimateContent(false);
          setTimeout(() => {
            setVisible(false);
            setTimeout(() => onDismiss?.(), 150);
          }, 250);
        }
      }}
    >
      {/* Card */}
      <div
        className={cn(
          "relative flex flex-col items-center overflow-hidden rounded-3xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.25)] transition-all duration-500 ease-out",
          "px-10 py-9 min-w-[280px] max-w-[340px]",
          animateContent
            ? "scale-100 opacity-100 translate-y-0"
            : "scale-[0.85] opacity-0 translate-y-4"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle top accent line */}
        <div
          className={cn(
            "absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-700 ease-out",
            state === "sending" && "w-16 wa-bg-green",
            state === "success" && "w-24 wa-bg-green",
            state === "error" && "w-24 bg-destructive",
            !animateContent && "w-0"
          )}
        />

        {/* Sending state */}
        {state === "sending" && (
          <div className="flex flex-col items-center gap-5">
            {/* Icon container with orbiting ring */}
            <div className="relative flex items-center justify-center w-[72px] h-[72px]">
              {/* Rotating orbit ring */}
              <div className="absolute inset-0 rounded-full wa-orbit-ring" />
              {/* Soft glow */}
              <div className="absolute inset-2 rounded-full wa-glow animate-pulse" />
              {/* Main icon */}
              <div className="relative z-10 flex items-center justify-center w-14 h-14 rounded-2xl wa-bg-green text-white shadow-lg wa-shadow-green">
                <Send className="w-6 h-6 wa-float" style={{ transform: "rotate(-25deg)" }} />
              </div>
            </div>

            <div className="text-center space-y-1.5">
              <p className="text-[15px] font-semibold text-foreground tracking-tight">
                Sending Message
              </p>
              {recipientName && (
                <p className="text-sm text-muted-foreground font-medium wa-fade-in-up" style={{ animationDelay: "0.15s" }}>
                  to {recipientName}
                </p>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-[140px] h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full wa-bg-green wa-progress-bar" />
            </div>
          </div>
        )}

        {/* Success state */}
        {state === "success" && (
          <div className="flex flex-col items-center gap-5">
            <div className="relative flex items-center justify-center w-[72px] h-[72px]">
              {/* Celebration ripple */}
              <div className="absolute inset-0 rounded-full wa-success-ripple" />
              <div className="absolute inset-0 rounded-full wa-success-ripple" style={{ animationDelay: "0.15s" }} />
              {/* Icon */}
              <div className="relative z-10 flex items-center justify-center w-14 h-14 rounded-2xl wa-bg-green text-white shadow-lg wa-shadow-green wa-pop-in">
                <Check className="w-7 h-7" strokeWidth={3} />
              </div>
            </div>

            <div className="text-center space-y-1.5">
              <p className="text-[15px] font-semibold text-foreground tracking-tight wa-fade-in-up">
                Delivered Successfully
              </p>
              {recipientName && (
                <p className="text-sm text-muted-foreground font-medium wa-fade-in-up" style={{ animationDelay: "0.1s" }}>
                  Sent to {recipientName}
                </p>
              )}
            </div>

            {/* Subtle checkmark bar */}
            <div className="flex items-center gap-1.5 wa-fade-in-up" style={{ animationDelay: "0.2s" }}>
              <div className="w-8 h-0.5 rounded-full wa-bg-green/40" />
              <div className="w-1.5 h-1.5 rounded-full wa-bg-green" />
              <div className="w-8 h-0.5 rounded-full wa-bg-green/40" />
            </div>
          </div>
        )}

        {/* Error state */}
        {state === "error" && (
          <div className="flex flex-col items-center gap-5">
            <div className="relative flex items-center justify-center w-[72px] h-[72px]">
              <div className="absolute inset-0 rounded-full wa-error-shake" />
              <div className="relative z-10 flex items-center justify-center w-14 h-14 rounded-2xl bg-destructive text-white shadow-lg wa-pop-in"
                style={{ boxShadow: "0 8px 24px -4px hsl(var(--destructive) / 0.35)" }}>
                <X className="w-7 h-7" strokeWidth={3} />
              </div>
            </div>

            <div className="text-center space-y-1.5">
              <p className="text-[15px] font-semibold text-foreground tracking-tight wa-fade-in-up">
                Delivery Failed
              </p>
              <p className="text-sm text-muted-foreground font-medium wa-fade-in-up max-w-[220px]" style={{ animationDelay: "0.1s" }}>
                {errorMessage || "Something went wrong. Please try again."}
              </p>
            </div>

            <div className="flex items-center gap-1.5 wa-fade-in-up" style={{ animationDelay: "0.2s" }}>
              <div className="w-8 h-0.5 rounded-full bg-destructive/30" />
              <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
              <div className="w-8 h-0.5 rounded-full bg-destructive/30" />
            </div>
          </div>
        )}
      </div>

      <style>{`
        .wa-bg-green { background: #25D366; }
        .wa-bg-green\\/40 { background: rgba(37, 211, 102, 0.4); }
        .wa-shadow-green { box-shadow: 0 8px 24px -4px rgba(37, 211, 102, 0.35); }
        .wa-glow { background: radial-gradient(circle, rgba(37, 211, 102, 0.15) 0%, transparent 70%); }

        .wa-orbit-ring {
          border: 2px dashed rgba(37, 211, 102, 0.25);
          animation: wa-spin 4s linear infinite;
        }

        @keyframes wa-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .wa-float {
          animation: wa-float 2s ease-in-out infinite;
        }
        @keyframes wa-float {
          0%, 100% { transform: rotate(-25deg) translateY(0px); }
          50% { transform: rotate(-25deg) translateY(-3px); }
        }

        .wa-progress-bar {
          animation: wa-progress 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes wa-progress {
          0% { width: 5%; opacity: 0.7; }
          50% { width: 80%; opacity: 1; }
          80% { width: 95%; opacity: 0.8; }
          100% { width: 5%; opacity: 0.7; }
        }

        .wa-pop-in {
          animation: wa-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes wa-pop {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        .wa-success-ripple {
          border: 2px solid rgba(37, 211, 102, 0.3);
          animation: wa-ripple 1s ease-out forwards;
        }
        @keyframes wa-ripple {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }

        .wa-error-shake {
          border: 2px solid hsl(var(--destructive) / 0.2);
          border-radius: 9999px;
          animation: wa-shake 0.5s ease-out;
        }
        @keyframes wa-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }

        .wa-fade-in-up {
          animation: wa-fade-up 0.4s ease-out both;
        }
        @keyframes wa-fade-up {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
