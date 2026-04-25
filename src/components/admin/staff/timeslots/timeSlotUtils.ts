export type TimeBucket = string; // "all" | bucket-id (uuid-ish from settings)
export type SlotAvailability = "all" | "open" | "full" | "empty" | "high_load";

export interface TimeSlotLite {
  id: string;
  trainer_id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  status?: string | null;
}

export interface TimeBucketOption {
  value: TimeBucket;
  label: string;
  /** Short human-readable time-window hint shown beneath the label. */
  range: string;
  /** Optional emoji to add visual personality to each chip. */
  emoji: string;
  /** 24h "HH:mm" — present for non-"all" buckets. */
  start_time?: string;
  /** 24h "HH:mm" — present for non-"all" buckets. */
  end_time?: string;
}

/** Persisted shape stored in `gym_settings.time_buckets` jsonb array. */
export interface CustomTimeBucket {
  id: string;
  label: string;
  emoji: string;
  start_time: string; // "HH:mm"
  end_time: string; // "HH:mm"
  sort_order: number;
}

// ---- Built-in default chips (used when no custom buckets configured) -------
export const DEFAULT_TIME_BUCKETS: CustomTimeBucket[] = [
  { id: "morning", label: "Morning", emoji: "🌅", start_time: "05:00", end_time: "12:00", sort_order: 1 },
  { id: "afternoon", label: "Afternoon", emoji: "☀️", start_time: "12:00", end_time: "17:00", sort_order: 2 },
  { id: "evening", label: "Evening", emoji: "🌆", start_time: "17:00", end_time: "21:00", sort_order: 3 },
  { id: "night", label: "Night", emoji: "🌙", start_time: "21:00", end_time: "05:00", sort_order: 4 },
];

export const ALL_BUCKET_OPTION: TimeBucketOption = {
  value: "all",
  label: "All times",
  range: "Any time of day",
  emoji: "🕘",
};

const CUSTOM_BUCKET_OPTION: TimeBucketOption = {
  value: "custom",
  label: "Custom range",
  range: "Pick your own window",
  emoji: "🎯",
};

/**
 * @deprecated Kept for backwards compatibility (some files import this name).
 * Real options are now derived per-branch via `useTimeBuckets()`.
 */
export const TIME_BUCKET_OPTIONS: TimeBucketOption[] = [
  ALL_BUCKET_OPTION,
  ...DEFAULT_TIME_BUCKETS.map(toBucketOption),
  CUSTOM_BUCKET_OPTION,
];

export function toBucketOption(b: CustomTimeBucket): TimeBucketOption {
  return {
    value: b.id,
    label: b.label,
    range: `${formatTimeLabel(b.start_time)} – ${formatTimeLabel(b.end_time)}`,
    emoji: b.emoji,
    start_time: b.start_time,
    end_time: b.end_time,
  };
}

/** Build a chip-options list (All + admin chips + Custom) from the persisted array. */
export function buildBucketOptions(buckets: CustomTimeBucket[]): TimeBucketOption[] {
  const chips = (buckets.length > 0 ? buckets : DEFAULT_TIME_BUCKETS)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(toBucketOption);
  return [ALL_BUCKET_OPTION, ...chips, CUSTOM_BUCKET_OPTION];
}

export const AVAILABILITY_OPTIONS: Array<{ value: SlotAvailability; label: string }> = [
  { value: "all", label: "All availability" },
  { value: "open", label: "Open slots" },
  { value: "full", label: "Full slots" },
  { value: "empty", label: "Empty slots" },
  { value: "high_load", label: "High load" },
];

export function parseTimeToMinutes(time: string | null | undefined) {
  if (!time) return 0;
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function formatTimeLabel(time: string | null | undefined) {
  if (!time) return "--";
  const [hours = "0", minutes = "0"] = time.split(":");
  const hour = Number(hours);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minutes} ${suffix}`;
}

/**
 * Splits a time window [start, end) into one or two non-wrapping intervals on [0, 1440).
 * If end <= start the window is treated as wrapping past midnight.
 * Equal start/end is treated as a 1-minute point.
 */
function getSlotIntervals(startMinutes: number, endMinutes: number): Array<[number, number]> {
  const s = ((startMinutes % 1440) + 1440) % 1440;
  let e = ((endMinutes % 1440) + 1440) % 1440;
  if (e === s) e = s + 1; // instantaneous
  if (e > s) return [[s, e]];
  // wraps midnight
  return [[s, 1440], [0, e]];
}

/**
 * Strict containment by START time:
 *   bucketStart <= slot.start_time < bucketEnd
 *
 * A slot belongs to a bucket only when its start time falls inside the
 * bucket's window. The end time is intentionally ignored — a 4–6 PM slot
 * starts in the afternoon and never in the night, even though it crosses
 * into the evening boundary.
 */
function isStartInIntervals(startMinutes: number, intervals: Array<[number, number]>): boolean {
  for (const [s, e] of intervals) {
    if (startMinutes >= s && startMinutes < e) return true;
  }
  return false;
}

/**
 * Match a slot's start time against the active bucket filter.
 * - "all"    → always match
 * - "custom" → match against [customStart, customEnd) (overnight wrapping supported)
 * - other    → look up bucket window in the provided list and match
 *
 * NOTE: the legacy signature `(startTime, timeFilter, customStart, customEnd, endTime)` is preserved.
 * Callers pass the available bucket list as the optional 6th arg; if omitted,
 * the built-in defaults are used so existing call-sites still behave correctly.
 */
export function matchesTimeFilter(
  startTime: string,
  timeFilter: TimeBucket,
  customStart?: string,
  customEnd?: string,
  _endTime?: string,
  buckets?: CustomTimeBucket[],
) {
  if (timeFilter === "all") return true;

  const startMinutes = parseTimeToMinutes(startTime);

  if (timeFilter === "custom") {
    if (!customStart || !customEnd) return true;
    const cs = parseTimeToMinutes(customStart);
    const ce = parseTimeToMinutes(customEnd);
    return isStartInIntervals(startMinutes, getSlotIntervals(cs, ce));
  }

  const list = buckets && buckets.length > 0 ? buckets : DEFAULT_TIME_BUCKETS;
  const bucket = list.find((b) => b.id === timeFilter);
  if (!bucket) return true; // unknown id → don't filter (defensive)
  const bs = parseTimeToMinutes(bucket.start_time);
  const be = parseTimeToMinutes(bucket.end_time);
  return isStartInIntervals(startMinutes, getSlotIntervals(bs, be));
}

export function getSlotAvailability(memberCount: number, capacity: number): Exclude<SlotAvailability, "all"> {
  if (memberCount === 0) return "empty";
  if (memberCount >= capacity) return "full";
  if (capacity > 0 && memberCount / capacity >= 0.7) return "high_load";
  return "open";
}

export function getUtilizationPercent(memberCount: number, capacity: number) {
  if (!capacity) return 0;
  return Math.min(100, Math.round((memberCount / capacity) * 100));
}
