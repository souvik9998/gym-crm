export type TimeBucket = "all" | "morning" | "afternoon" | "evening" | "night" | "custom";
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
}

export const TIME_BUCKET_OPTIONS: TimeBucketOption[] = [
  { value: "all", label: "All times", range: "Any time of day", emoji: "🕘" },
  { value: "morning", label: "Morning", range: "5:00 AM – 12:00 PM", emoji: "🌅" },
  { value: "afternoon", label: "Afternoon", range: "12:00 PM – 5:00 PM", emoji: "☀️" },
  { value: "evening", label: "Evening", range: "5:00 PM – 9:00 PM", emoji: "🌆" },
  { value: "night", label: "Night", range: "9:00 PM – 5:00 AM", emoji: "🌙" },
  { value: "custom", label: "Custom range", range: "Pick your own window", emoji: "🎯" },
];

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

export function getTimeBucketForMinutes(minutes: number): Exclude<TimeBucket, "all" | "custom"> {
  if (minutes >= 300 && minutes < 720) return "morning";
  if (minutes >= 720 && minutes < 1020) return "afternoon";
  if (minutes >= 1020 && minutes < 1260) return "evening";
  return "night";
}

/**
 * Returns one or more non-wrapping [start, end) minute intervals on a 24h day for the bucket.
 * Overnight buckets (Night) are returned as two intervals so we never need wrap math.
 */
function getBucketIntervals(bucket: Exclude<TimeBucket, "all" | "custom">): Array<[number, number]> {
  switch (bucket) {
    case "morning":
      return [[300, 720]]; // 5:00 AM – 12:00 PM
    case "afternoon":
      return [[720, 1020]]; // 12:00 PM – 5:00 PM
    case "evening":
      return [[1020, 1260]]; // 5:00 PM – 9:00 PM
    case "night":
      // 9:00 PM – 12:00 AM and 12:00 AM – 5:00 AM
      return [[1260, 1440], [0, 300]];
  }
}

/**
 * Splits a slot [start, end) into one or two non-wrapping intervals on [0, 1440).
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

function intervalsOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  for (const [aS, aE] of a) {
    for (const [bS, bE] of b) {
      if (aS < bE && bS < aE) return true;
    }
  }
  return false;
}

export function getTimeBucketLabel(bucket: Exclude<TimeBucket, "all" | "custom">) {
  switch (bucket) {
    case "morning":
      return "Morning";
    case "afternoon":
      return "Afternoon";
    case "evening":
      return "Evening";
    case "night":
      return "Night";
  }
}

export function matchesTimeFilter(
  startTime: string,
  timeFilter: TimeBucket,
  customStart?: string,
  customEnd?: string,
  endTime?: string,
) {
  if (timeFilter === "all") return true;

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = endTime ? parseTimeToMinutes(endTime) : startMinutes;
  const slotIntervals = getSlotIntervals(startMinutes, endMinutes);

  if (timeFilter !== "custom") {
    return intervalsOverlap(slotIntervals, getBucketIntervals(timeFilter));
  }

  if (!customStart || !customEnd) return true;
  const cs = parseTimeToMinutes(customStart);
  const ce = parseTimeToMinutes(customEnd);
  const customIntervals = getSlotIntervals(cs, ce);
  return intervalsOverlap(slotIntervals, customIntervals);
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
