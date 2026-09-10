/**
 * Instant calendar helpers — NO OAuth, NO server round-trip required.
 * These make "Add to Google Calendar" work the moment a booking is created.
 */

function fmt(dtISO: string) {
  // Google Calendar / ICS expect UTC basic format: YYYYMMDDTHHMMSSZ
  const d = new Date(dtISO);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface CalEvent {
  title: string;
  start: string; // ISO
  end: string;   // ISO
  location?: string;
  details?: string;
}

/** Opens Google Calendar with the event pre-filled — one tap to save. */
export function googleCalendarUrl(e: CalEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${fmt(e.start)}/${fmt(e.end)}`,
    details: e.details || '',
    location: e.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Builds a downloadable .ics file (works with Apple Calendar, Outlook, etc.). */
export function icsBlob(e: CalEvent): Blob {
  const uid = `${Date.now()}@velora-ai-in.netlify.app`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Velora//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(e.start)}`,
    `DTEND:${fmt(e.end)}`,
    `SUMMARY:${escapeICS(e.title)}`,
    `DESCRIPTION:${escapeICS(e.details || '')}`,
    `LOCATION:${escapeICS(e.location || '')}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return new Blob([ics], { type: 'text/calendar;charset=utf-8' });
}

export function downloadICS(e: CalEvent, filename = 'velora-booking.ics') {
  const url = URL.createObjectURL(icsBlob(e));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeICS(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
