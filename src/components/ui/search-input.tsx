import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Show a small spinner dot while debouncing/searching */
  isSearching?: boolean;
  /** Callback when the user clicks the clear (X) button */
  onClear?: () => void;
  /** Wrapper className override */
  containerClassName?: string;
  /** Compact (h-9) or default (h-10) size */
  size?: "sm" | "md";
}

/**
 * Modern search input with smooth focus animations:
 * - Icon scales + color shifts on focus
 * - Subtle ring + border pulse on focus
 * - Clear (X) button appears when value is set
 * - Optional searching dot indicator
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      className,
      containerClassName,
      isSearching = false,
      onClear,
      value,
      size = "sm",
      placeholder = "Search…",
      ...props
    },
    ref,
  ) => {
    const hasValue = typeof value === "string" && value.length > 0;
    const heightCls = size === "md" ? "h-10" : "h-9";

    const handleClear = () => {
      onClear?.();
      // Also synthesize an onChange for controlled inputs without onClear
      if (!onClear && props.onChange) {
        const event = {
          target: { value: "" },
          currentTarget: { value: "" },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        props.onChange(event);
      }
    };

    return (
      <div
        className={cn(
          "group relative flex items-center w-full",
          containerClassName,
        )}
      >
        {/* Leading search icon */}
        <Search
          className={cn(
            "pointer-events-none absolute left-3 h-4 w-4 z-10",
            "text-muted-foreground transition-all duration-200 ease-out",
            "group-focus-within:text-foreground group-focus-within:scale-110",
            isSearching && "animate-pulse text-foreground",
          )}
          strokeWidth={2}
        />

        <input
          ref={ref}
          type="text"
          value={value}
          placeholder={placeholder}
          className={cn(
            "flex w-full rounded-xl border bg-muted/40 pl-10 pr-10 text-sm",
            "border-border/50 shadow-sm",
            "transition-all duration-200 ease-out",
            "placeholder:text-muted-foreground placeholder:transition-opacity",
            "hover:bg-muted/60 hover:border-border hover:shadow",
            "focus:outline-none focus:bg-background focus:border-foreground/30 focus:shadow-md",
            "focus:ring-2 focus:ring-foreground/10",
            "focus:placeholder:opacity-60",
            "disabled:cursor-not-allowed disabled:opacity-50",
            heightCls,
            className,
          )}
          {...props}
        />

        {/* Right-side: searching dot OR clear button */}
        <div className="absolute right-2 flex items-center gap-1 z-10">
          {isSearching && (
            <span
              className="flex h-2 w-2 items-center justify-center"
              aria-label="Searching"
            >
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-foreground/40" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
            </span>
          )}
          {hasValue && !isSearching && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full",
                "text-muted-foreground hover:text-foreground hover:bg-muted",
                "transition-all duration-150 ease-out",
                "animate-in fade-in-0 zoom-in-95",
                "active:scale-90",
              )}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Subtle bottom-glow indicator when active */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-3 -bottom-px h-px rounded-full",
            "bg-gradient-to-r from-transparent via-foreground/40 to-transparent",
            "opacity-0 scale-x-0 transition-all duration-300 ease-out",
            "group-focus-within:opacity-100 group-focus-within:scale-x-100",
          )}
        />
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";
