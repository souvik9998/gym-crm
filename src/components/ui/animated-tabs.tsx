import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * AnimatedTabsList — modern segmented control with a smoothly sliding active pill.
 * Drop-in replacement for shadcn TabsList when paired with AnimatedTabsTrigger.
 *
 * Use inside <Tabs value=... onValueChange=...>. Children must be AnimatedTabsTrigger.
 */

interface AnimatedTabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  size?: "sm" | "md";
  fullWidth?: boolean;
}

const AnimatedTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  AnimatedTabsListProps
>(({ className, children, size = "md", fullWidth = false, ...props }, ref) => {
  const localRef = React.useRef<HTMLDivElement | null>(null);
  React.useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

  const [indicator, setIndicator] = React.useState<{
    left: number;
    width: number;
    ready: boolean;
  }>({ left: 0, width: 0, ready: false });

  const updateIndicator = React.useCallback(() => {
    const list = localRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-state="active"]');
    if (!active) return;
    const listRect = list.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    const next = {
      left: rect.left - listRect.left,
      width: rect.width,
      ready: true,
    };
    setIndicator((prev) =>
      prev.ready === next.ready &&
      Math.abs(prev.left - next.left) < 0.5 &&
      Math.abs(prev.width - next.width) < 0.5
        ? prev
        : next,
    );
  }, []);

  React.useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, children]);

  React.useEffect(() => {
    const list = localRef.current;
    if (!list) return;

    // Observe size changes (responsive layout, font load, etc.)
    const ro = new ResizeObserver(() => updateIndicator());
    ro.observe(list);
    Array.from(list.children).forEach((c) => ro.observe(c as Element));

    // Observe active-state attribute mutations on triggers
    const mo = new MutationObserver(() => updateIndicator());
    Array.from(list.querySelectorAll('[role="tab"]')).forEach((el) =>
      mo.observe(el, { attributes: true, attributeFilter: ["data-state"] }),
    );

    window.addEventListener("resize", updateIndicator);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [updateIndicator]);

  return (
    <TabsPrimitive.List
      ref={localRef}
      className={cn(
        "relative inline-flex items-center rounded-xl bg-muted/60 backdrop-blur-sm p-1 text-muted-foreground",
        size === "sm" ? "h-9" : "h-10",
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {/* Sliding active pill */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 rounded-lg bg-background shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_-2px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04]",
          "transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          indicator.ready ? "opacity-100" : "opacity-0",
        )}
        style={{
          width: Math.max(0, indicator.width - 4),
          transform: `translateX(${indicator.left + 2}px)`,
        }}
      />
      {children}
    </TabsPrimitive.List>
  );
});
AnimatedTabsList.displayName = "AnimatedTabsList";

interface AnimatedTabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  icon?: React.ComponentType<{ className?: string }>;
  fullWidth?: boolean;
}

const AnimatedTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  AnimatedTabsTriggerProps
>(({ className, children, icon: Icon, fullWidth = false, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "group relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
      "text-muted-foreground transition-colors duration-200 ease-out",
      "hover:text-foreground/80",
      "data-[state=active]:text-foreground data-[state=active]:font-semibold",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      "disabled:pointer-events-none disabled:opacity-50",
      "active:scale-[0.97] transition-transform",
      fullWidth && "flex-1",
      className,
    )}
    {...props}
  >
    {Icon && (
      <Icon
        className={cn(
          "w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          "group-data-[state=active]:scale-110 group-data-[state=inactive]:scale-100",
        )}
      />
    )}
    <span className="transition-transform duration-300">{children}</span>
  </TabsPrimitive.Trigger>
));
AnimatedTabsTrigger.displayName = "AnimatedTabsTrigger";

export { AnimatedTabsList, AnimatedTabsTrigger };
