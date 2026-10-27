# Velora — Book Anything, Instantly

**India-first appointment and local-service booking platform.** Customers discover nearby businesses, **compare real ₹ prices side by side**, book a live slot, and walk in with a **signed QR ticket the business verifies at the door**. Businesses run services, staff, availability, appointments, check-in and day-to-day operations from one console.

[![CI](https://github.com/Amit-yadav12/Velora_12/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Amit-yadav12/Velora_12/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-149ECA)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![Vite](https://img.shields.io/badge/Vite-7-646CFF)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ECF8E)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38BDF8)

---

## 1. What this repository is

A React 19 + TypeScript single-page app with serverless API handlers (Netlify Functions locally and in production, Vercel-compatible), Supabase Postgres/Auth/Realtime, and an offline-capable demo tenant so the product is fully explorable **without any credentials**.

Three data sources are deliberately separated and never presented as one another:

| Source | What it is | Where it appears |
|---|---|---|
| **Supabase rows** | Real businesses, services, staff, bookings, invoices, notifications written through the API | Production data |
| **Deterministic synthetic ecosystem** | Generated listings/slots/forecasts for 16 Indian cities (seeded, stable per city+id) | Discovery depth when the DB is empty or unreachable |
| **Demo tenant** | A working sample salon + physio clinic stored in `localStorage`, shared by the customer app and the business console | The judge demo (no login credentials needed) |
| **Live Google Maps places** | Real nearby places via the Places API, hydrated with bookable services | Only when `GOOGLE_MAPS_API_KEY` is configured |

Every listing carries flags (`synthetic`, `live`, `demo`) and the UI labels live/estimated data accordingly. Nothing is silently upgraded from "sample" to "real".

---

## 2. Run it locally

```bash
git clone https://github.com/Amit-yadav12/Velora_12.git
cd Velora_12
npm ci                     # Node ^20.19 || >=22.12 (see "engines" in package.json)
npm run dev                # http://localhost:5173  — SPA + /api/* via dev-api.js
```

No `.env` is required for the demo experience. Without Supabase credentials the app runs in **demo mode** (`src/lib/supabase.js`): auth/profile calls are served by an in-memory client, seeded demo identities work, and every booking/slot path executes for real against the local dataset.

Demo identities (also offered as one-click buttons on `/welcome`):

| Role | Email | Password |
|---|---|---|
| Customer | `customer@velora.ai` | `velora123` |
| Business console | `admin@velora.ai` | `velora123` |

On a **real** Supabase deployment the console role is granted server-side by `/api/provision-demo` (allowlist of those two addresses only) — a browser can never write `role = 'admin'`.

### Environment variables

Copy `.env.example` to `.env`; it is the authoritative, commented list. Summary:

| Variable | Required | Unlocks |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | for persistence | Auth, real rows, realtime (public values) |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | for persistence | Server handlers only — **never** `VITE_`-prefixed |
| `VITE_APP_URL`, `APP_URL` | production | Absolute QR verification and email links |
| `QR_SIGNING_SECRET` | production | HMAC-signed QR tickets (dev falls back with a logged warning) |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` / `SMTP_RELAY_URL` | optional | Real email delivery (otherwise emails are queued + logged) |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | optional | Server-side Google Calendar events |
| `GOOGLE_MAPS_API_KEY` / `VITE_GOOGLE_MAPS_API_KEY` | optional | Places discovery, live travel times |
| `OPENAI_API_KEY` (+ `OPENAI_MODEL`) | optional | Rewording of concierge chat replies only |
| `CRON_SECRET` | production | Protects `/api/process-reminders` |
| `ALLOWED_ORIGINS` | optional | Extra browser origins allowed to call the API |

Anything marked optional has a working, honestly-labelled fallback. The app never reports a delivery that did not happen.

### Database setup

1. Supabase dashboard → SQL Editor → paste [`supabase/APPLY_ALL.sql`](supabase/APPLY_ALL.sql) → Run.
   It is **generated** from `supabase/migrations/` by `npm run sql:bundle` and applies:
   `0001_velora_core` (14 tables, RLS, realtime, triggers) → `0002_business_registration_role_lock` (ownership + role-lock trigger) → `0003_rls_tightening` (removes the always-true anon policies) → `0004_booking_lifecycle` (`pending` status, service-only invoice writes).
2. Run [`supabase/PROMOTE_ADMIN.sql`](supabase/PROMOTE_ADMIN.sql) with your operator email to grant the console role.
3. `npm run sql:check` fails if the bundle drifts from the migrations (CI enforces it).

Full hosting steps (Netlify/Vercel, scheduled reminders, OAuth redirects, troubleshooting): [`DEPLOY.md`](DEPLOY.md).

---

## 3. Architecture

```
src/
  App.tsx                  routes + providers (customer opens directly into the product)
  app/                     CustomerShell, AdminShell, route guards (Guards.tsx)
  pages/customer/          Home, Explore, BusinessDetail, Appointments, Profile, …
  pages/admin/             Dashboard, Appointments, Businesses, Services, Staff, Customers, Emails
  components/premium/      booking timeline, QR ticket/success, heatmap, map, concierge, skeletons
  lib/                     domain + data layer (see below)
  services/                booking submit, console actions, verify, event bus
api/                       serverless handlers (one file per route, shared _lib/)
supabase/migrations/       schema + RLS (mirrored into APPLY_ALL.sql)
scripts/                   verification harnesses (see §7)
netlify/functions/         api-adapter (all /api/*) + scheduled reminders
```

Data flow — one funnel for every screen:

```
                 ┌──────────── /api/discover, /api/businesses … (service role) ───────────┐
Business rows ──►│                                                                          │
Synthetic city ─►│  merge + de-dupe (server wins on id)                                      ├─► enrich()
Demo tenant ────►│  (client mirrors the same merge in src/lib/hybridData.ts)                 │   distance, open-now,
Live places ────►└──────────────────────────────────────────────────────────────────────────┘   next slot, match score
                                                                                                        │
                                                                                       Home / Explore / Detail
```

Key modules:

| Module | Responsibility |
|---|---|
| `src/lib/hybridData.ts` | Single data layer: fetch, merge, enrich, rank, filters, business detail, slots, reviews, heatmap |
| `src/lib/mapData.ts` | Marker contract — normalises nullable domain fields before anything reaches Leaflet |
| `src/lib/demoStore.ts` | Isolated demo tenant (businesses, services, staff, real availability, QR salt) |
| `src/lib/offlineStore.ts` | Local booking/invoice/notification mirror so history and tickets survive a failed request |
| `src/lib/bookingStatus.ts` | The booking state machine (mirrored server-side in `api/bookings.js`) |
| `api/_lib/ist.js` | Asia/Kolkata primitives — the only way server code turns a wall-clock into an instant |
| `api/_lib/qr.js` | `v1.<payload>.<hmac>` ticket signing/verification, deployment-agnostic verify URLs |
| `api/_lib/security.js` | Sanitisation, validation, CORS allowlist, rate limiting, error hygiene |

### Routes

| Path | Access |
|---|---|
| `/` `/explore` `/search` `/business/:id` | Public (guests browse; booking prompts sign-in with a return path) |
| `/appointments` `/notifications` `/profile` `/settings` | Customer |
| `/admin` `/admin/appointments` `/admin/businesses` `/admin/services` `/admin/staff` `/admin/customers` `/admin/emails` `/admin/audit` | Console (`role = 'admin'`, enforced by `AdminGate` **and** by every privileged API route) |
| `/verify/:token` | Public — signed QR verification |
| `/welcome` | Role selection / sign-in |

---

## 4. The booking engine

Customer path: **discover → business → service → optional specialist → date → slot → review details → confirm → ticket → manage**.

- **Availability** is computed from opening hours, the service duration, roster working days/hours and existing non-cancelled bookings. Slots are generated on the **IST wall clock** (`10:00` means 10:00 in Jaipur, on any server and any device) and stored as UTC instants.
- **Capacity** is staff-aware: a named specialist is exclusive; an "any specialist" booking only closes a slot once every active specialist is busy.
- **Server-side validation** (`/api/book`) re-checks the business, service, slot, duration, business hours, past-time and conflicts. The client guard is a convenience, not the authority.
- **Duplicate requests** replay the original response via an idempotency key (`X-Idempotency-Key` / body `idempotency_key`), backed by an in-memory map plus the optional `idempotency_keys` table.
- **Lifecycle**: `pending → confirmed → checked_in → in_progress → completed`, with `cancelled` / `no_show` terminals. The same transition table exists in `src/lib/bookingStatus.ts` and `api/bookings.js`; invalid moves are rejected server-side.
- **Confirmation** returns the booking, GST invoice (18%, document only — see limitations), directions link and a signed QR payload. Email and calendar steps are attempted afterwards and report their real provider state; a Gmail compose link is always available as a fallback.

### Comparing businesses and prices (₹)

Comparing is a first-class surface, not a sort dropdown:

- Any result card can be shortlisted (max 3). The shortlist lives in component state — no accounts, no tracking, no storage.
- The compare sheet shows rating, distance, real availability and the **starting price** per business, then a **service-by-service price matrix** built from the businesses' own catalogues (`src/lib/compare.ts`, pure and unit-tested).
- The cheapest business per service is marked and the **real spread** is quoted in rupees ("Same service, up to ₹300 apart across 2 businesses"). A business that does not list a service shows an em dash — never a fabricated ₹0 or an "estimated" saving.
- Price filtering (`price_max`) and "Price: low" sorting exist on both the server (`/api/discover`) and in the client fallback, so the two paths agree.

### QR tickets and door check-in

`v1.<base64url payload>.<HMAC-SHA256>` contains booking reference, business, service, start time and expiry — no email, phone or user id. `/api/verify-booking` validates the signature with `timingSafeEqual`, enforces expiry, then overlays the live booking status (a cancelled booking fails verification). The verifier only ever receives public fields. `QR_SIGNING_SECRET` must be set in production; without it a warning is logged and a development secret is used.

The **business side** of that ticket is a real flow (`src/services/checkIn.ts` + `src/components/console/CheckInDialog.tsx`):

1. Console → **Appointments → Verify ticket**. Scan with the camera where the browser supports `BarcodeDetector`, or paste the ticket link — the paste path always works, so the flow is testable and never device-dependent.
2. The ticket is verified before anything changes. Server rows go through `PUT /api/bookings { action: 'check_in', ticket }`, which **verifies the signature itself**, refuses a missing ticket, requires staff, requires the ticket's reference to match the row, and re-checks the transition table. A pending request, a cancelled appointment, an expired ticket or an altered code is refused with a message the operator can act on.
3. Success is idempotent: re-scanning the same ticket answers "already checked in" instead of double-flipping state, and both the customer and the console receive a notification. Every check-in is written to `booking_history` and `audit_logs`.
4. Manual check-in (guest lost their phone) is still available from the row action, explicitly labelled as a manual override. The verified path is the one to demo.

### Brand assets

`public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` and `og-image.png` are generated by a committed, deterministic script:

```bash
bash scripts/brand/make-assets.sh      # ImageMagick + the bundled Inter subset
```

The mark is the supplied Velora "V" ribbon: mint→teal gradient with a specular highlight and an indigo/violet ambient glow on deep navy. In the app the same mark is an inline SVG (`src/components/Logo.tsx`), so it renders in sandboxed previews and scales without a network request; the PNGs exist for PWA install, iOS home-screen and social cards. Inter is bundled under the SIL OFL (`scripts/brand/fonts/OFL.txt`).

---

## 5. What "AI" means here (and what it does not)

Velora is honest about this because a judge should be able to check it:

| Capability | Implementation | Honest label in the UI |
|---|---|---|
| Match ranking ("Best match", `ai_score`) | Deterministic weighted heuristic: rating, review volume, distance, open-now, featured, popularity prior, personalisation bumps | "Top match · match 87/100", tooltip states the exact signals |
| Slot recommendation ("Best time") | Deterministic score over availability, estimated crowding and time of day | "Best time · 11:30 am" |
| Availability heatmap / demand estimate | Historical booking buckets in IST blended with a deterministic baseline; `wait_min`/`queue` are estimates | "Estimated occupancy", "estimated wait", with an explicit "not live sensor data" note |
| Concierge | Rule-based intent parsing (book/find/cancel/reschedule/directions/my bookings) over the real data layer, plus a **voice input** progressive enhancement | "Rule-based intent engine; never invents availability" |
| Optional LLM | If `OPENAI_API_KEY` is set, an LLM may reword a *chat* reply. It never creates bookings, prices or availability | Documented here; the UI does not claim a model |

There is no trained ML model in this repository and nothing in the product claims one. Core booking validation never depends on an AI credential.

---

## 6. Security model

- **Auth**: Supabase Auth (email + password). The custom Google OAuth helpers exist in `src/lib/googleAuth.ts` but are deliberately **unwired**; the Google button is inert.
- **Authorisation**: privileged API routes derive the caller from the bearer token (`getAuth`) and require `role = 'admin'` from `profiles`. The console also checks **business ownership** (`businesses.owner_user_id`): an owner only lists and mutates their own appointments; the platform operator (owns no business) sees the estate.
- **RLS**: enabled on every table; `0003` removes the shipped `or true` policies so an anon key cannot read QR payloads, reminders, audit or idempotency rows. `0002` blocks client-side role escalation with a trigger.
- **Service-role key** lives only in server handlers — never in `VITE_*` variables or the bundle.
- **Booking integrity**: server re-validation, capacity-aware conflict checks, idempotency, `pending`/status constraints in the schema.
- **Input/output**: sanitisation and validation helpers, parameterised Supabase queries, generic 500s (driver errors are logged, never returned), 429 rate limiting per IP+route, restrictive CORS once `APP_URL`/`ALLOWED_ORIGINS` is set.
- **Secrets**: `.env*` is git-ignored; only `.env.example` (placeholders) is tracked.

Known residual risks are listed in §9.

---

## 7. Verification

Every check below is runnable offline and wired into CI (`.github/workflows/ci.yml`). The harnesses mount the **real** `src/App.tsx` on a **real** Vite dev server with the **real** `/api/*` handlers, under jsdom.

```bash
npm ci                  # lockfile install
npm run lint            # ESLint 9 (errors fail)
npm run build           # tsc -b (strict) + vite production build
npm run sql:check       # APPLY_ALL.sql matches supabase/migrations/
npm run verify          # = verify:demo + verify:integrations + verify:app
npm audit               # dependency audit
```

| Script | Covers |
|---|---|
| `verify:demo` | Demo tenant seeding, CRUD, capacity/roster availability, double-booking guard, IST round-trip, deactivation, QR verdicts, notification isolation, reset, map-marker contract, demo auth, **check-in planner verdicts (valid / tampered / expired / cancelled / pending / already-checked-in)**, **₹ comparison maths (cheapest cell, real spread, no invented ₹0)** |
| `verify:integrations` | Google Calendar OAuth refresh chain + honest "not configured" path, email provider precedence, QR HMAC/tamper/expiry, **server-side check-in proof (ticket verified, staff-only, ref matched, idempotent, audited, no mutation on failure)**, **IST slot grid & forecast dates**, booking guards, CORS/ownership/error-hygiene, SQL bundle invariants |
| `verify:app` | Real DOM flows: guest landing, business demo → console, customer demo → booking → instant QR, **₹ comparison (shortlist → sheet → remove)**, verification page, live console↔customer updates, **door check-in (bad ticket refused → real ticket checked in → rescan idempotent → pending refused)**, **mobile/375px contract & label audit**, API surface (no 5xx), zero console errors |

`npm run build` runs strict TypeScript over `src/`; the map marker contract
(`src/lib/mapData.ts`) is enforced at compile time and again at runtime in
`verify:demo`.

Current status on this revision: `lint` clean, `build` clean, `sql:check` in sync, **387 assertions passing, 0 failing** across the harnesses (`verify:demo` 99 + demo-auth 4, `verify:integrations` 135, `verify:app` 149), `npm audit` → **0 vulnerabilities**.

See [`FINAL_REPORT.md`](FINAL_REPORT.md) for the engineering report (defects fixed, dependency audit, residual risk).

CI additionally runs in GitHub Actions on every push, and Netlify builds a deploy preview for each PR (evidence that the production build survives the real host; the preview is not visually verified from this environment).

Limitations of the evidence: the harness is jsdom-based (no real browser binary in the CI image), so visual layout is not screenshot-tested; no Supabase project or third-party credentials are available in CI, so database/RLS/email/calendar behaviour is verified through code paths, stubs and honest fallback assertions rather than live calls.

---

## 8. Judge demo (2 minutes, no credentials)

One continuous journey — the same booking appears on both sides of the product.

| # | Do this | What it proves |
|---|---|---|
| 1 | `/welcome` → **Customer → Continue as demo customer** | Role-based entry; the customer app renders for a guest but never exposes the console |
| 2 | **Explore** → tap the compare icon on two results → **Compare 2** | Real ₹ comparison: starting prices, service-by-service matrix, cheapest marked, real spread quoted |
| 3 | Open **Aurora Luxe Salon & Spa** → service → specialist → slot ("Best time" explains itself) → **Review & book** → confirm | Live availability from opening hours + roster + existing bookings, IST-correct, server-revalidated |
| 4 | Success screen: reference, invoice, **QR ticket** → tap the verify link; change one character of it | HMAC signature, expiry and live status; a tampered ticket fails |
| 5 | `/welcome` → **Business → Continue as demo business** → **Appointments** | The customer's booking is already there, live, no reload |
| 6 | **Verify ticket** → paste the torn ticket link → **Verify & check in** | The ticket is the credential: signature verified, booking must belong to this console, state machine enforced, customer notified |
| 7 | Paste the same ticket again; then try an edited one | Idempotent ("already checked in") and tamper-refused — the two things a door actually needs |
| 8 | Console → Services: deactivate one, then check discovery | One shared dataset; customer surfaces update without a reload |

Talking points: capacity-aware double-booking prevention, idempotent booking *and* check-in, IST wall-clock slots on a UTC server, signed QR as a door credential, ownership-scoped authorisation, and the honest heuristic-vs-model split in §5.

Run `npm run verify` to reproduce every claim above as an assertion (387 of them, offline).

---

## 9. Known limitations

- **No payment gateway.** Invoices and GST are documents; no money moves. The product does not claim otherwise.
- **Guest bookings are unverified by email.** Email is required for the booking record, but a guest's address is not proven until the confirmation email is clicked (no verification flow implemented).
- **Concurrency is enforced per API instance.** The slot ledger + DB clash query prevent the realistic double-click/retry races, but two serverless instances can still race in the sub-millisecond window; a single-resource deployment should add the documented Postgres exclusion constraint (see `0004_booking_lifecycle.sql`).
- **Rate limiting is in-memory per instance** (deliberately dependency-free). A shared store (Upstash/Redis) is the production upgrade.
- **Email/calendar need provider credentials.** Without them, emails are queued and logged, and calendar events are reported as "not configured" — never faked.
- **Live Google Places needs a key.** Keyless embeds, directions links and the synthetic ecosystem keep the flows usable.
- **Google sign-in is intentionally inert** in this build.
- **Camera QR scanning is a progressive enhancement.** It appears only where the browser exposes `BarcodeDetector` and a camera (Chromium on Android/desktop; not iOS Safari). Everywhere else — and in the automated tests — the paste path performs the identical verification, so no capability is lost, only the scan convenience.
- **Check-in is per-business by construction.** A genuine ticket for another business's booking is reported as "not in your appointments" rather than checked in; that is deliberate, not a missing feature.
- **The historical demo URL** (`velora-ai-in.netlify.app`) is **not** verified as serving this revision. Deploy from this repository and set `APP_URL`/`VITE_APP_URL` to your own origin — QR links follow the configured origin, not a hardcoded domain.
- **Sample data is sample data.** Synthetic listings, reviews and demand/occupancy figures are generated; they are labelled as such and must not be quoted as real market data.
- **Accessibility** has keyboard focus states, skip links, semantic buttons/labels and reduced-motion support, but has not been audited with a screen reader.

---

## 10. License

MIT — see [LICENSE](LICENSE). Demo identities, brand and the `/biz` photography remain for demonstration use.
