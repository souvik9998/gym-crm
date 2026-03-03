import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-inner transition-all duration-300 ease-in-out",
      "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/25",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "hover:data-[state=unchecked]:bg-muted-foreground/35 hover:data-[state=checked]:bg-primary/90",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[20px] w-[20px] rounded-full bg-background ring-0",
        "shadow-[0_1px_3px_rgba(0,0,0,0.2)]",
        "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        "data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-[1px]",
        "data-[state=checked]:shadow-[0_1px_4px_rgba(0,0,0,0.25)]",
        "data-[state=unchecked]:scale-[0.92] data-[state=checked]:scale-100",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
