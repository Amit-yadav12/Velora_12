# Velora — engineering report for this revision

**Branch:** `arena/5a0170f1-velora-12` (from `main` @ `dc719ed`)
**Base stack preserved:** React 19 + TypeScript (strict) + Vite 7 + Supabase Postgres/Auth/Realtime + serverless `api/*` + Netlify/Vercel hosting.

This document records what was actually changed and verified in this pass. It deliberately contains no screenshots of unverified pages, no coverage percentages, no user counts and no live-integration claims that were not exercised.

---

## 1. Verified results

All commands run in this workspace, in this order, on the final working tree:

| Command | Result | Notes |
|---|---|---|
| `npm ci` | ✅ | Lockfile install, 280 packages, **0 vulnerabilities** |
| `npm run lint` | ✅ | ESLint 9, errors fail (no disables added) |
| `npm run build` | ✅ | `tsc -b` strict + Vite production build |
| `npm run sql:check` | ✅ | `APPLY_ALL.sql` in sync with `supabase/migrations/` (4 migrations) |
| `npm run verify:demo` | ✅ 76/76 | Demo engine + demo auth (4/4) |
| `npm run verify:integrations` | ✅ 119/119 | Calendar/email/QR/IST/booking guards/security/SQL invariants |
| `npm run verify:app` | ✅ 119/119 | Real `App.tsx` on a real Vite dev server + real `/api/*` handlers under jsdom |
| `npm audit` | ✅ | 0 vulnerabilities (was 13: 1 critical, 11 high, 1 moderate) |

Evidence limits: jsdom (no browser binary in this sandbox), and no Supabase project, mail provider or Google credentials are available — so database/RLS and provider behaviour are verified through code paths, stubs and honest-fallback assertions, not live calls. The historical demo URL was **not** reachable from this sandbox and is not claimed to serve this revision.

---

## 2. Confirmed defects fixed

### 2.1 Slots were stored 5½ hours late (correctness, primary flow)
`api/_lib/synthetic.js`, `api/business-slots.js`, `api/smart-slots.js` and `src/lib/synthetic.ts` built a "10:00" slot with `new Date('YYYY-MM-DD')` + `setHours(10)` — i.e. **10:00 in the runtime's zone**. Netlify/Vercel run in UTC, so a customer tapping "10:00 am" created a booking at **15:30 IST**, and the label shown came from the host's zone rather than IST.

Fixed with a single IST primitive module (`api/_lib/ist.js`, mirrored by the existing `src/lib/india.ts` + `src/lib/format.ts`): every slot is anchored at `+05:30` and every human-facing time is formatted in `Asia/Kolkata`. Also fixed in the same pass:

* `api/heatmap.js` bucketed bookings by the **UTC** weekday/hour (`getDay()`/`getHours()`), skewing evening bookings into the next day.
* Heatmap/forecast day lists used `toISOString().slice(0,10)` — the UTC date — so between 00:00 and 05:30 IST the whole forecast was a day behind.
* `api/discover.js` and `src/lib/hybridData.ts` computed "next available" with local-time arithmetic while open/closed logic used IST.
* `api/bookings.js` wrote reschedule times into history/notifications/emails with `toLocaleString()` (server zone).
* `api/admin.js` "today" counted UTC days.
* `src/lib/demoStore.ts` labelled slots from the device zone.

Regression coverage: `verify:integrations` §4b (13 assertions incl. "a 10:00 slot is stored as 04:30Z on a UTC host", client/server parity, forecast weekday/date parity) and the existing IST round-trip test in `verify:demo`.

### 2.2 A flaky, self-contradicting regression test
`verify:demo`'s "off-duty specialist blocks their slot" picked "today + 2 days" and asserted a specific staff member was off that day. It passed when that date happened to be a Sunday (the CI run in September) and **failed on any other weekday** — it did so on this checkout. Rewritten to derive both an on-duty and an off-duty date from the roster itself, and to assert both directions (off day → all slots blocked; working day → free slots offered). This is why the suite went 65/1 → 76/0.

### 2.3 `bookings.status` could not represent `pending`
The schema's `CHECK` constraint allowed six values while both the client state machine (`src/lib/bookingStatus.ts`) and the server (`api/bookings.js`) model `pending → confirmed`. Any persisted "booking request" was rejected by Postgres; only the local demo dataset could represent it. Migration `0004_booking_lifecycle.sql` widens the constraint.

