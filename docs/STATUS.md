# Build status

## Notification delivery troubleshooting

Reported production logs show failed push attempts, confirming the scheduler ran but not establishing why no provider accepted them. New attempts now retain a safe provider HTTP status/recognized reason code or a preparation/timeout classification. Raw provider bodies and credentials are not saved. Reminders displays the recent notification delivery history with a refresh button. Enabling notifications compares the browser subscription's key with the current server key and replaces a mismatched subscription. This fixes a real stale-key path but does not establish that it caused the reported production failures.

Validation: 27 Node tests and two Cloudflare runtime scenarios passed, including provider reason redaction, encrypted transport, subscription-key matching/replacement, and no duplicate automatic retry. The Cloudflare browser workflow passed. The owner must deploy this update, re-enable notifications and create a new test reminder to verify real iPhone delivery; existing generic error entries cannot reveal their original provider reason.

## Cloudflare adaptation

The free hosting route now uses Workers static assets and API routing, one persistent SQLite-backed Durable Object, and a once-per-minute Cron Trigger. The shared domain store preserves inventory accounting and backup compatibility; the Node/Render route remains optional. Worker login uses a runtime owner secret, native constant-time HMAC verification, signed revocable sessions and persistent rate limiting. No password verifier is stored in the Worker database. Private VAPID keys persist inside the workspace, and encrypted Web Push uses Workers fetch. No filesystem disk or sleeping process is required.

Cloudflare-specific validation:

- Two local Cloudflare runtime scenarios pass: authenticated records, idempotent consumption/corrections/conflicts, scheduled expiry, persistent keys/calendar links and records across runtime restarts, session invalidation on password change, logout and rate limiting; plus actual SQLite rollback and encrypted push generation with a simulated transport. The encrypted payload was decrypted with the test receiver key to verify compatibility. No provider network send occurred.
- The full Chromium browser workflow passes against the Cloudflare backend, including offline save/sync/reopen, mobile layout and server-confirmed logout.
- Cloudflare packaging dry run passes. Real account authentication, deployment, free-tier behavior under load and physical-device delivery are still unverified. A local runtime does not enforce every production quota.
- Follow [Cloudflare deployment](CLOUDFLARE.md) for the current requested route. The previous Render free-tier suggestion did not provide durable storage or reliable scheduling and is not the recommended deployment.

## Implemented and locally exercised

Standalone installable web app with 11 working sections: Overview, Daily Sheets, Jobs, Inventory, Load Checks, Calendar, Follow-ups, Action List, Analysis, Reminders and Settings. Private owner login, persisted SQLite records, editable settings, JSON backup, and record conflicts are implemented.

Daily Sheets connect actual consumption to inventory and tomorrow's needs to contextual reminders. The evening worker prompts for unfinished scheduled jobs or drafts. Automatic SMS runs from explicitly enabled rules and configured provider credentials. Imported job records older than 24 hours are excluded until refreshed or verified. Calendar file import/export and a revocable private phone-calendar subscription are implemented. Offline changes are stored locally, synchronized on reconnect, and retained on conflict.

## Evidence

- `npm test`: **23 passed, 0 failed, 0 skipped**. Includes duplicate material-consumption prevention, corrections/recounts, unknown stock, drafts, backups, authentication/logout, CSRF, calendar subscription updates/revocation, missing load details, timezone scheduling, ICS identity/conflicts, stale imports, evening prompts, SMS deduplication/timeouts, and reminder expiry.
- `npm run build`: production build passed.
- `python tests/browser_smoke.py`: passed in real Chromium using isolated fictional data. Covers private login, creating inventory/job, reviewed Daily Sheet consumption, contextual reminder, persistence after reload, every navigation route, saving settings, 390-pixel phone layout, offline draft save, reconnect synchronization, reopening offline, and logout invalidating access.
- Provider transports in automated tests are simulated. No real SMS or device push was sent.
- Source includes no real job seeds, client records, recipient numbers, deployed password, Twilio credentials or private push keys.

## Not yet verified externally

- Hosting account creation, billing, actual deployment and public HTTPS access.
- Real iPhone Home Screen installation and physical-device notifications.
- Real Twilio account/sender setup, recipient numbers, and SMS delivery.
- iPhone Calendar's refresh behavior with the deployed private feed.
- Live TimeTree read/write access. No live adapter exists in this version; supported workflows are manual job entry and ICS files when available.
- Docker deployment has been prepared but not exercised; Cloudflare is the requested first-launch route.

## Remaining first-launch steps

Create a free Cloudflare account, connect this repository as a Worker, use build `npm run build` and deploy `npx wrangler deploy`, and set `OWNER_PASSWORD` as a private runtime secret. Install from Safari and test a reminder with the app closed. Configure the optional SMS provider and confirmed recipient numbers afterward; SMS may have separate costs. Follow docs/CLOUDFLARE.md and docs/IPHONE.md. Keep text automation paused until its preview and real delivery are checked.

## Planned subsequent iterations

Photo/evidence attachments, verified product calculators, richer job costing and crew-hour analysis, and a supported live team-calendar integration. App Store publication is a separate native-distribution release. The current release is a working first version rather than a claim that every system in the historical PDF has been rebuilt or externally connected.
