import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { CheckCircle, XCircle, AlertCircle, Info } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      duration={2500}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:shadow-lg group-[.toaster]:p-4 group-[.toaster]:flex group-[.toaster]:items-start group-[.toaster]:gap-3 animate-in slide-in-from-top-2 fade-in duration-300",
          description: "group-[.toast]:text-sm group-[.toast]:opacity-90",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "group-[.toast]:opacity-60 group-[.toast]:hover:opacity-100 group-[.toast]:transition-opacity",
          success: "group-[.toaster]:bg-[#E8F5E9] group-[.toaster]:border-[#A5D6A7] group-[.toaster]:text-[#2E7D32] dark:group-[.toaster]:bg-[#1B5E20]/20 dark:group-[.toaster]:border-[#4CAF50]/40 dark:group-[.toaster]:text-[#81C784]",
          error: "group-[.toaster]:bg-[#FFEBEE] group-[.toaster]:border-[#EF9A9A] group-[.toaster]:text-[#C62828] dark:group-[.toaster]:bg-[#B71C1C]/20 dark:group-[.toaster]:border-[#EF5350]/40 dark:group-[.toaster]:text-[#EF9A9A]",
          warning: "group-[.toaster]:bg-[#FFF8E1] group-[.toaster]:border-[#FFE082] group-[.toaster]:text-[#F57F17] dark:group-[.toaster]:bg-[#FF6F00]/20 dark:group-[.toaster]:border-[#FFB74D]/40 dark:group-[.toaster]:text-[#FFB74D]",
          info: "group-[.toaster]:bg-[#E3F2FD] group-[.toaster]:border-[#90CAF9] group-[.toaster]:text-[#1565C0] dark:group-[.toaster]:bg-[#0D47A1]/20 dark:group-[.toaster]:border-[#42A5F5]/40 dark:group-[.toaster]:text-[#90CAF9]",
        },
      }}
      icons={{
        success: <CheckCircle className="w-5 h-5 text-[#4CAF50] flex-shrink-0" />,
        error: <XCircle className="w-5 h-5 text-[#EF5350] flex-shrink-0" />,
        warning: <AlertCircle className="w-5 h-5 text-[#FF9800] flex-shrink-0" />,
        info: <Info className="w-5 h-5 text-[#2196F3] flex-shrink-0" />,
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