### 2.4 `service_id` was always written as `NULL`
`api/book.js` inserted `service_id: null` for every booking, losing the service linkage of real businesses (FK-safe only because synthetic ids are not rows). Now persisted when the service genuinely comes from `business_services`, and kept `NULL` for synthetic/live snapshots.

### 2.5 Idempotency keys were global
The replay cache keyed only on the client-supplied key, so two different customers using the same key could receive each other's booking payload. Keys are now namespaced by the authenticated user id (or the booking email). Covered by a new assertion.

### 2.6 SQL bundle silently dropped new migrations
`scripts/build-sql.mjs` hardcoded a three-file list, so a fourth migration would never reach `APPLY_ALL.sql` (and `sql:check` would still pass). Migration discovery is now filesystem-based and ordered; the invariant test discovers migrations the same way and asserts the `pending` status and service-only invoice writes land in the bundle.

### 2.7 Error internals leaked to clients
Eleven handlers returned `err.message` on 500 (driver/schema detail). All now go through `safeError` (4xx messages pass through, 500s are generic and logged server-side).

### 2.8 Blanket wildcard CORS
`Access-Control-Allow-Origin: *` on every response. Now: echo only configured origins (`APP_URL` / `ALLOWED_ORIGINS`), no header for unknown browser origins, wildcard fallback retained for unconfigured preview/demo deployments so the product stays usable.

### 2.9 Any console user could act on any business's bookings
The console uses one `admin` role for both the platform operator and every business owner, and `GET /api/bookings` returned **all** bookings while mutations only checked `role === 'admin'`. Ownership (`businesses.owner_user_id`) is now resolved server-side: an owner lists and mutates only their own business's appointments; a caller who owns no business is the platform operator. Unauthorised mutations return 403 before any state change.

### 2.10 Invoice rows were writable by anyone
`invoices` shipped with `insert with check (true)`. Tightened to service-role only (they are only ever written by the API).

### 2.11 Misleading product claims
* "AI picked / AI recommends / AI picks" for a deterministic slot-and-listing heuristic → **"Best time", "Top match · match 87/100", "Velora picks"**, each with a tooltip naming the actual signals and an explicit "transparent heuristic, not a trained model".
* "…% loved this week" for a synthetic popularity prior → **"Estimated demand 62/100"**.
* "~12 min wait · 3 in queue" → **"~12 min estimated wait"** with a note that no live sensor feed exists.
* "Open now (live)" was printed for locally derived opening hours → "(live)" only for genuine Google Places listings.
* "Calendar sync" promised in the booking panel regardless of configuration → removed; the README documents when calendar/email actually deliver.
* Heatmap "AI tip" → "Tip", plus "Estimated from booking history and a baseline forecast — not live sensor data."

### 2.12 Map marker contract
The map layer's `MapBusiness` no longer duplicates (and drifts from) the domain model. `src/lib/mapData.ts` owns the marker contract with the nullability made explicit (`ai_score: number | null`, coordinates and rating guaranteed finite), and `toMapBusinesses()` normalises at the data boundary — rows without usable coordinates are dropped instead of being plotted at 0,0 with `undefined` ratings. Covered by 8 runtime assertions (`verify:demo` §15) plus strict compilation.

---

## 3. UX / accessibility changes

