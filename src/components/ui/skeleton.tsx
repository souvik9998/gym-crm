import { cn } from "@/lib/utils";

/**
 * Modern skeleton with a continuous shimmer sweep on top of the muted base.
 * Falls back to subtle pulse if shimmer is disabled by `reduce-motion`.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/70",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.07] before:to-transparent",
        "before:animate-[shimmer_1.6s_ease-in-out_infinite]",
        "motion-reduce:before:hidden motion-reduce:animate-pulse",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
