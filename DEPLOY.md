# 🚀 Velora — Deployment Guide

This guide covers production deployment for Netlify + Supabase + Google OAuth.

---

## 1. Overview

- **Frontend**: Vite + React, built to `dist/`
- **Backend**: `api/*.js` serverless functions (Vercel + Netlify compatible)
- **Database**: Supabase Postgres (14 tables, RLS, realtime)
- **Images**: 36 real category photos in `public/biz/*.jpg` (zero picsum)
- **Live URL**: https://velora-ai-in.netlify.app

---

## 2. Netlify Setup

### 2.1 Connect Repository
1. In Netlify dashboard → **Add new site → Import from GitHub**
2. Select `Amit-yadav12/Velora_12`
3. Build settings are in `netlify.toml`:
   - Build command: `npm run build`
   - Publish: `dist`
   - Functions: `netlify/functions`

### 2.2 Environment Variables (Netlify → Site settings → Environment variables)

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_GOOGLE_MAPS_API_KEY=<optional-maps-key>
VITE_GOOGLE_CLIENT_ID=<optional-google-oauth-client-id>
VITE_GOOGLE_AUTH_PROXY=<optional-custom-proxy-url>

# Server-side (Netlify Functions)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_ANON_KEY=<anon-key>
GOOGLE_MAPS_API_KEY=<optional>
RESEND_API_KEY=<optional-email>
SENDGRID_API_KEY=<optional-email-fallback>
EMAIL_FROM=Velora <bookings@yourdomain.com>
CRON_SECRET=<random-32-char-secret-for-scheduled-reminders>
BOOKING_HMAC_SECRET=<random-32-char-for-QR-signing>
```

> **Security**: Never commit `.env` files. Use Netlify env UI only.

### 2.3 Functions Adapter
- `netlify.toml` redirects `/api/*` → `/.netlify/functions/api/:splat`
- `netlify/functions/api.js` dynamically loads handlers from `api/*.js`
- `netlify/functions/process-reminders.js` runs every 15 min (see schedule below)

### 2.4 Scheduled Reminders (15-min)
In `netlify.toml`:
```toml
[functions."process-reminders"]
  schedule = "*/15 * * * *"
```
- The function `process-reminders.js` also exports `config.schedule` for compatibility.
- It requires `CRON_SECRET` env — the scheduler injects it automatically.
- Manual trigger: `POST https://your-site.netlify.app/api/process-reminders` with `Authorization: Bearer <CRON_SECRET>`

### 2.5 Deploy
- Push to `main` → Netlify auto-deploys in ~3-5 min.
- If old build persists, run **Deploys → Trigger deploy → Clear cache and deploy site**

---

## 3. Vercel Alternative (Optional)

Vercel works natively with `api/*.js`:
- Build: `npm run build`
- Output: `dist`
- `vercel.json` has SPA rewrite: `/(?!api/).*` → `/index.html`
- Set same env vars in Vercel dashboard.

---

## 4. CI

GitHub Actions workflow `.github/workflows/ci.yml` runs on every push/PR to `main`:
- Node 22, `npm ci`
- `npm run lint`
- `npm run build` (typecheck + Vite build)

---

## 5. Production Checks (Before Push)

```bash
npx tsc -b          # typecheck passes
npm run build       # production build passes
grep -rn picsum src api  # must be empty (zero picsum)
grep -c arena dist/index.html  # must be 0 (no dev-tracking)
```

- Business images must be `/biz/*.jpg`, not `picsum.photos`
- `public/biz/` should contain 36 real JPGs

---

## 6. Supabase Setup (Dashboard Tasks)

### 6-A. Run Migration

1. In Supabase dashboard → **SQL Editor → New query**
2. Paste entire file `supabase/migrations/0001_velora_core.sql`
3. Click **Run**
4. Verify 14 tables created:
   - `profiles`, `businesses`, `business_services`, `business_staff`,
   - `bookings`, `booking_meta`, `booking_history`, `reminders`,
   - `notifications`, `recently_viewed`, `email_log`, `audit_logs`,
   - `idempotency_keys`, `invoices`

### 6-B. Auth Settings

