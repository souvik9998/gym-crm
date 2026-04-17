import { cn } from "@/lib/utils";

type AccentColor = "emerald" | "blue" | "violet" | "amber" | "rose" | "cyan" | "teal" | "fuchsia";

interface DetailItemProps {
  label: string;
  value: string;
  accent?: AccentColor;
}

const accentMap: Record<AccentColor, string> = {
  emerald: "border-l-emerald-500/60 bg-emerald-500/5",
  blue: "border-l-blue-500/60 bg-blue-500/5",
  violet: "border-l-violet-500/60 bg-violet-500/5",
  amber: "border-l-amber-500/60 bg-amber-500/5",
  rose: "border-l-rose-500/60 bg-rose-500/5",
  cyan: "border-l-cyan-500/60 bg-cyan-500/5",
  teal: "border-l-teal-500/60 bg-teal-500/5",
  fuchsia: "border-l-fuchsia-500/60 bg-fuchsia-500/5",
};

/**
 * A small labeled detail tile used inside the expanded staff/trainer card.
 * Uses a left accent border for color hierarchy without overwhelming the layout.
 */
export const DetailItem = ({ label, value, accent = "blue" }: DetailItemProps) => {
  return (
    <div
      className={cn(
        "rounded-md border border-border/60 border-l-[3px] px-3 py-2 transition-colors hover:bg-card",
        accentMap[accent],
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </p>
      <p className="text-xs lg:text-sm font-semibold text-foreground mt-0.5 truncate" title={value}>
        {value}
      </p>
    </div>
  );
};
