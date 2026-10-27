# Velora — Book Anything, Instantly

Velora is an India-first appointment marketplace built with React, TypeScript, Vite, serverless JavaScript APIs and Supabase/PostgreSQL. It contains a local sample experience and a separate, authenticated path for real businesses and bookings. The existing Velora mark and assets are retained.

## Run locally

Requires Node **20.19+** or **22.12+** (CI uses Node 22).

```bash
npm ci
npm run dev -- --host 0.0.0.0
```

With no environment variables, the app runs an **isolated browser demo**: sample businesses, demo roles and sample requests live on the device. They are not real businesses, payments, email deliveries or valid check-in tickets. Shared demo credentials never provision or sign into real accounts on configured projects. See [JUDGE_DEMO.md](JUDGE_DEMO.md) for a short walkthrough.

**The launch wizard works end to end in this mode.** A business you create is genuinely saved to the demo tenant: its details, ₹ services, map pin, hours and the photos you picked survive a refresh, and it appears in the demo console and demo discovery (only once published). Two limits are stated in the UI rather than hidden: photos are compressed and kept in this browser instead of Supabase Storage (each thumbnail is badged `LOCAL`), and the success screen carries a **Demo tenant** note saying nothing was written to a database. With Supabase configured, the same wizard uploads to the `business-media` bucket and writes real rows.

For a real project, copy `.env.example` to `.env` and configure Supabase, a stable QR signing secret and your site origin. See [DEPLOY.md](DEPLOY.md) before applying migrations or enabling integrations. **Do not put a service-role key, server Maps key, email key or OAuth secret in a `VITE_*` variable.**

## Business launch

1. Create or sign into an account and choose **Create a business account** / `/onboard`. A new account remains a customer until the server commits the business and grants its console role. Email confirmation may be required by the Supabase project.
2. The wizard is five steps — **Your business → Photos → Location → Services & hours → Review** — with a live profile preview, per-step validation and a save-draft path. Each step refuses to advance with bad input (no name, no category, invalid ₹ price or duration, missing PIN, unconfirmed pin).
3. Photos: JPEG/PNG/WebP only, validated by magic bytes as well as MIME, 5 MB each, downscaled in the browser before upload, reorderable (the first is the cover) and removable. With no Supabase project they are stored in this browser and labelled `LOCAL`; nothing pretends to be a bucket upload.
4. Publishing shows a launch screen with the real saved profile, address, map pin and ₹ services, plus a single next action. **A save that fails never shows success** — the error names the step to fix.
2. Add the business identity and contact information, an optional logo and gallery, an address and confirmed map pin, services with INR prices/durations, optional staff, weekly opening hours, holidays and booking/cancellation policies. Review and save a private draft or publish. Publication requires a complete address, valid Indian PIN, confirmed coordinates and at least one active service.
3. JPEG, PNG and WebP uploads are limited to 5 MB, signature checked, optionally resized and uploaded to the `business-media` bucket under the authenticated user's folder. The API downloads newly referenced objects to verify owner folder, existence, size and file signature; it preserves unchanged legacy image URLs. Gallery photos can be reordered or removed. Selecting a photo does not prove its subject—owners remain responsible for accuracy and rights.
4. Maps JavaScript uses `VITE_GOOGLE_MAPS_API_KEY` when configured; an attributed OpenStreetMap map is the fallback when tiles are reachable. Google address search, reverse geocoding and Places use the **server** key. Manual coordinates and a confirmation checkbox remain available when search/tiles fail. `owner_confirmed` means only that the owner confirmed the pin; `verified` requires a server Google place-coordinate match.
5. A successful response displays the actual persisted business ID, publication state, location status and preview. The console's Businesses editor reopens the profile; Services and Staff manage their own existing rows so appointments are not deleted. Service photos can also be uploaded/replaced there.

## Booking and check-in

- Only registered active Velora businesses and active services accept real bookings. Google Places listings are discovery-only; demo listings cannot reach the real reservation API.
- Available slots use the business's Asia/Kolkata weekly hours, holidays, service duration and existing non-cancelled occupancy. Active staff provide capacity; **individual staff hours and service-to-staff assignments are not configured for real staff**. If there are no staff, the business has one shared capacity. Overnight hours and staff breaks are not supported.
- Server-side RPCs lock the business, account for historical bookings and enforce an exclusion constraint for new allocations. They commit the booking, listed INR price, invoice, history and notifications together; no GST or payment is invented. Retry keys prevent duplicate requests. The UI must still handle a 409 if another customer reserves a displayed slot first.
- Real QR tickets are HMAC-signed and tied to a persisted booking and time. The verification endpoint rechecks the database; cancelled, altered, expired and rescheduled tickets do not validate. Console check-in requires a valid signed ticket and an authorized owner/operator. Repeating a valid check-in is idempotent. Camera scanning is a progressive enhancement; paste the ticket URL when unsupported.
- Email, Calendar and reminders are **best effort** after a reservation; provider acceptance is not proof of inbox delivery. An unsent email logged without a provider is not automatically retried. Customers can view their saved booking even when integrations fail.

## Access and data

Authentication is Supabase Auth (email and optional Supabase Google OAuth). Server routes authorize each business owner by stable business ID; an owner with no businesses is not a platform operator. Only `profiles.is_operator = true` grants platform scope; use `supabase/PROMOTE_ADMIN.sql` for a private, trusted operator account. RLS restricts client access and public APIs omit owner auth identity. After migration 0005, direct PostgREST consumers must request explicit public business columns rather than `select=*` because owner columns are restricted.

Migration 0005 is intended as an additive upgrade and must be tested on a backup/staging copy. The historical 0001 migration drops **every** RLS policy in the `public` schema; never run it directly against an existing or shared project. The generated fresh-project bootstrap now refuses to run when public policies or relations already exist, and must not be rerun on a partially migrated project. See [DEPLOY.md](DEPLOY.md) for the safe upgrade path. No migration has been applied to a live database here. Public business images in Storage are publicly readable: do not upload private documents. Removing a photo from a profile does not automatically delete its storage object.

## Verification

```bash
npm ci
npm run lint
npm run build
npm run sql:check
npm run verify
npm audit
```

`verify` runs the demo engine/auth suites, mocked integration tests, isolated PGlite migration/security and API regressions, and a jsdom app/API harness. PGlite uses Supabase auth/storage stubs and is **not** a live Supabase project or proof of real concurrent transactions. Browser tests using intercepted responses similarly do not prove an external provider worked. See [FINAL_REPORT.md](FINAL_REPORT.md) for the latest test scope and remaining rollout checks.

## Operational limits

Before production rollout, validate migrations/RLS against a staging Supabase project; test real concurrent reservations, Auth/OAuth, Storage policies, Google key restrictions/quotas and map fallbacks, QR scanning on actual devices, email/Calendar and scheduled reminders. The in-process API rate limiter is per serverless instance, not a distributed abuse-control system. Backups, monitoring, log retention, provider retries, storage cleanup, moderation and a concurrency/load test remain deployment responsibilities.
