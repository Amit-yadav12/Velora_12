# Judge walkthrough

## Start the sample (no credentials needed)

```bash
npm ci
npm run dev -- --host 0.0.0.0 --port 5173
```

Open the printed URL. With no Supabase variables this is an **isolated local sample**: businesses, prices, slots, reviews and tickets are synthetic, stored in this browser, and never sent to a provider. The banner at the top of every screen says so; keep it visible when you present.

The whole journey below takes about three minutes and needs one browser and no network services.

## The three-minute demo, in clicks

1. **Welcome → “Start the demo journey”.** `/welcome` carries a card labelled *Judge demo · about 3 minutes* with a single button. It signs in as the demo customer, selects **Jaipur**, and opens the clearly-marked sample salon **Aurora Luxe Salon & Spa** with the booking panel already in view. (Manual route: *Continue as demo customer* → location chip **Jaipur** → open the sample business. Both paths are equivalent; the one-click path just avoids fumbling in front of judges.)
2. **Book.** In the booking panel choose **Signature Haircut & Styling**, tomorrow’s date and an offered slot. The details step itemises service, staff, 18% GST and the ₹ total before you submit. Press **Confirm demo booking**. Nothing is charged and no SMS or email is sent — the button and the summary both say so.
3. **Ticket.** The success screen shows the QR ticket, the booking reference (`VL-…`), the IST date/time and the ₹ total, plus two amber chips: *Sample only · no business notification sent* and *No payment taken · confirm it in the demo console*. **Download PNG** saves the QR. Close and open **Bookings → Ticket** to show the ticket is retrievable later; the ticket dialog re-renders the same QR at a scannable size.
4. **Show it live, side by side.** In the console header press **Open customer window** (visible only in sample mode). It opens a second window already signed in as the demo customer while this one stays the demo business — the identity is pinned per window, so neither signs the other out. Book there and the console row appears on its own within a second: no refresh, no polling. The header chip flips to **Updated just now** and each row shows when it was received. In one window instead, use `/welcome?role=business` → **Continue as demo business**; the booking is already listed. Either way the header shows a **Demo tenant** chip and the console scope picker.
5. **Confirm and check in.** In **Appointments**, the newest booking is first. Press **Confirm booking**, then **Verify ticket** and paste the ticket link or token (camera scanning is optional and needs a permission prompt). The verdict lists the customer, service, IST appointment time, status and ₹ price; a second scan returns the already-checked-in state instead of double-counting.
6. **Show the isolation.** With the booking visible, switch the scope picker to another sample business (for example **Apex Physio**): the row disappears and only that business's own rows remain; switch back to **Aurora Luxe** and it returns. Every list is filtered by business id, and a booking made against one business never appears under another. In live mode the same boundary is enforced server-side (`businessScope`), not in the UI — a signed-in owner's console only ever receives that owner's businesses.
7. **Reset between rehearsals.** Demo guide → **Reset sample data**, or the **Reset demo** button on the console dashboard. This clears only `velora-*` browser keys; it cannot touch a database.

## What is real, and what to call sample (say this out loud)

| Shown in the demo | What it actually is |
|---|---|
| Businesses, prices, availability, reviews | Synthetic sample data; every card carries a **Sample** label |
| Booking, QR ticket, check-in | Real app logic running on the local store; the ticket is a demo token, not a provider-signed pass |
| “Updated just now” in the console | A real cross-window update of this browser's sample store — not a server push, and no provider is notified |
| “Live” map tiles / address search | Only with a configured Google key; otherwise the page states the map is unavailable and Jaipur is selected explicitly |
| SMS, email, calendar invites, payments | **Not sent.** The UI says so; no provider is contacted |
| The AI concierge | Rule-based; it may say a model is not configured. It never invents a booking |

Anything above can be demonstrated honestly by pointing at the label on screen. Do not claim a real provider was contacted.

## Presenter tips

- The floating **Demo guide** panel (bottom-left) tracks the five steps (sample business → service + slot + ₹ total → QR ticket → check-in) and links straight to the next action, including a `?focus=<reference>` deep link into the console.
- The **Home** page carries the same one-click **Start with Aurora** card, so a refresh mid-demo does not lose your place.
- The QR is stable per booking: the same ticket renders in the success overlay, in **Bookings → Ticket**, and in the console verification dialog.
- Resize to 375, 768 and 1440 CSS px while presenting; the layouts reflow without horizontal scrolling.

## Browser checks (repeatable)

```bash
npm run lint && npx tsc -b && npm run verify   # 179 app checks + suite totals
LD_LIBRARY_PATH=/tmp/br/libs/lib VELORA_CHROMIUM_PATH=/tmp/chromium npx playwright test
```

The Playwright project drives the same journey at 375, 768 and 1440 CSS px, plus keyboard-only OTP entry, visible focus, reduced motion, axe WCAG AA scans, overflow checks and a per-width sweep of the customer routes. Where a browser binary is unavailable, run the CI job described in [FINAL_REPORT.md](FINAL_REPORT.md) — do not describe local browser QA that did not happen.

## Connected staging walkthrough (requires an operator-owned test project)

1. Back up data, apply the migrations as described in [DEPLOY.md](DEPLOY.md), configure real Supabase Auth/Storage, a QR secret, site origin and optional Google keys, and deploy to staging.
2. Sign up and confirm email if required. Upload your own JPEG/PNG/WebP, enter a real test business address, confirm its map pin, add at least one priced service and publish. Verify the persisted photo, coordinates, hours and services by reloading and editing the business.
3. As a different signed-in customer, book an available INR slot. Verify the persisted record and signed ticket; try a competing booking concurrently and confirm only the available capacity is committed. Check the console and use **Verify ticket** with a scanned/pasted ticket. Confirm an altered, cancelled or old rescheduled ticket fails; a repeat valid check-in reports the existing state.
4. Test denied location permissions, missing/invalid Maps keys, failed uploads and a failed save without accepting false success. In particular: upload an SVG and an oversized file (both rejected before any network call), then simulate a save failure and confirm no launch screen appears. Check email, Calendar and scheduler only if each is actually configured, and distinguish provider acceptance from inbox delivery.

The staging steps above are instructions, not claims that this checkout has contacted those providers.
