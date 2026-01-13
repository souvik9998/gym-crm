import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, CreditCard, CheckCircle2 } from "lucide-react";

interface PaymentProcessingOverlayProps {
  isVisible: boolean;
  stage?: "verifying" | "processing" | "success";
}

export const PaymentProcessingOverlay = ({
  isVisible,
  stage = "verifying",
}: PaymentProcessingOverlayProps) => {
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  const stageConfig = {
    verifying: {
      icon: ShieldCheck,
      title: "Verifying Payment",
      subtitle: "Please wait while we verify your transaction",
      color: "text-blue-500",
      bgGlow: "from-blue-500/20",
    },
    processing: {
      icon: CreditCard,
      title: "Processing",
      subtitle: "Setting up your membership",
      color: "text-amber-500",
      bgGlow: "from-amber-500/20",
    },
    success: {
      icon: CheckCircle2,
      title: "Payment Successful",
      subtitle: "Redirecting you shortly",
      color: "text-green-500",
      bgGlow: "from-green-500/20",
    },
  };

  const config = stageConfig[stage];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-md">
        {/* Animated glow background */}
        <div
          className={`absolute -inset-20 bg-gradient-radial ${config.bgGlow} to-transparent opacity-60 animate-pulse`}
        />

        {/* Icon container with animation */}
        <div className="relative mb-8">
          {/* Outer rotating ring */}
          <div className="absolute inset-0 w-28 h-28 -m-2">
            <svg className="w-full h-full animate-spin" style={{ animationDuration: "3s" }}>
              <circle
                cx="56"
                cy="56"
                r="52"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="80 200"
                className={config.color}
                opacity="0.3"
              />
            </svg>
          </div>

          {/* Inner pulsing circle */}
          <div
            className={`w-24 h-24 rounded-full bg-gradient-to-br from-card to-muted flex items-center justify-center shadow-2xl border border-border`}
          >
            {stage === "success" ? (
              <Icon className={`w-12 h-12 ${config.color} animate-scale-in`} />
            ) : (
              <div className="relative">
                <Icon className={`w-12 h-12 ${config.color}`} />
                <Loader2
                  className={`absolute -bottom-1 -right-1 w-5 h-5 ${config.color} animate-spin`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Text content */}
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {config.title}
          {stage !== "success" && <span className="inline-block w-8 text-left">{dots}</span>}
        </h2>

        <p className="text-muted-foreground mb-6">{config.subtitle}</p>

        {/* Warning message */}
        {stage !== "success" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              Please do not close or refresh this page
            </p>
          </div>
        )}

        {/* Progress steps */}
        <div className="mt-8 flex items-center gap-3">
          <Step
            number={1}
            label="Payment"
            isActive={stage === "verifying"}
            isComplete={stage === "processing" || stage === "success"}
          />
          <div className="w-8 h-0.5 bg-border" />
          <Step
            number={2}
            label="Verification"
            isActive={stage === "processing"}
            isComplete={stage === "success"}
          />
          <div className="w-8 h-0.5 bg-border" />
          <Step number={3} label="Complete" isActive={stage === "success"} isComplete={false} />
        </div>
      </div>
    </div>
  );
};

const Step = ({
  number,
  label,
  isActive,
  isComplete,
}: {
  number: number;
  label: string;
  isActive: boolean;
  isComplete: boolean;
}) => {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300
          ${
            isComplete
              ? "bg-green-500 text-white"
              : isActive
              ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
              : "bg-muted text-muted-foreground"
          }`}
      >
        {isComplete ? <CheckCircle2 className="w-4 h-4" /> : number}
      </div>
      <span
        className={`text-xs ${
          isActive || isComplete ? "text-foreground font-medium" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
};