#### Turn OFF Email Confirmation (Recommended for fast onboarding)
1. **Authentication → Configuration → Email Auth**
2. Toggle **Confirm email** → **OFF**
3. Save

> If you keep confirm-email ON, users will see "Check your email" UX after sign-up (handled in `Welcome.tsx`). OFF is smoother for demo.

#### Create Demo Accounts (Auto-provision fallback exists, but manual is faster)
1. **Authentication → Users → Add user**
2. Create:
   - `customer@velora.ai` / `velora123` (auto-confirm)
   - `admin@velora.ai` / `velora123` (auto-confirm)
3. After creation, run in SQL Editor:
```sql
insert into public.profiles (id, email, full_name, role)
values
  ((select id from auth.users where email='customer@velora.ai'), 'customer@velora.ai', 'Demo Customer', 'customer'),
  ((select id from auth.users where email='admin@velora.ai'), 'admin@velora.ai', 'Demo Admin', 'admin')
on conflict (id) do update set role=excluded.role;
```

### 6-C. RLS & Realtime

- RLS is enabled by migration; policies allow public read for businesses/services, owner-only for bookings, owner-scoped reads for `booking_meta`/`booking_history`, and **service-role-only writes** for `reminders`, `email_log`, `audit_logs`, `idempotency_keys` (see `0003_rls_tightening.sql`).
- Realtime: migration adds `bookings`, `notifications`, `reminders`, `businesses`, `booking_history` to `supabase_realtime` publication.
- Verify in **Database → Realtime** that those tables show as enabled.

### 6-D. Storage (Optional, for future uploads)

If you add user uploads later:
1. **Storage → Create bucket** `biz-photos` (public)
2. Set policy: public read, authenticated write.

---

## 7. Google OAuth Setup

Velora supports **native Google OAuth** (Supabase) + **custom proxy fallback**.

### 7-A. Native OAuth (Recommended)

1. **Google Cloud Console** → https://console.cloud.google.com
2. Create project → **APIs & Services → Credentials → Create OAuth client ID**
   - Type: **Web application**
   - Authorized redirect URIs: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
   - Authorized JS origins: `https://velora-ai-in.netlify.app`, `http://localhost:5173`
3. Copy **Client ID** and **Client Secret**
4. **Supabase → Authentication → Providers → Google → Enable**
   - Paste Client ID + Secret
   - Save

5. In your `.env` / Netlify env, you **don't** need `VITE_GOOGLE_CLIENT_ID` for native flow — Supabase handles it. But keep it if you want fallback.

6. In code: `src/lib/googleAuth.ts` → `signInWithGoogleNative()` uses `supabase.auth.signInWithOAuth({provider:'google'})` with `redirectTo: window.location.origin + '/welcome'`

### 7-B. Custom Proxy Fallback (Optional, for advanced setups)

If you run a custom OAuth proxy (e.g., Cloudflare Worker that exchanges code for Supabase session):

1. Set env:
```
VITE_GOOGLE_CLIENT_ID=<google-client-id>
VITE_GOOGLE_AUTH_PROXY=https://your-proxy.workers.dev/auth/google
```
2. Proxy should:
   - Receive `?code=&state=` from Google
   - `state` is base64 JSON: `{origin, appName, supabaseUrl, supabaseAnonKey}`
   - Exchange code for tokens, create Supabase user via `signInWithIdToken`, return HTML that `postMessage`s `{type:'google-auth-success', access_token, refresh_token}` to opener.
3. `src/lib/googleAuth.ts` handles the popup + message listener.

### 7-C. Testing OAuth

1. Go to `/welcome` → **Continue with Google**
2. Popup should open Google consent, then close and redirect to home with session.
3. If popup blocked, fallback link appears.

---

## 8. Post-Deploy Verification

1. **Live site**: https://velora-ai-in.netlify.app
   - Business images should be `/biz/*.jpg`, not `picsum.photos`
   - `/welcome` renders role selection
   - Search works, category filter works

2. **API**:
   - `https://velora-ai-in.netlify.app/api/discover?city=Jaipur` → JSON with `results` array, each with `image_url: /biz/...`
   - `https://velora-ai-in.netlify.app/api/businesses?city=Jaipur` → list
   - `https://velora-ai-in.netlify.app/api/verify-booking?token=...` → validation

