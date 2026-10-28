import { listDemoBusinesses } from './demoStore';
import { istToday, istTomorrow } from './format';
import type { ConciergeAction } from './types';

/** Local rule-based sample guidance. Never calls a provider or creates a booking. */
export function demoConcierge(message: string, city: string, previousId?: string): {
  reply: string; action?: ConciergeAction; selectedId?: string;
} {
  const text = message.toLowerCase().trim();
  const businesses = listDemoBusinesses(city, true).filter(b => b.active && b.services?.some(s => s.active));
  const hints: [RegExp, string][] = [
    [/\b(salon|hair|haircut)\b/, 'Salons'], [/\b(dentist|dental)\b/, 'Dentists'],
    [/\b(physio|physiotherapy)\b/, 'Physiotherapy Centers'], [/\b(hospital)\b/, 'Hospitals'],
    [/\b(clinic|doctor)\b/, 'Clinics'], [/\b(spa|massage)\b/, 'Spas'],
    [/\b(gym|fitness)\b/, 'Gyms'], [/\b(hotel|stay)\b/, 'Hotels'],
  ];
  const category = hints.find(([pattern]) => pattern.test(text))?.[1];
  const named = businesses.find(b => text.includes(b.name.toLowerCase()));
  const matched = named || (category ? businesses.find(b => b.category === category) : undefined);
  const previous = businesses.find(b => b.id === previousId);
  const target = matched || (!category ? previous : undefined);
  const appointments = { type: 'navigate' as const, to: '/appointments' };

  if (/\b(cancel|reschedule|change|move)\b/.test(text) && /\b(booking|appointment|reschedule|cancel)\b/.test(text)) {
    return { reply: 'Open your sample bookings to choose an appointment and review the available changes. Nothing is changed automatically.', action: appointments, selectedId: previousId };
  }
  if (/\b(my|show|see|view|upcoming)\b.*\b(appointments?|bookings?)\b/.test(text)) {
    return { reply: 'Open your sample bookings to view their current status.', action: appointments, selectedId: previousId };
  }
  if (/\b(directions?|navigate)\b/.test(text)) {
    return { reply: 'Sample listings have illustrative locations, so real directions are not available in demo mode.', selectedId: previousId };
  }
  if (/\b(book|booking|appointment|schedule|reserve|slot)\b/.test(text)) {
    if (!target) return { reply: category ? `I couldn't find an active, bookable sample in ${category}. Try another category.` : 'Which sample business or type of service would you like? Try “book a salon tomorrow”.', action: { type: 'navigate', to: '/search' } };
    const date = /\btomorrow\b/.test(text) ? istTomorrow() : /\btoday\b/.test(text) ? istToday() : null;
    const hour = /\bafternoon\b/.test(text) ? 14 : /\bmorning\b/.test(text) ? 10 : /\bevening\b/.test(text) ? 17 : null;
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (hour !== null) params.set('hour', String(hour));
    const query = params.toString();
    return { reply: `Let's open ${target.name}'s sample booking page. Choose a service and available slot there; no appointment has been made.`,
      action: { type: 'book', business_id: target.id, to: `/business/${encodeURIComponent(target.id)}${query ? `?${query}` : ''}` }, selectedId: target.id };
  }
  if (/\b(find|nearest|nearby|closest|search|where|show)\b/.test(text) || matched) {
    if (!target) return { reply: category ? `I couldn't find an active, bookable sample in ${category}. Try another category.` : 'What kind of sample business are you looking for?', action: { type: 'navigate', to: '/search' } };
    return { reply: `Here's a sample suggestion: ${target.name}. Sample locations are illustrative, so I can't verify which is nearest.`,
      action: { type: 'navigate', to: `/business/${encodeURIComponent(target.id)}` }, selectedId: target.id };
  }
  return { reply: 'I can help you explore sample businesses and open your bookings. Try “find a salon” or “show my appointments”.', selectedId: previousId };
}
