import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { Check, X, AlertTriangle, Info } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      duration={2500}
      gap={12}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:border-0 group-[.toaster]:shadow-lg group-[.toaster]:p-4 group-[.toaster]:pl-5 group-[.toaster]:flex group-[.toaster]:items-center group-[.toaster]:gap-4 group-[.toaster]:min-w-[360px] group-[.toaster]:backdrop-blur-sm",
          title: "group-[.toast]:font-semibold group-[.toast]:text-[15px] group-[.toast]:text-gray-900 dark:group-[.toast]:text-gray-100",
          description: "group-[.toast]:text-sm group-[.toast]:text-gray-600 dark:group-[.toast]:text-gray-400",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "group-[.toast]:text-gray-400 group-[.toast]:hover:text-gray-600 group-[.toast]:transition-all group-[.toast]:duration-200 group-[.toast]:hover:bg-gray-100 group-[.toast]:rounded-full",
          success: "group-[.toaster]:bg-[#ECFDF3] group-[.toaster]:border-l-4 group-[.toaster]:border-l-[#22C55E] dark:group-[.toaster]:bg-[#052E16]/80",
          error: "group-[.toaster]:bg-[#FEF2F2] group-[.toaster]:border-l-4 group-[.toaster]:border-l-[#EF4444] dark:group-[.toaster]:bg-[#450A0A]/80",
          warning: "group-[.toaster]:bg-[#FFFBEB] group-[.toaster]:border-l-4 group-[.toaster]:border-l-[#F59E0B] dark:group-[.toaster]:bg-[#451A03]/80",
          info: "group-[.toaster]:bg-[#EFF6FF] group-[.toaster]:border-l-4 group-[.toaster]:border-l-[#3B82F6] dark:group-[.toaster]:bg-[#172554]/80",
        },
      }}
      icons={{
        success: (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#22C55E] flex items-center justify-center shadow-sm">
            <Check className="w-5 h-5 text-white stroke-[3]" />
          </div>
        ),
        error: (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#EF4444] flex items-center justify-center shadow-sm">
            <X className="w-5 h-5 text-white stroke-[3]" />
          </div>
        ),
        warning: (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F59E0B] flex items-center justify-center shadow-sm">
            <AlertTriangle className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
        ),
        info: (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#3B82F6] flex items-center justify-center shadow-sm">
            <Info className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
        ),
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
