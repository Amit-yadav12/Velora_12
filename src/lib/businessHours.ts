import { istWeekdayIndex, istYmd } from './format';
import type { Business } from './product';

export const BUSINESS_DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const;

/** Display the published schedule for today, rather than a generic default. */
export function todayHours(b: Business, now = new Date()): string | null {
  if (b.live) return null; // Google does not always supply individual time ranges.
  if ((b.holidays || []).includes(istYmd(now))) return 'Closed today · holiday';
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][istWeekdayIndex(now)];
  const day = b.weekly_hours?.[weekday];
  if (day?.closed) return 'Closed today';
  const open = day?.open || b.open_time, close = day?.close || b.close_time;
  return open && close ? `Today ${open}–${close} IST` : null;
}
