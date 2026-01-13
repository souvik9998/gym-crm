import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <>
      <style>{`
        [data-sonner-toast][data-type="success"] {
          background-color: rgba(240, 253, 244, 0.95) !important;
          border-left: 4px solid #4ade80 !important;
          color: #111827 !important;
          backdrop-filter: blur(8px) !important;
        }
        [data-sonner-toast][data-type="success"] [data-title],
        [data-sonner-toast][data-type="success"] [data-description] {
          color: #111827 !important;
          opacity: 1 !important;
        }
        [data-sonner-toast][data-type="error"] {
          background-color: rgba(254, 242, 242, 0.95) !important;
          border-left: 4px solid #f87171 !important;
          color: #111827 !important;
          backdrop-filter: blur(8px) !important;
        }
        [data-sonner-toast][data-type="error"] [data-title],
        [data-sonner-toast][data-type="error"] [data-description] {
          color: #111827 !important;
          opacity: 1 !important;
        }
        [data-sonner-toast][data-type="info"] {
          background-color: rgba(239, 246, 255, 0.95) !important;
          border-left: 4px solid #60a5fa !important;
          color: #111827 !important;
          backdrop-filter: blur(8px) !important;
        }
        [data-sonner-toast][data-type="info"] [data-title],
        [data-sonner-toast][data-type="info"] [data-description] {
          color: #111827 !important;
          opacity: 1 !important;
        }
        [data-sonner-toast][data-type="warning"] {
          background-color: rgba(254, 252, 232, 0.95) !important;
          border-left: 4px solid #facc15 !important;
          color: #111827 !important;
          backdrop-filter: blur(8px) !important;
        }
        [data-sonner-toast][data-type="warning"] [data-title],
        [data-sonner-toast][data-type="warning"] [data-description] {
          color: #111827 !important;
          opacity: 1 !important;
        }
      `}</style>
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        position="bottom-right"
        richColors={false}
        duration={1500}
        gap={12}
        closeButton={false}
        toastOptions={{
          classNames: {
            toast:
              "group toast group-[.toaster]:rounded-xl group-[.toaster]:shadow-lg group-[.toaster]:border-0 group-[.toaster]:p-4 group-[.toaster]:backdrop-blur-sm group-[.toaster]:min-w-[320px]",
            title: "group-[.toast]:font-bold group-[.toast]:text-sm group-[.toast]:mb-1",
            description: "group-[.toast]:text-sm group-[.toast]:opacity-90",
          },
        }}
        {...props}
      />
    </>
  );
};

export { Toaster, toast };
