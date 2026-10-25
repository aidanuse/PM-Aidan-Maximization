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

## Field workflow improvements

Open **Field plan** to build a short job-specific sequence, assign responsibility, record prerequisites and technical sources, check the phase, and leave a handover. Phases collapse so a phone shows the work sequence without opening every form. The overview highlights holds, overdue actions and missing job details. “Record today’s work” opens a Daily Sheet for the selected job with its plan and previous handover beside the entry.

Inventory's optional **Product reference** stores a coverage source, checked date, coverage conditions and handling notes. The field plan's optional material planner uses those recorded figures with explicit floor/wall areas, coats, allowance and rounding. Applying a calculation updates the draft job requirement and retains its assumptions; save the field plan to persist it. It does not consume stock or reserve it across jobs.

Daily Sheets have optional phase production measurements. Analysis uses reviewed, confirmed matching-work records and keeps elapsed rates separate from worker-hour rates. Missing or overlapping crew intervals do not produce a labor rate. Historical product and job figures are not calculation defaults. See [curated field knowledge](docs/FIELD-KNOWLEDGE.md) for the source extraction and remaining improvements.

Validate the new workflow after building with `npm run test:field`; use `HARDBOND_BROWSER_RUNTIME=cloudflare npm run test:field` to exercise it against the local Cloudflare runtime. The existing browser suite remains `npm run test:browser`.

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

Use [free Cloudflare hosting](docs/CLOUDFLARE.md), then follow [iPhone installation](docs/IPHONE.md). The Worker serves the app and API, stores records in a persistent SQLite-backed Durable Object, and runs scheduled checks every minute. Free usage limits apply; SMS provider charges are separate. Account connection, production deployment and real phone delivery still need to be completed. The [paid Node hosting alternatives](docs/DEPLOYMENT.md) remain available.

Cloudflare development: `npm run build`, configure an ignored `.dev.vars` using `.dev.vars.example`, then `npm run dev:cloudflare`. Run `npm run test:cloudflare` for the real local runtime checks and `npm run check:cloudflare` for a packaging dry run. Node and Cloudflare use the same validated record/inventory rules.

## Change and maintain it

- `src/App.jsx`: app shell, jobs, daily entry, settings.
- `src/Operations.jsx`: inventory, load checks, calendar, follow-ups, actions, analysis, reminders.
- `server/store-core.js`: shared validated records, stock accounting, backup/restore; `server/store.js` supplies local Node SQLite.
- `cloudflare/worker.js`, `cloudflare/database.js`: Cloudflare login, routing, durable SQLite and scheduled automation.
- `wrangler.jsonc`: free-plan-compatible Cloudflare deployment, bindings, migrations and Cron Trigger.
- `server/integrations.js`: scheduled push/SMS and calendar files.
- `server/calendar-feed.js`: read-only phone subscription.
- `src/api.js`, `public/sw.js`: offline queue, caching, phone push.
- `shared/domain.js`: pure domain rules.

Keep changes on a branch, run the relevant tests, and export a backup before deployment. Credentials belong in hosting secret settings, never in browser code or Git. See `docs/IMPLEMENTATION-CONTRACT.md` for the starting design and `docs/STATUS.md` for actual validation.
