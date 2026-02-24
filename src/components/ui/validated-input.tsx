import * as React from "react";
import { cn } from "@/lib/utils";

interface InlineErrorProps {
  message?: string;
  className?: string;
}

/** Inline error message shown below a form field */
export const InlineError = ({ message, className }: InlineErrorProps) => {
  if (!message) return null;
  return (
    <p className={cn("text-xs font-medium text-destructive mt-1", className)}>
      {message}
    </p>
  );
};

interface ValidatedInputProps extends React.ComponentProps<"input"> {
  error?: string;
  /** Called on blur with the current value, useful for field-level validation */
  onValidate?: (value: string) => void;
}

/** Input with red border on error + inline error message + auto-trim on blur */
export const ValidatedInput = React.forwardRef<HTMLInputElement, ValidatedInputProps>(
  ({ className, error, onValidate, onBlur, ...props }, ref) => {
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Trim whitespace on blur
      if (e.target.value !== e.target.value.trim()) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        nativeInputValueSetter?.call(e.target, e.target.value.trim());
        e.target.dispatchEvent(new Event("input", { bubbles: true }));
      }
      onValidate?.(e.target.value.trim());
      onBlur?.(e);
    };

    return (
      <div>
        <input
          ref={ref}
          className={cn(
            "flex h-12 w-full rounded-lg border border-input bg-background px-4 py-3 text-base transition-all duration-200",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
            "placeholder:text-muted-foreground",
            "hover:border-muted-foreground/50",
            "focus:outline-none focus:border-foreground/30 focus:bg-background",
            "focus-visible:outline-none focus-visible:ring-0",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive hover:border-destructive focus:border-destructive",
            className
          )}
          onBlur={handleBlur}
          {...props}
        />
        <InlineError message={error} />
      </div>
    );
  }
);
ValidatedInput.displayName = "ValidatedInput";
