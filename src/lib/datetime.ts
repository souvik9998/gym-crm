/**
 * Centralised date/time formatting helpers.
 *
 * All times in this app should be displayed in Indian Standard Time (IST,
 * Asia/Kolkata) regardless of the viewer's browser timezone, because the
 * underlying business (gym branches, scheduled WhatsApp jobs, attendance,
 * payments) operates in India.
 *
 * Use these helpers instead of calling `.toLocaleString()` directly so that
 * the timezone is consistently enforced.
 */

export const IST_TIMEZONE = "Asia/Kolkata";
export const IST_LOCALE = "en-IN";

type DateLike = Date | string | number | null | undefined;

const toDate = (input: DateLike): Date | null => {
  if (input === null || input === undefined || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
};

const withTz = (
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormatOptions => ({
  timeZone: IST_TIMEZONE,
  ...options,
});

/** Format a date+time in IST. Default: 12 Apr 2026, 09:30 AM */
export const formatISTDateTime = (
  input: DateLike,
  options?: Intl.DateTimeFormatOptions,
): string => {
  const d = toDate(input);
  if (!d) return "-";
  return d.toLocaleString(
    IST_LOCALE,
    withTz(
      options ?? {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      },
    ),
  );
};

/** Format only the date portion in IST. Default: 12 Apr 2026 */
export const formatISTDate = (
  input: DateLike,
  options?: Intl.DateTimeFormatOptions,
): string => {
  const d = toDate(input);
  if (!d) return "-";
  return d.toLocaleDateString(
    IST_LOCALE,
    withTz(
      options ?? { day: "2-digit", month: "short", year: "numeric" },
    ),
  );
};

/** Format only the time portion in IST. Default: 09:30 AM */
export const formatISTTime = (
  input: DateLike,
  options?: Intl.DateTimeFormatOptions,
): string => {
  const d = toDate(input);
  if (!d) return "-";
  return d.toLocaleTimeString(
    IST_LOCALE,
    withTz(
      options ?? { hour: "2-digit", minute: "2-digit", hour12: true },
    ),
  );
};

/** Helper for date-only DB columns (YYYY-MM-DD) — treats them as IST calendar dates. */
export const formatISTDateOnly = (
  yyyymmdd: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string => {
  if (!yyyymmdd) return "-";
  // Anchor to noon IST (UTC+5:30 → 06:30 UTC) so DST/timezone shifts can never
  // bump the date forward or backward.
  return formatISTDate(`${yyyymmdd}T06:30:00Z`, options);
};
