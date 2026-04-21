import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

export interface ImportStep {
  key: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
}

export const ImportProgressOverlay = ({ steps }: { steps: ImportStep[] }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-card border border-border/60 rounded-2xl shadow-2xl p-6 lg:p-8 max-w-md w-[90vw]">
        <h3 className="text-lg font-semibold text-foreground mb-1">Restoring backup</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please don't close this tab — this is a destructive operation.
        </p>
        <ul className="space-y-3">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full border",
                  step.status === "done" && "bg-success/10 border-success text-success",
                  step.status === "active" && "bg-primary/10 border-primary text-primary",
                  step.status === "pending" && "bg-muted border-border text-muted-foreground",
                  step.status === "error" && "bg-destructive/10 border-destructive text-destructive"
                )}
              >
                {step.status === "done" ? (
                  <CheckCircleIcon className="w-4 h-4" />
                ) : step.status === "active" ? (
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                )}
              </span>
              <span
                className={cn(
                  step.status === "active" && "text-foreground font-medium",
                  step.status === "done" && "text-foreground",
                  step.status === "pending" && "text-muted-foreground",
                  step.status === "error" && "text-destructive font-medium"
                )}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
