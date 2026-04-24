import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <>
      <style>{`
        /* ============ Base ============ */
        [data-sonner-toaster][data-sonner-toaster] {
          --width: 360px;
        }

        [data-sonner-toast] {
          border-radius: 12px !important;
          padding: 12px 14px !important;
          min-height: 52px !important;
          background: hsl(0 0% 100% / 0.72) !important;
          backdrop-filter: saturate(180%) blur(16px) !important;
          -webkit-backdrop-filter: saturate(180%) blur(16px) !important;
          border: 1px solid hsl(220 13% 91% / 0.7) !important;
          box-shadow:
            0 1px 2px rgba(16, 24, 40, 0.04),
            0 6px 16px -6px rgba(16, 24, 40, 0.10) !important;
          color: hsl(222 47% 11%) !important;
          font-weight: 500 !important;
          letter-spacing: -0.01em !important;
          will-change: transform, opacity;
        }

        [data-sonner-toast] [data-title] {
          font-size: 13.5px !important;
          font-weight: 600 !important;
          line-height: 1.35 !important;
          color: hsl(222 47% 11%) !important;
        }
        [data-sonner-toast] [data-description] {
          font-size: 12.5px !important;
          font-weight: 400 !important;
          line-height: 1.4 !important;
          margin-top: 2px !important;
          color: hsl(220 9% 46%) !important;
          opacity: 1 !important;
        }

        /* ============ Icon — animated badge ============ */
        [data-sonner-toast] [data-icon] {
          width: 22px !important;
          height: 22px !important;
          margin-right: 10px !important;
          border-radius: 999px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
          animation: toast-icon-pop 360ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        [data-sonner-toast] [data-icon] svg {
          width: 14px !important;
          height: 14px !important;
          stroke-width: 2.5 !important;
        }

        /* ============ SUCCESS — soft mint ============ */
        [data-sonner-toast][data-type="success"] {
          background: hsl(152 60% 97% / 0.8) !important;
          border-color: hsl(152 50% 70% / 0.35) !important;
          box-shadow:
            0 0 0 1px hsl(152 50% 70% / 0.15),
            0 6px 20px -8px hsl(152 60% 40% / 0.18) !important;
        }
        [data-sonner-toast][data-type="success"] [data-icon] {
          background: hsl(152 70% 42%) !important;
          color: white !important;
        }

        /* ============ ERROR — soft rose ============ */
        [data-sonner-toast][data-type="error"] {
          background: hsl(0 80% 98% / 0.8) !important;
          border-color: hsl(0 70% 75% / 0.35) !important;
          box-shadow:
            0 0 0 1px hsl(0 70% 75% / 0.15),
            0 6px 20px -8px hsl(0 70% 50% / 0.18) !important;
        }
        [data-sonner-toast][data-type="error"] [data-icon] {
          background: hsl(0 72% 55%) !important;
          color: white !important;
        }

        /* ============ INFO — soft sky ============ */
        [data-sonner-toast][data-type="info"] {
          background: hsl(214 100% 98% / 0.8) !important;
          border-color: hsl(214 80% 75% / 0.35) !important;
          box-shadow:
            0 0 0 1px hsl(214 80% 75% / 0.15),
            0 6px 20px -8px hsl(214 80% 50% / 0.18) !important;
        }
        [data-sonner-toast][data-type="info"] [data-icon] {
          background: hsl(214 90% 54%) !important;
          color: white !important;
        }

        /* ============ WARNING — soft amber ============ */
        [data-sonner-toast][data-type="warning"] {
          background: hsl(45 100% 97% / 0.8) !important;
          border-color: hsl(38 80% 70% / 0.35) !important;
          box-shadow:
            0 0 0 1px hsl(38 80% 70% / 0.15),
            0 6px 20px -8px hsl(38 90% 50% / 0.18) !important;
        }
        [data-sonner-toast][data-type="warning"] [data-icon] {
          background: hsl(32 95% 50%) !important;
          color: white !important;
        }

        /* ============ LOADING — soft indigo with shimmer ============ */
        [data-sonner-toast][data-type="loading"] {
          background: linear-gradient(
            110deg,
            hsl(231 100% 98% / 0.92) 0%,
            hsl(231 100% 96% / 0.92) 40%,
            hsl(231 95% 94% / 0.92) 50%,
            hsl(231 100% 96% / 0.92) 60%,
            hsl(231 100% 98% / 0.92) 100%
          ) !important;
          background-size: 220% 100% !important;
          border-color: hsl(231 80% 70% / 0.45) !important;
          box-shadow:
            0 0 0 1px hsl(231 80% 65% / 0.18),
            0 6px 22px -8px hsl(231 80% 50% / 0.30) !important;
          animation: toast-loading-shimmer 1.6s ease-in-out infinite;
        }
        [data-sonner-toast][data-type="loading"] [data-title],
        [data-sonner-toast][data-type="loading"] [data-description] {
          color: hsl(231 60% 24%) !important;
        }
        [data-sonner-toast][data-type="loading"] [data-icon] {
          background: hsl(231 90% 60%) !important;
          color: white !important;
          animation: none;
        }
        [data-sonner-toast][data-type="loading"] [data-icon] svg {
          animation: toast-spinner-rotate 0.9s linear infinite;
          color: white !important;
        }

        .dark [data-sonner-toast][data-type="loading"] {
          background: linear-gradient(
            110deg,
            hsl(231 50% 12% / 0.9) 0%,
            hsl(231 50% 14% / 0.9) 40%,
            hsl(231 60% 18% / 0.9) 50%,
            hsl(231 50% 14% / 0.9) 60%,
            hsl(231 50% 12% / 0.9) 100%
          ) !important;
          background-size: 220% 100% !important;
          border-color: hsl(231 70% 50% / 0.45) !important;
        }
        .dark [data-sonner-toast][data-type="loading"] [data-title],
        .dark [data-sonner-toast][data-type="loading"] [data-description] {
          color: hsl(231 90% 92%) !important;
        }

        /* ============ Dark mode ============ */
        .dark [data-sonner-toast] {
          background: hsl(222 47% 9% / 0.78) !important;
          border-color: hsl(220 13% 22% / 0.7) !important;
          color: hsl(0 0% 98%) !important;
          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.3),
            0 6px 20px -6px rgba(0, 0, 0, 0.4) !important;
        }
        .dark [data-sonner-toast] [data-title] { color: hsl(0 0% 98%) !important; }
        .dark [data-sonner-toast] [data-description] { color: hsl(220 9% 65%) !important; }

        .dark [data-sonner-toast][data-type="success"] {
          background: hsl(152 40% 10% / 0.85) !important;
          border-color: hsl(152 50% 35% / 0.4) !important;
        }
        .dark [data-sonner-toast][data-type="error"] {
          background: hsl(0 40% 12% / 0.85) !important;
          border-color: hsl(0 60% 40% / 0.4) !important;
        }
        .dark [data-sonner-toast][data-type="info"] {
          background: hsl(214 40% 12% / 0.85) !important;
          border-color: hsl(214 60% 40% / 0.4) !important;
        }
        .dark [data-sonner-toast][data-type="warning"] {
          background: hsl(38 40% 12% / 0.85) !important;
          border-color: hsl(38 60% 40% / 0.4) !important;
        }

        /* ============ Micro-animations ============ */
        @keyframes toast-icon-pop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes toast-loading-shimmer {
          0%   { background-position: 220% 0; }
          100% { background-position: -120% 0; }
        }
        @keyframes toast-spinner-rotate {
          to { transform: rotate(360deg); }
        }

        /* Faster slide-in: override sonner's default lift duration */
        [data-sonner-toaster] [data-sonner-toast] {
          --lift-duration: 180ms !important;
          --enter-duration: 200ms !important;
        }
      `}</style>
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        position="bottom-right"
        duration={2500}
        gap={8}
        offset={20}
        visibleToasts={3}
        closeButton={false}
        toastOptions={{
          classNames: {
            toast: "group toast",
            title: "group-[.toast]:font-semibold",
            description: "group-[.toast]:text-muted-foreground",
          },
        }}
        {...props}
      />
    </>
  );
};

export { Toaster, toast };