* **Explore**: 46 categories no longer pour into one rail — the core set is shown with a "More (36)" toggle, and the active category stays visible. Search input/clear, filters (`aria-expanded`/`aria-controls`), sort and view toggles now carry labels/pressed state.
* **Business detail**: phones got an immediate primary action at the top that jumps to the booking panel (the panel sits below services, photos, forecast and reviews), with `scroll-mt` so the sticky header doesn't cover it. Date field is labelled "(IST)".
* **Modal**: real dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby`), focus moved into the panel and restored on close, Tab cycling trapped, Escape closes, background scroll locked.
* **Home**: greeting uses the IST hour rather than the device clock.
* **Honesty in-place**: the concierge states it is rule-based and that every booking is validated server-side; score badges are labelled and announced for screen readers.
* Existing strengths preserved: design tokens, reduced-motion support, skip link, focus-visible rings, skeleton/empty/error states, keyboard-operable controls.

---

## 4. Dependency security

`npm audit fix` was used **without** `--force`; declared ranges only changed where a security floor was required.

| Package | Before | After | Exposure |
|---|---|---|---|
| `dompurify` (via `jspdf`) | 3.4.11 — **critical** | 3.4.17 | Client (PDF export sanitisation) |
| `react-router-dom` / `react-router` (direct) | 7.13.1 | 7.18.4 | Client routing — several XSS/DoS/open-redirect advisories |
| `vite` (direct, dev) | 7.3.6 | 7.3.7 | Dev server only |
| `postcss`, `undici`, `zod`, `nanoid`, `js-yaml`, `browserslist`, `brace-expansion`, `source-map-js`, `baseline-browser-mapping` | vulnerable versions | patched in-range | Transitive/tooling |

Result: `npm audit` → **0 vulnerabilities**. `package.json` now declares `react-router-dom ^7.18.4` and `vite ^7.3.7` so the patched floor is explicit. No `--force`, no major upgrades, no test or type-checking relaxation.

---

## 5. Still not verified / known limitations

| Item | Status | Why it matters |
|---|---|---|
| Live Netlify deployment serving this revision | **Not verified** | No network access to that host from the sandbox; deploy from this repo and set `APP_URL`/`VITE_APP_URL`. QR links follow the configured origin. |
| Supabase RLS behaviour against a live database | **Not verified** (SQL reviewed, bundle in sync) | Requires a project; `APPLY_ALL.sql` is the tested artefact. |
| Email delivery, Google Calendar events, Places lookups | **Credit-gated** | Code paths verified with stubs; without credentials the app reports "queued"/"not configured" and offers Gmail/ICS fallbacks. |
| Real browser layout at 375/768/1440 px | **Not verified** | jsdom exercises interactions, not pixels. |
| Payment | **Not implemented** | Invoices/GST are documents only. Not presented as a working gateway. |
| Guest email ownership | **Not verified** | No verification link flow; documented. |
| Concurrency across serverless instances | **Best effort** | Slot ledger + DB clash query handle retries/double-clicks; a single-resource deployment should add the documented Postgres exclusion constraint. |
| Rate limiting | **In-memory per instance** | Blunts casual abuse only; documented shared-store upgrade. |
| Screen-reader audit | **Not done** | Semantic HTML and labels improved, no AT audit performed. |

---

## 6. Judge demo (≈3 minutes)

1. `/welcome` → **Customer → Continue as demo customer** (no signup).
2. Home → change city → search "salon" → Explore filters + match score tooltip (it names its own signals).
3. Open **Aurora Luxe Salon & Spa** → service → specialist → pick a slot ("Best time" is explained) → **Review & book** → confirm.
4. Ticket: reference + GST invoice + QR. Open `/verify/<token>` — valid; change one character — rejected; cancel the booking in the console — verification reports "cancelled".
5. `/welcome` → **Business → Continue as demo business** → `/admin`: the same booking is present; confirm it and watch `/appointments` update without a reload.
6. Console → Services: deactivate a service → it disappears from customer discovery immediately. Reset demo when finished.

Questions to expect, and the honest answers: the ranking and slot picker are **documented heuristics** (weights visible in `src/lib/hybridData.ts`, no model); the LLM is optional and only rewrites chat wording; concurrency is guarded by an idempotency key, a capacity-aware slot ledger and a DB clash query, with the documented single-instance caveat; QR verification is HMAC-SHA256 with expiry and a live status overlay; email/calendar are real integrations that degrade transparently when unconfigured.

---

## 7. Scorecard (self-assessment, evidence-based)

| Category | Weight | Assessment | Evidence |
|---|---|---|---|
| Functional correctness | 25% | Strong | 318 assertions, real app + real handlers; end-to-end booking/ticket/console flows green; timezone and idempotency defects fixed |
| UX / design / a11y / responsive | 20% | Good | Coherent design system, real loading/empty/error states, mobile booking entry, dialog semantics, reduced motion; no visual regression testing available |
| Architecture & maintainability | 15% | Strong | Single data layer, shared IST module, single marker contract, state machine mirrored server-side, generated SQL bundle |
| Security & data integrity | 15% | Good | Server-side authz + ownership scoping, RLS tightening, HMAC tickets, CORS allowlist, error hygiene, 0 known dependency vulns; live RLS and cross-instance concurrency unverified |
| Innovation / defensible AI | 10% | Moderate | Transparent heuristic ranking + honest labelling + optional LLM; no trained model, and the product no longer implies one |
| Reproducibility / CI / docs | 10% | Strong | `npm ci` → lint → build → sql:check → verify all green locally and in CI workflow; README/DEPLOY rewritten to match reality |
| Impact clarity | 5% | Moderate | Clear India-first problem framing; no real users or pilots, and none claimed |

Biggest remaining judging risks: no verified live deployment of this revision, no screenshot-verified visual QA, and a demo that relies on the local demo tenant rather than a populated Supabase project.
