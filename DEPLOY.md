# Deployment and safe rollout

## 1. Prepare and back up

- Use Node 22, run the checks in README and deploy frontend/API together. Do not run destructive database resets or re-seed an existing project.
- Back up the Supabase database **and Storage**; rehearse restore and migration in a staging copy with representative historical bookings. Check your existing migration history first.
- For a **fresh** Supabase project only, run `supabase/APPLY_ALL.sql` in the SQL Editor (the ordered, generated 0001–0005 bundle). The bundle refuses to start if `public` already contains RLS policies, tables, views, foreign tables or sequences; do not rerun it after a partial or completed install. The check is not a substitute for reviewing the complete schema and taking a backup. Historical migration **0001 itself drops every public-schema policy** and has no such guard when run directly. Never run it against an existing project or a shared schema. For a project already on 0001–0004, apply **only** `supabase/migrations/0005_launch_security_and_booking.sql`. If its state differs, reconcile it in staging first. No migration is applied automatically by the frontend build.
- 0005 adds columns, RLS/grants, a public `business-media` bucket with owner-folder write policies, transactional save/reservation functions and booking allocations. Existing bookings are retained; historical rows are checked at reservation time. New allocations use a PostgreSQL exclusion constraint and business-row locking. Applying it changes public column grants: direct clients must select named business columns, not `*`.
- Business registration grants an owner the scoped console role only after a successful save. To grant **platform-wide operator** scope, edit the placeholder email in `supabase/PROMOTE_ADMIN.sql` to an already signed-up private account and run it as a trusted database administrator. Existing admin users are not implicitly operators.

## 2. Environment

Use `.env.example` as a template. Set secrets in the hosting provider, not Git or the frontend build.

| Variable | Purpose |
|---|---|
| `APP_URL`, `VITE_APP_URL` | Exact public site origin. QR links, emails, sharing and build-time metadata must point to this deployment. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Public browser project URL/publishable key. Both are required for real Auth and Storage. |
| `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY` | Server database access. Keep the service-role key server-only. |
| `QR_SIGNING_SECRET` | Required for real bookings and verification, at least 32 random characters. Generate independently (`openssl rand -base64 32`) and keep stable; rotation invalidates previously issued signatures. |
| `CRON_SECRET` | Independent random secret for global reminder processing. |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional public Maps JavaScript key; restrict by allowed HTTP referrers and API. |
| `GOOGLE_MAPS_API_KEY` | Optional **server-only** key for Geocoding, Places (Legacy), Place Photos and Distance Matrix (Legacy); restrict APIs and apply platform-appropriate server restrictions. |
| `RESEND_API_KEY`, `SENDGRID_API_KEY`, `SMTP_RELAY_URL`, `EMAIL_FROM` | Optional email provider configuration; first configured provider wins. |
| `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google Calendar OAuth sync. A legacy static access token is also supported but expires. |
| `ALLOWED_ORIGINS` | Optional comma-separated browser origins in addition to `APP_URL`. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional conversational reply enrichment; not involved in reservation validity. |

Enable the appropriate Google Cloud APIs and billing/quota, and test from the deployed host. Browser and server keys have different restrictions. Without a working Maps key, a read-only Google map link may work and manual coordinates remain available, but interactive pin selection, Google address search, provider verification, Places and travel times are unavailable.

### Permissions, Maps and Calendar

- Location is requested only after the user selects **Use my current location** (or refreshed silently if browser permission was already granted). Browsers require HTTPS, a permitted embedding policy and device location services. If denied, change the site permission in the browser and retry; users can instead select a city. GPS centers the map; discovery remains scoped to the selected city.
- Customers can enable browser notifications from Alerts or Settings; business users can use the bell menu. Permission alone does not guarantee delivery. While a live signed-in app is open and connected, it polls the authenticated in-app notifications endpoint every 30 seconds and may display new unread alerts after the initial baseline. These alerts are generic to avoid displaying booking details on a lock screen. This is **not Web Push**: no background alerts when the app is closed, no guaranteed delivery, and sample mode does not send device alerts. Browser/OS notification settings, network failures and sleep can prevent display. Email provider delivery is independent; the old local-only email/push switches never controlled provider delivery and have been removed.
- In Google Cloud, enable billing and the Maps JavaScript API and Maps Embed API for the public browser key; restrict it to approved HTTP referrers (including intended Netlify preview hosts if needed). Enable Geocoding API, Places API (Legacy), and Distance Matrix API (Legacy) on the separate server key used by this code, with suitable server restrictions. Google project eligibility, quota and pricing apply. Discovery defaults to a view-only Google road-map embed centered on the selected coordinates (Google receives those coordinates); the provided embed URL is not an API key and may be blocked by Google or browser/network policy. The nearby results list is separate and sample business locations are not verified pins. An Open in Google Maps link is provided if the embed fails. Live result cards and address search additionally require the server key. The interactive map uses Maps JavaScript when configured; otherwise it shows a read-only Google map. Use manual coordinates for business onboarding when interactive Maps is unavailable. A missing/invalid server key or quota exhaustion produces an unavailable notice, not sample Google results. Google receives map requests, including the visible location; sample mode disables live Places and server address searches. Test invalid keys, quota exhaustion, network failure, selected-city and GPS paths on the actual host.
- The customer **Add to Google Calendar** link opens a prefilled Google event; the customer must save it in Google. It does not establish a connection or confirm the event was saved. Server-side Calendar sync is a separate optional, best-effort integration: enable Google Calendar API; configure an OAuth consent screen, permitted test users/publishing as appropriate, and obtain an offline refresh token with Calendar event write scope for an account authorized to write the chosen calendar. Set `GOOGLE_CALENDAR_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optionally `GOOGLE_CALENDAR_ID` on the server only. Rotate/revoke credentials securely and monitor failures; static access tokens expire. This deployment uses **one shared calendar credential for all businesses**, creates two events per booking in that shared calendar and sends invitations, and does not provide per-business OAuth or isolation. Do not enable it for independent tenants without an approved privacy design and per-tenant integration. Neither a configured key nor a successful booking proves a Calendar event was created. Test only with a staging account and a dedicated test calendar; do not make test bookings on production.
- Google account sign-in remains disabled; Calendar consent, if configured separately by the operator, does not enable app sign-in. No credentials should be pasted into chat or committed.

