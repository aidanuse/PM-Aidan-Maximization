# HARDBOND Command

A personal, standalone phone-friendly app for Aidan's HARDBOND daily workflow. Install from Safari onto the iPhone Home Screen; no ChatGPT session is required after deployment. This is an installable web app (PWA), not an App Store release.

## Working application

- Private password login and persistent SQLite records.
- Overview, Jobs, Daily Sheets, Inventory, Load Checks, Calendar, Follow-ups, Action List, Analysis, Reminders, and Settings.
- Reviewed Daily Sheets apply material usage once; edits apply the net correction. Drafts do not subtract stock. Unknown opening stock remains unknown. Recounts protect newer stock baselines from older corrections.
- Contextual reminders from tomorrow's needs, plus an evening prompt for scheduled jobs/drafts needing a Daily Sheet.
- iPhone Web Push with persistent keys, expiry, provider acceptance records, and no misleading receipt claims.
- Automatic Twilio SMS digest from missing job fields, editable recipient/time/rules, pause control, same-day deduplication, and a two-attempt limit per unchanged gap set. **No real SMS has been sent during development.**
- ICS calendar import/export with identity-based deduplication and local-edit conflicts. A private revocable calendar subscription lets iPhone Calendar refresh HARDBOND job dates/events automatically.
- Offline record capture and a visible outbox; conflicts preserve device edits for review. Backups include records and inventory ledger, not login/session or messaging credentials.

## Important current boundaries

- **No live TimeTree adapter.** TimeTree is the team source. Obtain an ICS export if your calendar supports one, or enter job details manually. A TimeTree source label does not establish connectivity. Imported jobs older than 24 hours cannot trigger automatic texts until reimported or explicitly verified against the current team calendar.
- The phone subscription updates the phone calendar from HARDBOND; it does not edit TimeTree. Phone calendar refresh timing is controlled by the calendar app.
- HTTPS hosting, a real iPhone push subscription, an SMS provider account and confirmed recipient numbers are required before external delivery works. Local and mocked tests do not validate real phone delivery.
- No product temperature, moisture, cure, mix, or coverage thresholds are assumed. Conditions and exact product records require verified source documents.
- Analysis reports recorded delays, rescue delivery costs, and material use with coverage counts. It does not claim profit or saved hours.
- Photo upload, verified TDS calculators, native App Store distribution and true two-way TimeTree synchronization are not implemented in this version.

## Local development

Requires Node 22.13+ (tested with Node 24). From this directory:

```sh
npm ci
# Set a private OWNER_PASSWORD of at least 12 characters in your shell.
npm run dev
```

Vite runs on port 5173 and proxies the backend on port 3001. For a local-only test environment, `ALLOW_DEV_AUTH=1` permits loopback requests to bypass login; never use that option on a shared deployment. Production refuses to start without an owner password. Data defaults to the ignored `data/` folder.

```sh
npm run build
npm test
npm run test:browser
npm start
```

The browser test uses Python Playwright and `/usr/bin/chromium` (or `CHROMIUM_PATH`), a temporary database, a generated test password, and fictional records. It never uses real SMS credentials. Tests run against the built app; run `npm run build` first.

## Deploy and install

See [new hosting setup](docs/DEPLOYMENT.md) and [iPhone installation](docs/IPHONE.md). A managed Render blueprint (`render.yaml`) and an alternative Docker/Caddy setup are included. Hosting signup/billing and external account connections are not performed by these files. No production URL is assumed.

## Change and maintain it

- `src/App.jsx`: app shell, jobs, daily entry, settings.
- `src/Operations.jsx`: inventory, load checks, calendar, follow-ups, actions, analysis, reminders.
- `server/store.js`: validated records, stock accounting, backup/restore.
- `server/integrations.js`: scheduled push/SMS and calendar files.
- `server/calendar-feed.js`: read-only phone subscription.
- `src/api.js`, `public/sw.js`: offline queue, caching, phone push.
- `shared/domain.js`: pure domain rules.

Keep changes on a branch, run the relevant tests, and export a backup before deployment. Credentials belong in hosting secret settings, never in browser code or Git. See `docs/IMPLEMENTATION-CONTRACT.md` for the starting design and `docs/STATUS.md` for actual validation.
