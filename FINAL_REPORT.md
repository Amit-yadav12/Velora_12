# Velora — engineering report (current revision)

**Stack (unchanged):** React 19 + TypeScript strict + Vite 7 + Supabase Postgres/Auth/Realtime/Storage + serverless `api/*` + Netlify/Vercel.

## Verified on this revision

| Command | Result |
|---|---|
| `npm ci` | ✅ clean install |
| `npm run lint` | ✅ ESLint 9, exit 0, no disables added |
| `npm run build` | ✅ `tsc -b` strict + Vite, 7.27 s |
| `npm run sql:check` | ✅ APPLY_ALL.sql in sync (5 migrations) |
| `npm run verify` | ✅ **419 assertions, 0 failed** — demo 133 + demo-auth 4 + integrations 119 + app 163 |
| `npm audit` | ✅ 0 vulnerabilities |

## What this pass changed

### 1. The launch wizard now works without credentials (and still never lies)
Previously `/onboard` refused to save anything in sample mode ("Supabase is not configured"), so the headline feature of the brief could not be demonstrated or judged. It now writes to the demo tenant that the console, discovery and booking engine already share:

* `saveDemoBusiness` persists the onboarding fields (`photos`, `logo_url`, `lat`/`lng`, `weekly_hours`, `holidays`, `booking_policy`, `amenities`, `active`, `created_via`) — all optional, so records written by earlier builds stay valid.
* `saveDemoBusiness` gained `{ strict }`: a localStorage quota failure now **throws** instead of silently dropping the owner's business, and the wizard shows that message.
* Photos in sample mode are real: the picked file is validated (MIME **and** magic bytes), downscaled to ≤900 px and re-encoded to WebP/JPEG, then stored as a data URL. Thumbnails are badged `LOCAL` and the success screen carries a **Demo tenant** note. Nothing is described as a bucket upload.
* The success screen now states *where* the business went: "Saved in this browser" vs "Saved to your account".

### 2. Two real data bugs found by the new tests
* **The catalogue was being injected into owner-created businesses.** `ensureFullMenus()` re-seeded the category menu onto *every* demo business, so a business created with one ₹1,750 service silently gained six catalogue services — at catalogue prices, bookable by customers. Owner-created records (`created_via: 'onboarding' | 'console'`) are now skipped.
* **Category photos disagreed between three tables.** The image fallback map and the catalogue diverged for `Event Venues` (hotel photo) and `Photography Studios` (coaching photo), and `Electricians` pointed at the tutoring photo, so every electrician except the MI Road sample showed a classroom. Electricians now ship `/biz/electrician.jpg` (the illustrated one is kept for the MI Road sample), and a regression test now asserts that the API catalogue, the client catalogue and the image fallback all resolve to the same file.

### 3. Tests added (38 new assertions)
* Demo-tenant launch (14): saved details, persisted photos, pin/policy, `created_via`, storage-mode detection, owner services without catalogue injection, localStorage round-trip, drafts excluded from discovery, and the four image-validation rejections (spoofed JPEG, SVG, oversized, valid PNG).
* Concurrency (3): two bookings fired in the same tick — exactly one wins, the loser writes nothing, and the refusal says the slot was just taken.
* Launch wizard end-to-end in the real DOM (15): step gating, live preview, photo step, address + manual coordinates, ₹ pricing, review, publish → launch screen, demo-storage disclosure, persistence, "no catalogue injected", next action to the console; plus the draft path persisting as unpublished.
* Category-photo contract (5).

## Not verified here (and why)

No Supabase project, Google API key, browser binary or outbound network in this sandbox. Therefore: live Storage uploads, live Places/Geocoding responses, email/calendar delivery, RLS executed against a real database, camera QR scanning and pixel-level visual QA remain **unverified**; they are covered by code paths, stubs, SQL review and honest-failure assertions only. `npm run verify:launch` exercises the storage-RLS and upload-validation logic without a live bucket.

Required provider configuration for a real deployment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `QR_SIGNING_SECRET`, `APP_URL`, `VITE_APP_URL`, and optionally `VITE_GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_API_KEY`, `RESEND_API_KEY` or `SENDGRID_API_KEY`, `CRON_SECRET`. Secrets must never be `VITE_*`. See `DEPLOY.md`.
