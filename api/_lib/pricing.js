// Dynamic pricing + no-show risk, computed from live demand in the DB.
export function computeDynamicPrice({ basePrice, startTime, sameDayLoad, travelMin }) {
  const d = new Date(startTime);
  const hour = d.getHours();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  let surge = 1;
  const breakdown = [{ k: 'Base price', v: Number(basePrice) }];

  // Peak hours 16:00–19:00
  if (hour >= 16 && hour <= 19) { surge += 0.15; breakdown.push({ k: 'Peak hour surge (+15%)', v: round(basePrice * 0.15) }); }
  // Weekend premium
  if (day === 0 || day === 6) { surge += 0.1; breakdown.push({ k: 'Weekend premium (+10%)', v: round(basePrice * 0.1) }); }
  // High demand (many same-day bookings)
  if (sameDayLoad >= 6) { surge += 0.12; breakdown.push({ k: 'High demand (+12%)', v: round(basePrice * 0.12) }); }
  // Off-peak morning discount 8–10
  if (hour >= 8 && hour < 10) { surge -= 0.1; breakdown.push({ k: 'Early-bird discount (-10%)', v: -round(basePrice * 0.1) }); }

  const travelFee = travelMin > 20 ? round((travelMin - 20) * 0.5) : 0;
  if (travelFee) breakdown.push({ k: `Travel (${travelMin} min)`, v: travelFee });

  const price = round(basePrice * surge + travelFee);
  return { price, breakdown, surgeMultiplier: round(surge) };
}

export function computeNoShowRisk({ hour, leadTimeHours, sameDayLoad }) {
  let risk = 0.06;
  if (hour >= 8 && hour < 10) risk += 0.05;
  if (hour >= 12 && hour < 14) risk += 0.03;
  if (leadTimeHours > 168) risk += 0.08; // booked far ahead
  if (leadTimeHours < 4) risk += 0.04;
  if (sameDayLoad >= 8) risk += 0.03;
  return Math.min(0.6, round(risk));
}

function round(n) { return Math.round(n * 100) / 100; }
