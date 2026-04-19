import { addDays } from "date-fns";

/**
 * Number of days that constitute a "month" for gym & PT package calculations.
 * Business rule: every package month is treated as exactly 30 days,
 * regardless of the calendar month length.
 */
export const DAYS_PER_PACKAGE_MONTH = 30;

/**
 * Convert a package "months" value into the equivalent number of days
 * using the fixed 30-days-per-month rule.
 */
export const monthsToDays = (months: number): number =>
  Math.round(months * DAYS_PER_PACKAGE_MONTH);

/**
 * Add a package "months" value to a date. Always uses the fixed 30-day month
 * rule so that, e.g., a 1-month package is exactly 30 days, a 3-month package
 * is exactly 90 days, etc. — independent of calendar month length.
 *
 * Use this helper EVERYWHERE a gym/PT subscription end date is derived from
 * a "months" count. Do NOT use date-fns `addMonths` for package math.
 */
export const addPackageMonths = (start: Date, months: number): Date =>
  addDays(start, monthsToDays(months));
