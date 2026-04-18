import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <>
      <style>{`
        /* Base toast — modern glass card */
        [data-sonner-toaster] {
          --toast-radius: 14px;
        }
        [data-sonner-toast] {
          border-radius: var(--toast-radius) !important;
          padding: 14px 16px !important;
          min-height: 56px !important;
          background: hsl(0 0% 100% / 0.85) !important;
          backdrop-filter: saturate(180%) blur(20px) !important;
          -webkit-backdrop-filter: saturate(180%) blur(20px) !important;
          border: 1px solid hsl(220 13% 91% / 0.8) !important;
          box-shadow:
            0 1px 2px rgba(16, 24, 40, 0.04),
            0 8px 24px -8px rgba(16, 24, 40, 0.12),
            0 24px 48px -16px rgba(16, 24, 40, 0.08) !important;
          color: hsl(222 47% 11%) !important;
          font-weight: 500 !important;
          letter-spacing: -0.01em !important;
          transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1),
                      opacity 200ms ease,
                      box-shadow 200ms ease !important;
        }
        [data-sonner-toast]:hover {
          box-shadow:
            0 2px 4px rgba(16, 24, 40, 0.05),
            0 12px 32px -8px rgba(16, 24, 40, 0.16),
            0 32px 64px -16px rgba(16, 24, 40, 0.10) !important;
        }
        [data-sonner-toast] [data-title] {
          font-size: 14px !important;
          font-weight: 600 !important;
          line-height: 1.4 !important;
          color: hsl(222 47% 11%) !important;
        }
        [data-sonner-toast] [data-description] {
          font-size: 13px !important;
          font-weight: 400 !important;
          line-height: 1.45 !important;
          margin-top: 2px !important;
          color: hsl(220 9% 40%) !important;
          opacity: 1 !important;
        }

        /* Icon container — subtle circular badge */
        [data-sonner-toast] [data-icon] {
          width: 20px !important;
          height: 20px !important;
          margin-right: 12px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        [data-sonner-toast] [data-icon] svg {
          width: 18px !important;
          height: 18px !important;
        }

        /* SUCCESS */
        [data-sonner-toast][data-type="success"] {
          background: linear-gradient(135deg, hsl(152 76% 96% / 0.95), hsl(0 0% 100% / 0.92)) !important;
          border-color: hsl(152 60% 80% / 0.6) !important;
        }
        [data-sonner-toast][data-type="success"] [data-icon] {
          color: hsl(152 70% 38%) !important;
        }

        /* ERROR */
        [data-sonner-toast][data-type="error"] {
          background: linear-gradient(135deg, hsl(0 86% 97% / 0.95), hsl(0 0% 100% / 0.92)) !important;
          border-color: hsl(0 80% 85% / 0.6) !important;
        }
        [data-sonner-toast][data-type="error"] [data-icon] {
          color: hsl(0 72% 51%) !important;
        }

        /* INFO */
        [data-sonner-toast][data-type="info"] {
          background: linear-gradient(135deg, hsl(214 100% 97% / 0.95), hsl(0 0% 100% / 0.92)) !important;
          border-color: hsl(214 90% 85% / 0.6) !important;
        }
        [data-sonner-toast][data-type="info"] [data-icon] {
          color: hsl(214 90% 52%) !important;
        }

        /* WARNING */
        [data-sonner-toast][data-type="warning"] {
          background: linear-gradient(135deg, hsl(45 100% 96% / 0.95), hsl(0 0% 100% / 0.92)) !important;
          border-color: hsl(38 90% 80% / 0.6) !important;
        }
        [data-sonner-toast][data-type="warning"] [data-icon] {
          color: hsl(32 95% 44%) !important;
        }

        /* LOADING */
        [data-sonner-toast][data-type="loading"] [data-icon] {
          color: hsl(222 47% 30%) !important;
        }

        /* Dark mode */
        .dark [data-sonner-toast] {
          background: hsl(222 47% 11% / 0.85) !important;
          border-color: hsl(220 13% 24% / 0.8) !important;
          color: hsl(0 0% 98%) !important;
          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.3),
            0 8px 24px -8px rgba(0, 0, 0, 0.5),
            0 24px 48px -16px rgba(0, 0, 0, 0.4) !important;
        }
        .dark [data-sonner-toast] [data-title] {
          color: hsl(0 0% 98%) !important;
        }
        .dark [data-sonner-toast] [data-description] {
          color: hsl(220 9% 70%) !important;
        }
        .dark [data-sonner-toast][data-type="success"] {
          background: linear-gradient(135deg, hsl(152 60% 14% / 0.92), hsl(222 47% 11% / 0.92)) !important;
          border-color: hsl(152 50% 30% / 0.5) !important;
        }
        .dark [data-sonner-toast][data-type="success"] [data-icon] {
          color: hsl(152 70% 60%) !important;
        }
        .dark [data-sonner-toast][data-type="error"] {
          background: linear-gradient(135deg, hsl(0 60% 18% / 0.92), hsl(222 47% 11% / 0.92)) !important;
          border-color: hsl(0 60% 35% / 0.5) !important;
        }
        .dark [data-sonner-toast][data-type="error"] [data-icon] {
          color: hsl(0 80% 70%) !important;
        }
        .dark [data-sonner-toast][data-type="info"] {
          background: linear-gradient(135deg, hsl(214 60% 18% / 0.92), hsl(222 47% 11% / 0.92)) !important;
          border-color: hsl(214 60% 35% / 0.5) !important;
        }
        .dark [data-sonner-toast][data-type="info"] [data-icon] {
          color: hsl(214 90% 70%) !important;
        }
        .dark [data-sonner-toast][data-type="warning"] {
          background: linear-gradient(135deg, hsl(38 60% 18% / 0.92), hsl(222 47% 11% / 0.92)) !important;
          border-color: hsl(38 60% 35% / 0.5) !important;
        }
        .dark [data-sonner-toast][data-type="warning"] [data-icon] {
          color: hsl(38 95% 65%) !important;
        }

        /* Smooth entrance animations */
        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        [data-sonner-toast][data-mounted="true"] {
          animation: toast-slide-in 280ms cubic-bezier(0.32, 0.72, 0, 1);
        }

        /* Close button polish */
        [data-sonner-toast] [data-close-button] {
          background: hsl(0 0% 100% / 0.8) !important;
          border: 1px solid hsl(220 13% 91%) !important;
          color: hsl(220 9% 40%) !important;
          border-radius: 999px !important;
          width: 20px !important;
          height: 20px !important;
          transition: all 150ms ease !important;
        }
        [data-sonner-toast] [data-close-button]:hover {
          background: hsl(220 14% 96%) !important;
          color: hsl(222 47% 11%) !important;
        }
        .dark [data-sonner-toast] [data-close-button] {
          background: hsl(222 47% 14%) !important;
          border-color: hsl(220 13% 24%) !important;
          color: hsl(220 9% 70%) !important;
        }
      `}</style>
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        position="bottom-right"
        duration={2200}
        gap={10}
        offset={20}
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
