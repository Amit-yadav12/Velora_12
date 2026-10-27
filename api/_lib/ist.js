// Asia/Kolkata (IST) time primitives — the single source of truth for turning a
// business's wall-clock ("a 10:00 slot") into an absolute instant.
//
// Why this exists: serverless runtimes execute in UTC. Building a slot with
// `new Date('2026-10-28T10:00:00').setHours(10)` produced 10:00 **UTC**, i.e.
// 15:30 IST, so a customer tapping "10:00 am" was stored 5½ hours later than
// the business meant. Every server-side slot/heatmap calculation now goes
// through these helpers, and every human-facing time is formatted in IST
// rather than the runtime's local zone.

export const IST_TIME_ZONE = 'Asia/Kolkata';
/** IST is UTC+05:30 all year — India has no daylight saving. */
export const IST_OFFSET_MINUTES = 330;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

/** Absolute instant for an IST wall clock, e.g. istWallDate('2026-10-28', 10, 30). */
export function istWallDate(ymd, hour = 0, minute = 0) {
  if (typeof ymd !== 'string' || !YMD.test(ymd)) return new Date(NaN);
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return new Date(NaN);
  return new Date(`${ymd}T${pad(h)}:${pad(m)}:00+05:30`);
}

/** Calendar date (YYYY-MM-DD) of an instant, in IST. */
export function istYmd(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  // en-CA renders ISO-like YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function parts(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE, hourCycle: 'h23', weekday: 'short',
    hour: '2-digit', minute: '2-digit', day: '2-digit',
  }).formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/** IST hour of day (0–23). */
export function istHour(date = new Date()) {
  const p = parts(date);
  return p ? Number(p.hour) : NaN;
}

/** IST minute of hour (0–59). */
export function istMinute(date = new Date()) {
  const p = parts(date);
  return p ? Number(p.minute) : NaN;
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** IST weekday, 0 = Sunday … 6 = Saturday (same convention as Date#getDay). */
export function istWeekdayIndex(date = new Date()) {
  const p = parts(date);
  return p && p.weekday in WEEKDAY_INDEX ? WEEKDAY_INDEX[p.weekday] : NaN;
}

/** IST day of month (1–31). */
export function istDayOfMonth(date = new Date()) {
  const p = parts(date);
  return p ? Number(p.day) : NaN;
}

/** Short IST weekday label ("Mon"). */
export function istWeekdayLabel(date = new Date()) {
  const p = parts(date);
  return p ? p.weekday : '';
}

/** Human time in IST, e.g. "10:00 am". Never throws. */
export function istTimeLabel(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}

/** Full IST timestamp for emails/audit trails, e.g. "Wed, 28 Oct, 10:00 am IST". */
export function istDateTimeLabel(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d) + ' IST';
}

/** [start, end) instants covering an IST calendar day. */
export function istDayBounds(ymd) {
  const start = istWallDate(ymd, 0, 0);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Today's IST calendar date. */
export function istToday(now = new Date()) {
  return istYmd(now);
}
