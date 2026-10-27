# Velora — hackathon demo readiness report

**As of:** 27 October 2026

**Repository:** `Amit-yadav12/Velora_12`

**Branch:** work is on `arena/978b4bc2-velora-12`; it contains a merge of `arena/b85a4704-velora-12` (`cb4de46`) as `a4af8cb`.

**Code head validated here:** `dc82ada` — *feat(demo): per-window demo identity so the console updates live beside a customer window*

**PR:** [#18 — Add real-browser QR demo and responsive accessibility checks](https://github.com/Amit-yadav12/Velora_12/pull/18). Note: PR #18's head branch is `arena/b85a4704-velora-12`, so the commits below are **not** part of that PR until they are pushed there.

## Executive summary

The product was improved in place, not rebuilt. A presenter can now start the exact demo journey with one click from `/welcome`, book a clearly-marked Jaipur sample salon, keep the QR ticket, switch to the demo console, confirm the booking and check the ticket in — all at 375, 768 and 1440 CSS px, keyboard-usable, with honest “sample only” labelling at every step.

This round also fixed a genuine rendering defect found by the screenshot review: card grids mounted below the fold never left framer-motion's `hidden` variant, so **Featured providers, Nearby and Recommended rendered as blank space** on the Home page. Each card now owns a reveal that always resolves (in-view animation plus a 4-second safety timer), and the browser harness waits for animations before capturing or auditing.

The real-time claim is now demonstrable rather than implied. The console header can open a **second window pinned as the demo customer** while the console stays the demo business (`?demoRole=customer` writes a sessionStorage-only session for that tab). Booking there makes the console row appear on its own — no reload — and the scope picker proves the row only belongs to that business's id. A browser test drives exactly that across two windows.

**Merge status:** the upstream branch merge is resolved and committed locally (`a4af8cb`); PR #18 remains open and `UNSTABLE` because of the `velora-ai-com` Netlify checks. No production deployment is claimed.

## Self-assessed rubric (not an independent judging result)

Scores use the same categories and weights for the starting revision (`8659ce07111a45f87e177ab4438dcd7687390834`) and the current head. This is an evidence-based engineering assessment of demo readiness — not a user study, and not a predicted competition result.

| Category | Before | Now | Evidence and remaining deduction |
|---|---:|---:|---|
| Functional completeness (25) | 17 | 23 | Customer booking → QR ticket → history → business confirm → ticket check-in is exercised in real Chromium at three widths, plus one-click demo entry, console scope isolation, a second-window real-time sync test and a demo OTP path. Live reservations and provider-connected operations are still not demonstrated. |
| UX and presentation (20) | 12 | 18 | Clear hierarchy, one primary action per screen, honest sample chips, empty/loading/success states, reduced-motion support, AA-checked contrast, no horizontal overflow, 44 px touch targets on primary actions. No independent visual review on physical devices. |
| Architecture (15) | 10 | 11 | Existing React/Vite/Supabase/API structure preserved. Demo and live data paths stay separate (`hasLiveSession()`); console data is filtered by business id and the server enforces `businessScope`. Vite still reports the pre-existing mixed static/dynamic `demoStore.ts` import warning. |
| Security and trust (15) | 11 | 12 | Tenant-isolation and input suites pass (63 API checks incl. 403s, 30 SQL checks). Sample/demo labelling is consistent and the console never claims a real notification. A live Supabase project, production RLS and real credentials remain unverified. |
| Innovation (10) | 6 | 6 | The marketplace, local-sample mode and QR check-in concept are unchanged; this pass is polish and reliability, not a new capability. |
| Testing, CI and documentation (10) | 5 | 9 | 13 real-browser tests pass locally (journey ×3 widths, keyboard OTP, focus, reduced motion, console scope, single- and two-window real-time pickup, phone console card, route sweep ×3), plus 534 non-browser checks; CI `verify` is green on the preceding commit of this branch. PR #18 still points at the other branch. |
| Potential impact (5) | 3 | 3 | Relevant local-services use case; no customer research or measured outcome. |
| **Total (100)** | **64** | **82** | The increase is supported by executed checks, not by claims of production readiness. |

## What changed in this pass

- **Demo entry point.** `/welcome` and the Home page carry a one-click *Start the demo journey* / *Start with Aurora* card that signs in the demo customer, selects Jaipur and opens the sample business with the booking panel focused — no fumbling in front of judges.
- **QR ticket screen.** The success overlay keeps the QR available after confetti clears and offers Download PNG / copy link; **Bookings → Ticket** reopens the same QR, reference, IST time and ₹ total.
- **Console scope.** A scope picker (`#console-scope`) focuses one owned business or all of them, with a scoped banner and empty state, so “each business only sees its own bookings” is demonstrable in the sample tenant.
- **Check-in.** The verification dialog lists customer, service, IST time, status and ₹ price, keeps the *Open appointment* / *Next guest* actions, and stays idempotent on a second scan.
- **Honest labels.** Two amber chips on the ticket (*Sample only · no business notification sent*, *No payment taken · confirm it in the demo console*), a **Demo tenant** chip in the console, and sample badges on every synthetic listing.
- **Two-window real-time demo (new).** `pinDemoWindow()` keeps a demo identity in `sessionStorage` for one tab, so `?demoRole=customer` opens beside an admin console without signing it out; the console's *Open customer window* button and a *Sample sync / Updated just now* chip make the update visible. Bookings, services and staff stay in the shared store, and every list remains filtered by business id.
- **Demo/live separation.** `hasLiveSession()` now gates every server call that a local sample cannot satisfy (console data hook, customer/admin notifications, customer bookings list, recently-viewed tracking), so the demo console runs with a clean network log instead of firing 401s.
- **Reveal fix (new).** `Reveal.tsx` replaces the container-level `whileInView` that left below-fold grids invisible; `Grid` is layout-only again.
- **Test reliability.** The browser harness filters axe runs to settled animations (skipping infinite pulse dots) and polls until every card is opaque before taking a full-page screenshot.

## Verification evidence

### Local checks on head `46e3963`

| Check | Result |
|---|---|
| `npx tsc -b` | Clean. |
| `npm run lint` | Clean (0 errors, 0 warnings). |
| `npm run build` | Passed in 7.3 s. Pre-existing warning: `src/lib/demoStore.ts` is both statically and dynamically imported; not a failure. |
| `npm run sql:check` | `supabase/APPLY_ALL.sql is in sync with supabase/migrations/`. |
| `npm run verify` | **534 checks, 0 failed**: demo/demo-auth 133, demo seeds 6, integrations 119, isolated PostgreSQL 30, focused API/input 63, camera 4, app harness 179. Provider-failure lines in the logs are intentional mocked cases. |
| `npm audit --audit-level=high` | 0 vulnerabilities. |
| `git diff --check` | Clean. |
| Playwright (real Chromium) | **13 passed (4.3 min)**: full demo journey at 375 / 768 / 1440, keyboard OTP, focus visibility, reduced motion, console scope isolation, shared-store pickup, phone console card, second-window real-time sync, customer-route sweep ×3 widths. Screenshots under `test-results/browser/<width>/`. |
| Console scope / overflow | Four console routes exercised at all three widths: no horizontal overflow, no page errors; the fixed CDP pass reported `[]` for console errors, warnings and failed requests. |

Commands for the browser run in this sandbox (its Chromium lives outside `node_modules`):

```bash
LD_LIBRARY_PATH=/tmp/br/libs/lib VELORA_CHROMIUM_PATH=/tmp/chromium npx playwright test
```

### Defect found and fixed during this pass

Full-page screenshots of `/` showed *Featured providers*, *Nearby in Jaipur* and *Recommended for you* as blank black bands. DOM inspection proved the cards existed with real text but `opacity: 0`: `Grid` set `initial="hidden"`/`whileInView="show"`, and a grid that mounted below the viewport never received the in-view callback, so its children stayed in the `hidden` variant forever. Fixed in `46e3963` by giving every `BusinessCard`/`DiscoverCard` its own `Reveal` (IntersectionObserver + 4 s safety timer + reduced-motion short-circuit). Verified by re-declaring the earlier hostile scroll (one jump to the bottom, back to the top) and by the re-captured evidence screenshots, which now show all 3 Featured, 8 Nearby and 8 Recommended cards at 375, 768 and 1440.

### Route coverage in the browser suite

`/welcome`, `/onboard`, `/`, `/explore`, `/business/:id` (sample), `/appointments` (list + ticket dialog), `/admin`, `/admin/appointments` (confirm + verify/check-in). Assertions cover overflow, WCAG AA axe scans, touch targets, keyboard operation, reduced motion, customer→console real-time pickup and demo/live labelling.

### GitHub CI

- This branch: run [40568722883](https://github.com/Amit-yadav12/Velora_12/actions/runs/40568722883) — `verify` **success** on `c42be3f` (merge + reveal fix + docs). Run [40570988044](https://github.com/Amit-yadav12/Velora_12/actions/runs/40570988044) covers `dc82ada` (two-window demo) and was still running when this report was written; check its conclusion before quoting it.
- The PR (`arena/b85a4704-velora-12`) has its own green runs: [40485700976](https://github.com/Amit-yadav12/Velora_12/actions/runs/40485700976) and [40485694899](https://github.com/Amit-yadav12/Velora_12/actions/runs/40485694899), which predate the merge, the reveal fix and the two-window demo.
- Netlify: `velora-ai-in` and `velora-ai-os` deploy previews pass; `velora-ai-com` fails `Header rules`, `Pages changed`, `Redirect rules` and `deploy-preview`. Deploy logs show the `.com` site's build aborting before publishing, which is why all three post-processing checks fail together. The `.com` project also inherits a different site configuration than `.in`/`.os`; fixing it needs access to that Netlify project (build settings / base directory / environment), not a repository change. No check was skipped or bypassed, and the deploy-preview hostnames are unreachable from this sandbox, so nothing here is presented as a verified deployment.

## Delivery state and blockers

- **Implemented and committed:** yes, on `arena/978b4bc2-velora-12` (merge `a4af8cb`, reveal fix `46e3963`, docs `c42be3f`, two-window demo `dc82ada`).
- **Pushed:** to `arena/978b4bc2-velora-12` only.
- **PR:** #18 is open against `main` from `arena/b85a4704-velora-12`; it does not yet include these commits.
- **Merged:** the upstream branch is merged *locally* into this branch; PR #18 is **not** merged and remains `UNSTABLE` on the red `.com` checks.
- **Deployed:** no production deployment claimed. Green `.in`/`.os` previews are not production proof.
- **Independently verified:** no live provider, production database, physical device/camera, real customer or production deployment.

**Evidence still needed before any “production-ready” or “100/100” claim:** resolve the `velora-ai-com` Netlify project configuration and re-run its checks; run an operator-owned staging pass with real Supabase/Auth/RLS/storage and concurrent bookings; validate QR signing and check-in against persisted staging rows; confirm any configured email/calendar/maps delivery from provider logs and a test inbox; perform physical-device visual and camera QA; and collect real user/provider feedback with measured outcomes.

## Recent commits

`dc82ada` two-window real-time demo + honest sync chip → `c42be3f` docs refresh → `46e3963` reliable card reveal + settled-animation browser checks → `a4af8cb` merge of `arena/b85a4704-velora-12` → merge-side polish (demo CTA, QR ticket, console scope, honest sample chips) → `cb4de46` upstream docs/report.
