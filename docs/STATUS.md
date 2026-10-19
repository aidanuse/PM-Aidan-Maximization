# Build status — 2026-10-19

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
- Docker deployment has been prepared but not exercised; managed Node hosting is the recommended route.

## Remaining first-launch steps

Create the new hosting account, connect this repository, review the always-on plan/disk cost, set the owner password securely, and deploy the supplied blueprint. Install from Safari, connect notifications, then configure SMS credentials and confirmed recipient numbers. Follow docs/DEPLOYMENT.md and docs/IPHONE.md. Keep automation paused until its preview and real delivery are checked.

## Planned subsequent iterations

Photo/evidence attachments, verified product calculators, richer job costing and crew-hour analysis, and a supported live team-calendar integration. App Store publication is a separate native-distribution release. The current release is a working first version rather than a claim that every system in the historical PDF has been rebuilt or externally connected.
