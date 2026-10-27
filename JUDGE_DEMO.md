# Judge walkthrough

## Local sample mode — no credentials (about 3 minutes)

1. Run `npm ci` and `npm run dev`; open the printed URL. With no Supabase variables this is a **local sample**, not a connected production environment.
2. Explore the home and search screens. Sample listings and availability are labelled. Open a sample business, choose a service, a day and an available slot, then sign in as the demo customer if prompted. Confirm the **demo request**. Its ticket, appointment and business console live on this device; they do not reserve a real provider or verify as a real signed ticket.
3. From **Appointments**, open the sample ticket. The QR/verification page identifies the demo; there are no real directions or calendar claims for the sample booking.
4. Sign out and choose **Continue as demo business**. Open **Appointments** in the console to see the local sample request and its lifecycle. Demo check-in remains a sample flow, not proof of server-side signed verification.
5. **Launch a business (the strongest 60 seconds).** Open `/onboard` (or **Create a business account**). Fill **Your business** — the live preview updates as you type; press Continue with an empty name to see the step refuse. Skip photos or add one (it is compressed and badged `LOCAL` in sample mode). On **Location**, type an address, drop the pin, tick the confirmation. On **Services & hours** give the service a real ₹ price. **Review → Publish business**: the launch screen shows the saved profile, address, pin and ₹ services, and the amber **Demo tenant** note stating this is browser storage, not a database. Reload: the business is still there, and it now appears in the demo console at `/admin/businesses` and in demo discovery — but only because it was published.
6. Open the responsive view at 375 px as well as desktop: the wizard, the image grid and the preview stack without sideways scroll.

Map tiles require network access; an unavailable tile provider is reported. Address search and live Google Places need a server Maps key. A local sample cannot establish that any external provider is working.

## Connected staging walkthrough (requires an operator-owned test project)

1. Back up data, apply the migrations as described in [DEPLOY.md](DEPLOY.md), configure real Supabase Auth/Storage, a QR secret, site origin and optional Google keys, and deploy to staging.
2. Sign up and confirm email if required. Upload your own JPEG/PNG/WebP, enter a real test business address, confirm its map pin, add at least one priced service and publish. Verify the persisted photo, coordinates, hours and services by reloading and editing the business.
3. As a different signed-in customer, book an available INR slot. Verify the persisted record and signed ticket; try a competing booking concurrently and confirm only the available capacity is committed. Check the console and use **Verify ticket** with a scanned/pasted ticket. Confirm an altered, cancelled or old rescheduled ticket fails; a repeat valid check-in reports the existing state.
4. Test denied location permissions, missing/invalid Maps keys, failed uploads and a failed save without accepting false success. In particular: upload an SVG and an oversized file (both rejected before any network call), then simulate a save failure and confirm no launch screen appears. Check email, Calendar and scheduler only if each is actually configured, and distinguish provider acceptance from inbox delivery.

The staging steps above are instructions, not claims that this checkout has contacted those providers.
