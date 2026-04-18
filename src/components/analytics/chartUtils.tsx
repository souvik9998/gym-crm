import { ReactNode } from "react";

/**
 * Shared chart utilities — keeps formatting, tooltips, and summary
 * presentation consistent across every analytics chart.
 */

export type Granularity = "day" | "week" | "month";
export interface IntervalMeta { startISO: string; endISO: string }

/** Format a bucket label into a human-readable date range, e.g. "06 – 12 Apr 2024". */
export function formatBucketRange(
  label: string,
  meta: IntervalMeta | undefined,
  granularity: Granularity | undefined
): string | undefined {
  if (!meta) return undefined;
  const start = new Date(meta.startISO);
  const end = new Date(meta.endISO);
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate();
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();

  if (granularity === "day" || sameDay) {
    return start.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }

  if (sameMonth) {
    return `${start.toLocaleDateString("en-GB", { day: "2-digit", timeZone: "UTC" })} – ${end.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}`;
  }
  return `${start.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} – ${end.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}`;
}

export function granularityLabel(g: Granularity | undefined): string {
  switch (g) {
    case "day": return "day";
    case "week": return "week";
    case "month": return "month";
    default: return "interval";
  }
}

// ---------- Number formatting ----------
export const formatINR = (value: number): string => {
  if (!isFinite(value)) return "₹0";
  const abs = Math.abs(value);
  if (abs >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
};

export const formatINRFull = (value: number): string =>
  `₹${Math.round(value).toLocaleString("en-IN")}`;

export const formatCompact = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${value}`;
};

// ---------- Summary chip strip ----------
export interface SummaryStat {
  label: string;
  value: string;
  tone?: "default" | "accent" | "primary" | "success" | "warning";
}

const toneClass: Record<NonNullable<SummaryStat["tone"]>, string> = {
  default: "text-foreground",
  accent: "text-accent",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
};

export function ChartSummary({ stats }: { stats: SummaryStat[] }) {
  if (!stats.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 pb-3 border-b border-border/50 mb-3">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {s.label}
          </span>
          <span className={`text-sm font-semibold tabular-nums ${toneClass[s.tone ?? "default"]}`}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- Empty state ----------
export function ChartEmpty({ message = "No data for this period" }: { message?: string }) {
  return (
    <div className="h-full min-h-[180px] flex items-center justify-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

// ---------- Premium Tooltip ----------
interface PremiumTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (value: number, name: string) => string;
  /** Optional secondary line under the label, e.g. "Apr 2024" */
  subLabel?: (label: string) => string | undefined;
}

export function PremiumTooltip({
  active,
  payload,
  label,
  formatter,
  subLabel,
}: PremiumTooltipProps) {
  if (!active || !payload?.length) return null;
  const sub = subLabel?.(label ?? "");

  return (
    <div className="rounded-xl border border-border/70 bg-popover/95 backdrop-blur-md shadow-lg px-3 py-2 min-w-[140px] animate-fade-in">
      {label && (
        <div className="mb-1.5">
          <p className="text-[11px] font-semibold text-foreground leading-tight">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>}
        </div>
      )}
      <div className="space-y-1">
        {payload
          .filter((p) => p && (p.value !== undefined && p.value !== null))
          .map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ background: p.color || p.fill || p.payload?.fill }}
                />
                <span className="text-muted-foreground truncate">{p.name}</span>
              </div>
              <span className="font-semibold tabular-nums text-foreground">
                {formatter ? formatter(Number(p.value), String(p.name)) : Number(p.value).toLocaleString("en-IN")}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ---------- Common axis tick props ----------
export const axisTickStyle = {
  fontSize: 11,
  fill: "hsl(var(--muted-foreground))",
};

export const axisTickStyleMobile = {
  fontSize: 10,
  fill: "hsl(var(--muted-foreground))",
};

// ---------- Standard cartesian grid ----------
export function gridProps() {
  return {
    strokeDasharray: "3 3",
    stroke: "hsl(var(--border))",
    strokeOpacity: 0.5,
    vertical: false as const,
  };
}

// ---------- Mobile X-axis label shortener ----------
/**
 * Compact a bucket label for narrow mobile X-axes.
 * Keeps it readable: "06 Apr", "Apr", "W14", "12/04" etc.
 */
export function shortenAxisLabel(label: string, granularity: Granularity | undefined): string {
  if (!label) return "";
  // Day buckets: "06 Apr 2024" or "Apr 06" → "06 Apr"
  if (granularity === "day") {
    // strip trailing year
    return label.replace(/,?\s*\d{4}$/, "").trim();
  }
  // Week buckets: "W14 2024" → "W14"
  if (granularity === "week") {
    const m = label.match(/W\d+/i);
    if (m) return m[0];
    return label.replace(/\s*\d{4}$/, "").trim();
  }
  // Month buckets: "Apr 2024" → "Apr"
  if (granularity === "month") {
    return label.replace(/\s*\d{4}$/, "").trim();
  }
  return label;
}

// ---------- Recharts-friendly XAxis props for date buckets ----------
export interface DateAxisOptions {
  isMobile: boolean;
  granularity?: Granularity;
  dataLength: number;
}
export function dateAxisProps({ isMobile, granularity, dataLength }: DateAxisOptions) {
  // On mobile pick a sensible interval so labels never overlap
  let interval: number | "preserveStartEnd" | "preserveEnd" = 0;
  if (isMobile) {
    if (dataLength <= 6) interval = 0;
    else if (dataLength <= 10) interval = 1;
    else if (dataLength <= 16) interval = 2;
    else interval = Math.ceil(dataLength / 6);
  }
  return {
    tickLine: false,
    axisLine: false,
    tick: isMobile ? axisTickStyleMobile : axisTickStyle,
    minTickGap: isMobile ? 4 : 8,
    interval,
    tickMargin: 6,
    height: isMobile ? 28 : 32,
    tickFormatter: (v: string) => (isMobile ? shortenAxisLabel(String(v), granularity) : String(v)),
  } as const;
}