In Supabase Auth, configure Site URL and the redirect allowlist for your deployed origin, including `/reset-password`. Configure an email provider and test confirmation-email and recovery redirects against a staging project. Google sign-in is intentionally disabled in the UI even if an OAuth provider is configured; enabling it requires a separately implemented and tested flow. The public `business-media` bucket is for public photos, not sensitive documents. Verify bucket MIME, size and owner-folder policies on the real project.

## 3. Hosting

**Netlify:** `netlify.toml` builds `dist`, routes `/api/*` through the functions adapter and schedules `process-reminders` every 15 minutes. Set all environment values in the site configuration. Netlify scheduled functions are not publicly callable by URL; use Netlify's UI to run the scheduled function or wait for its schedule. The wrapper supplies `CRON_SECRET` internally. The separate `/api/process-reminders` endpoint accepts an authenticated user's own due reminders, or a Bearer `CRON_SECRET` for global processing. Never expose that secret in a browser. Deploy previews do not automatically run scheduled functions.

**Vercel:** the `api/*.js` functions and SPA rewrite are provided. Configure the same environment variables and a separate trusted scheduler for `/api/process-reminders` if global reminders are needed; the repository does not configure a Vercel cron.

Email/Calendar/reminder work is best effort after booking commit. A logged unsent message is not automatically retried, and provider acceptance does not guarantee inbox delivery. Add monitoring, retry/alerting, backup and retention policies before production.

## 4. Staging release checklist

- Verify existing records and media remain intact; inspect RLS as anon, customer, two different owners and explicit operator. Ensure cross-tenant writes and direct client role escalation fail.
- Sign up and confirm email; verify Google sign-in remains disabled; publish and edit a real test business. Upload/reorder/remove business photos and add/replace a service photo; verify bucket object ownership, failed upload behavior and public access only for intended images.
- Test Google search, draggable pins, reverse geocoding, map markers, denied GPS permission, invalid keys/quota, and manual fallback. Confirm that owner-confirmed pins are not labelled provider-verified without a match.
- Run true concurrent reservations from independent database sessions at one staff member and with multiple staff, including overlap, cancellations, historical rows, idempotent retry and reschedule. An isolated single-session test alone is insufficient.
- Verify INR prices, dashboard persistence, customer cancellation policy, signed QR scanning/paste, altered tickets, unauthorized check-in, cancellation, reschedule and repeat check-in. Test actual camera permissions on supported devices.
- Independently verify email, Calendar and scheduler with credentials, provider logs and real test inboxes. Do not infer delivery merely from a successful booking.
- Exercise mobile/desktop, keyboard and assistive technology, large and invalid images, API outages, database outage, map tile failure and restrictive network settings. Set distributed rate limits, monitoring and alerts for the intended production load.
