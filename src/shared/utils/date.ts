import { format, parse, startOfDay, endOfDay, isAfter, isBefore } from 'date-fns';
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

/**
 * Date utilities for IST timezone handling
 */

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Get current date in IST
 */
export function getCurrentISTDate(): Date {
  return utcToZonedTime(new Date(), IST_TIMEZONE);
}

/**
 * Get start of day in IST
 */
export function getStartOfDayIST(date: Date = new Date()): Date {
  const istDate = utcToZonedTime(date, IST_TIMEZONE);
  const startOfDayIST = startOfDay(istDate);
  return zonedTimeToUtc(startOfDayIST, IST_TIMEZONE);
}

/**
 * Get end of day in IST
 */
export function getEndOfDayIST(date: Date = new Date()): Date {
  const istDate = utcToZonedTime(date, IST_TIMEZONE);
  const endOfDayIST = endOfDay(istDate);
  return zonedTimeToUtc(endOfDayIST, IST_TIMEZONE);
}

/**
 * Format date to IST string (YYYY-MM-DD)
 */
export function formatISTDate(date: Date): string {
  const istDate = utcToZonedTime(date, IST_TIMEZONE);
  return format(istDate, 'yyyy-MM-dd');
}

/**
 * Parse IST date string (YYYY-MM-DD) to Date
 */
export function parseISTDate(dateString: string): Date {
  const parsed = parse(dateString, 'yyyy-MM-dd', new Date());
  return zonedTimeToUtc(parsed, IST_TIMEZONE);
}

/**
 * Check if date is today in IST
 */
export function isTodayIST(date: Date): boolean {
  const today = getStartOfDayIST();
  const checkDate = getStartOfDayIST(date);
  return formatISTDate(today) === formatISTDate(checkDate);
}

/**
 * Check if date is in the past (IST)
 */
export function isPastIST(date: Date): boolean {
  const now = getCurrentISTDate();
  return isBefore(date, now);
}

/**
 * Check if date is in the future (IST)
 */
export function isFutureIST(date: Date): boolean {
  const now = getCurrentISTDate();
  return isAfter(date, now);
}

/**
 * Parse time string (HH:mm) to Date for today in IST
 */
export function parseISTTime(timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number);
  const today = getCurrentISTDate();
  const istDate = utcToZonedTime(today, IST_TIMEZONE);
  istDate.setHours(hours, minutes, 0, 0);
  return zonedTimeToUtc(istDate, IST_TIMEZONE);
}

/**
 * Calculate hours between two dates
 */
export function calculateHours(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return diffMs / (1000 * 60 * 60);
}
