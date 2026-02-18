import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface LimitReachedBannerProps {
  title?: string;
  message?: string;
  className?: string;
}

export function LimitReachedBanner({
  title = "Limit Reached",
  message = "You've reached the maximum allowed on your current plan. Contact your platform admin to upgrade.",
  className,
}: LimitReachedBannerProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
