// Recommendations must use the same authoritative availability as the booking
// screen; there is no second synthetic fallback for real businesses.
import businessSlots from './business-slots.js';
export default async function handler(req, res) {
  return businessSlots(req, {
    setHeader: (...args) => res.setHeader(...args),
    status(code) { res.status(code); return this; },
    end(...args) { return res.end(...args); },
    json(data) {
      if (Array.isArray(data?.slots) && !data.recommended) data.recommended = data.slots.filter((s) => s.available).slice(0, 3);
      return res.json(data);
    },
    get headersSent() { return res.headersSent; },
  });
}