3. **Booking flow**:
   - Pick business → service → date → slot → book (as demo customer)
   - Check `bookings` table in Supabase has new row
   - Check `notifications` has confirmation

---

## 9. Troubleshooting

- **Old build still serving picsum**: Netlify → Deploys → Trigger deploy → Clear cache and deploy site. Wait 3-5 min, hard reload.
- **API 404**: Check `netlify.toml` redirects, ensure `netlify/functions/api.js` exists, check function logs in Netlify dashboard.
- **Supabase 401**: Check anon key and service_role key env, RLS policies.
- **Google OAuth fails**: Check redirect URI in Google Console matches Supabase callback, and Supabase provider enabled.
- **Reminders not firing**: Check `CRON_SECRET` set, check function logs, manually POST to `/api/process-reminders` with Bearer token.

---

## 10. Final Checklist for Owner

- [ ] Paste `supabase/migrations/0001_velora_core.sql` into Supabase SQL Editor + Run
- [ ] Paste `supabase/migrations/0002_business_registration_role_lock.sql` into Supabase SQL Editor + Run (business ownership + role lock — REQUIRED for secure business registration)
- [ ] Paste `supabase/migrations/0003_rls_tightening.sql` into Supabase SQL Editor + Run (RLS hardening — REQUIRED: closes the always-true policies on `booking_meta`, `booking_history`, `reminders`, `email_log`, `audit_logs`, `idempotency_keys`, `notifications`; without it the QR payloads / email log / audit trail are readable by anyone holding the anon key)
- [ ] Turn OFF confirm-email (Auth → Configuration → Email Auth)
- [ ] Google OAuth setup per §7-A (native)
- [ ] Set all env vars in Netlify dashboard
- [ ] Trigger deploy → Clear cache and deploy site
- [ ] Test booking on phone: search → business → slot → confirm → verify QR
- [ ] Check email_log table for confirmation emails

---

## 11. Demo Tenant & Business Registration (New)

### 11-A. Demo tenant isolation

All demo entities live in the browser under `velora-demo-*` / `velora-local-*` localStorage keys, tagged `tenant_id = demo-tenant-velora`:
`velora-demo-businesses`, `velora-demo-services`, `velora-demo-staff`, `velora-demo-customers`, `velora-local-bookings`, `velora-local-invoices`, `velora-local-notifs`.

- The **Demo Customer** and **Demo Business** consoles read/write the SAME demo dataset (bookings made by the demo customer appear on the dashboard instantly, and business actions reflect back to the customer in real time — same tab via CustomEvent, cross-tab via the storage event).
- **Reset demo** (Admin sidebar / Dashboard) clears ONLY the keys above and re-seeds the showcase businesses. Production Supabase data is never touched.
- Demo bookings are created as `pending` and confirmed by the business — the full PENDING → CONFIRMED → COMPLETED / CANCELLED state machine.

### 11-B. Business account registration

`/welcome` → Business → **Create Business Account** (2 steps: owner account → business profile).

- With Supabase configured: the owner signs up, then `POST /api/register-business` (auth token required) grants the `admin` role SERVER-SIDE and creates the `businesses` row (with `owner_user_id`) + starter services.
- Migration `0002` locks roles: profiles can only be inserted as `customer` by clients, and a trigger blocks any role change that isn't from the service role. `admin` can ONLY be granted via `/api/register-business` or `/api/provision-demo` (allowlisted demo emails).
- Demo accounts (`admin@velora.ai` / `customer@velora.ai`, password `velora123`) provision through `/api/provision-demo`.

### 11-C. New API endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/register-business` | session | Business registration; grants console role server-side, creates business + services |
| `POST /api/provision-demo` | public, allowlisted | Provisions the two fixed demo accounts' roles server-side |

### 11-D. Demo verification limits (honest behavior)

- Demo-tenant QR tickets (`local.*` tokens) verify in the browser session where they were booked (the token carries no PII; the booking record is checked for live status). Server bookings use HMAC-signed `v1.*` tokens that verify anywhere.
- Demo-tenant bookings do not send real email (in-app notifications instead). Server bookings queue real email when `RESEND_API_KEY`/`SENDGRID_API_KEY` is set, with a Gmail-compose fallback always available.
