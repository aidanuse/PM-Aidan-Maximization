# HARDBOND Command — account-transfer handoff

Compiled from the conversation and repository checked at commit `9c98e03`. This document is intended to be given to a new Codex chat with repository access. It prioritizes accepted, useful work. Historical and abandoned ideas are excluded except where existing code could mislead the next agent.

## Instructions to the new Codex

You are taking over Aidan's existing HARDBOND Command project. Continue from the actual repository; do not rebuild the app or restart onboarding. Read this handoff, inspect current Git status/main, and verify current code before making claims. Preserve user data and the main framework. Report separately what is implemented, pushed, deployed, connected, and actually verified against real data.

Aidan wants organization, efficiency and simplicity: fewer repeated questions, missing materials, supply trips, forgotten tasks and decisions that rely on memory. Primary device is iPhone. Prefer one clear workflow and capture information once. Reveal optional detail only when useful. He is frustrated by repeated downloads, terminal commands, installation troubleshooting and features described as ready before the underlying integration works. Do not send him through the unsuccessful Windows setup again by default.

Aidan authorized implementation and main-branch pushes for Cloudflare deployment in this conversation. Preserve that history, but check what access is available in this new session. Do not invent credentials, current inventory, live worker availability, manufacturer specifications, connection status, or successful tests. Do not send external messages without appropriate authorization. Prior requests to 'work all night' express a desire for sustained improvement; they do not create an autonomous runtime after a chat ends.

## Business and users

- HARDBOND provides concrete preparation, epoxy/coating and related floor work in the GTA/Southern Ontario.
- Aidan is the project manager; Maxim Nikolaev is the owner.
- Work is shifting toward agency temps, roughly 2–8 workers/day, including first-day workers who may not return.
- Historical names include Daniel Nikolaev and Shahmir. They are not automatically current crew, qualified for every task, or available today. Do not fabricate phone numbers or transport details.
- Use America/Toronto for user-facing schedules.
- Aidan owns the final physical materials check. Inventory calculations are not a substitute.
- TimeTree has been the team schedule. Calendar automation is the outstanding priority.

## Repository, hosting and actual state

- GitHub: https://github.com/aidanuse/PM-Aidan-Maximization
- Production branch: main. User confirmed Cloudflare automatically deploys from main.
- App URL: https://pm-aidan-maximization.maxim-mdnservices.workers.dev
- Calendar route: `/?view=calendar`; crew route: `/?view=crew`.
- Previous workspace: `/workspace/PM-Aidan-Maximization`. Paths in the old chat may not survive account/environment changes.
- Stack: React 19 + Vite; Cloudflare Worker static assets/API; one SQLite-backed Durable Object; shared validated store; optional Express/Node SQLite runtime for development.
- Cloudflare uses a once-per-minute Cron Trigger; individual automation services choose their own intervals. This is not itself proof of any successful external integration.
- Owner authentication, offline queue/cache, stale-version conflict handling and JSON backup/restore exist.
- No native App Store application has been delivered. The app is a home-screen-installable web app.
- No live passwords, provider tokens or owner session are available to transfer in this handoff. Runtime secrets and production records are not in Git.
- Several pushes to main were verified. Live website verification was blocked from the prior execution environment by an HTTP CONNECT 403; do not treat this as proof the site was down or that deployment succeeded.

Useful commits:
- `0d22307`: field planning/material planning/production workflow improvements.
- `c6b6aba`: optional private calendar-feed polling with conflict protection.
- `d4b30d0`: explicit calendar refresh and connection-error handling.
- `3964ad8`: crew routines, 35-card library, clearances, briefs/history/trailer checks and lead releases.
- `971727c`: deferred review reminder and Windows diagnostic setup.
- `fcbf4ea`: phone-managed Windows pairing and connection checks, NOT event transfer.
- `5f47d66`, `9c98e03`: launcher troubleshooting and installed-Edge fallback. These are not completed sync functionality.

## Useful implemented workflows

Existing sections: Overview, Daily Sheets, Crew & routine, Field plan, Jobs, Inventory, Load checks, Calendar, Follow-ups, Action list, Analysis, Reminders, Settings.

Daily Sheets are the central actual job record. Reviewed material consumption changes inventory transactionally. Retried saves do not double-consume; corrections apply net changes, and physical recount protections exist. Drafts do not consume. Never manually subtract the same usage again. Unknown quantities remain unknown.

Jobs contain operational details and materials. Field plans contain ordered phases, responsible people, targets, equipment/staging, prerequisites, technical sources, checks, holds and handovers. The last Daily Sheet appears as context. Lead release requires a completed phase and resolved checks, records a name/time, and clears after phase changes. It is a record of inspection, not proof the inspection occurred. Save phase edits first, then record release.

Inventory supports usable quantities, minimums, locations, exact products, technical source/date, coverage conditions and handling notes. Material planning uses recorded, explicitly applicable source-backed coverage plus floor/wall areas, coats, allowance and unit rounding. It does not reserve or consume stock, automatically verify manufacturer documents, establish compatibility, or infer universal product limits.

Analysis supports measured phases with matching area/time confirmation and distinguishes elapsed productivity from worker-hour productivity. Incomplete/overlapping crew clocks must not become misleading labor rates. Do not invent benchmarks or profitability from inconsistent historical records.

Load checks record physical counts and checkpoints. Actions hold follow-up work. Notification/SMS infrastructure exists, but real current provider setup and physical-device delivery have not been established by this conversation. Do not claim messages were sent because simulated tests passed.

## Crew system and accepted decisions

The operational sequence is: approved task cards → physically organized trailer → minimal assessed roster → per-person day plan → brief and actual reply → morning exceptions → assignment results and job closeout.

- Presets, individual tasks and adjustment of preset order are supported.
- ONE combined brief per person per day, potentially covering multiple jobs. Each assignment links to a job/address; use timing/area/travel notes to remove ambiguity.
- Worker fields include actual contact, role, active status, standing availability, usual transport, private factual notes and per-task clearances.
- Clearances: SOLO, ASSIST, NEVER, NOT ASSESSED. Role is not blanket qualification.
- ASSIST needs a qualified, active, attending supervisor with SOLO clearance; Aidan must confirm coverage at that job without conflicting duties. Scheduling conflicts are not automatically solved.
- Unapproved cards, prohibited/unassessed tasks, missing job/address and readiness gaps block brief dispatch.
- Briefs omit job titles, private job notes and private worker coaching notes; imported titles may contain prices. Common money references are blocked, but free text still needs human review.
- Messages are copied into the user's messaging app. Mark sent only after sending; record confirmed only after the actual reply. There is no automatic SMS/WhatsApp delivery or reply ingestion for briefs.
- Plan changes reset confirmations. Relevant external card/job changes are shown as stale briefs needing resending.
- Results: Pending, Done, Partial, Not done. Partial/Not done require reasons. Assignment history is derived from saved day records; no duplicate history spreadsheet. Recorded assignments are protected from removal even if the result is later reset to pending.
- Completion does not automatically raise clearance.
- Overview explicitly flags missing day plans and unconfirmed/readiness problems.

New record collections: `workers`, `taskCards`, `crewDays`, `trailerChecks`. Schema defaults and backup restore support pre-feature backups.

## Task cards: preserve approval distinctions

35 source cards are available through Load source cards. All ship operationally unapproved. B1 alone retains an owner-FINAL source label from Aidan's November 2 document; the other source cards are drafts. Source status is not an independent technical/safety certification. Corrections must be saved before approval of the saved revision; edits clear approval.

A: A1 unload/staging; A2 power/generator; A3 masking/protection; A4 vacuum setup/bag changes.
B: B1 edges; B2 walls/foundation; B3 stairs/tight areas; B4 main red grinder; B5 tooling changes; B6 crack chasing; B7 demolition/removal; B8 scraping.
C: C1 vacuum support; C2 final floor vacuum; C3 dust/wipe-down; C4 debris/garbage.
D: D1 patching; D2 crack filling; D3 detail repairs.
E: E1 mixing; E2 runner; E3 basecoat/squeegee; E4 cross roll; E5 cutting in; E6 flake broadcast; E7 scrape/reclaim; E8 topcoat; E9 topcoat support.
F: F1 conditions readings; F2 photos; F3 lead prep gate.
G: G1 cleanup; G2 trailer reload; G3 cure barriers/signage; G4 end-of-day report.

Critical unresolved reviews:
- B2 needs Aidan's actual wall method.
- A2 requires equipment-specific electrical/generator review; a brief no-trip test alone does not establish suitability.
- A4/C2 require actual vacuum/filter/bag/dust-control verification; review blanket new-bag rules.
- E1/F1 need exact-product mixing/working limits and appropriate measurement methods.
- E4 mixes cross-roll and squeegee terminology; E6/E9 movement in spike shoes needs review.
- E8/G3 generic one-day foot/two-day vehicle cure wording must become exact-system/condition-specific instructions.
- B4/E3/E4/E8 are restriction/support notices, not full operator procedures. F3 is lead-only and needs concrete acceptance criteria.
- Verify manufacturer TDS/SDS, equipment instructions, product identity and site requirements before approving technical numbers. Do not promote historical ratios, coverage or temperatures to verified defaults.
- Corrected presets place vacuum setup before grinding and wipe-down before final vacuuming. Presets still require job-specific review.

## Trailer system

Use fixed zones/labels, one-time physical layout work, actual job load checks, end-of-day return checks and a weekly audit. Proposed zones: FLOOR, GRIND, VAC-POWER, COAT, FLAKE, MIX, APPLY, REPAIR, CONSUME, SAFETY, TEST. Detailed suggested codes/items are in `shared/trailer-map.json` and displayed in Crew & routine → Trailer checks.

Codes remain PROPOSED until confirmed against actual shelves, safe storage, load securing and access. Copy verified codes into existing Inventory location fields. Store shelf photo references in notes. Do not create another inventory source of truth.

Count usable stock; flag minimums before the last unit is gone. Distinguish shortages from damaged equipment that must not be used. Identify partial kits by product/opening date/job/remaining amount; quarantine unidentified material. Separate dirty tools. Return and weekly check records preserve unchecked items as incomplete. Notes do not automatically create purchase/repair actions or adjust stock; those still require explicit entries in existing Actions/Inventory.

## Daily and weekly operating routine

Once: review needed cards; assess actual workers; physically label/verify trailer; count inventory/set minimums; verify Jobs.

Evening: read handover and open actions; choose tomorrow in Day plan; confirm people/arrival/transport; assign job-specific ordered work and supervision; save; resolve warnings; review/copy/send each brief; record actual replies; physically check the load.

Morning: Overview crew readiness; resolve unconfirmed people, missing plans, changed briefs and operational gaps; check transport/load/access/site conditions; brief workers. Safety/access issues take precedence over routine staffing alerts.

During/before leaving: use Field plan checks and lead releases; save assignment outcomes/reasons; complete and review Daily Sheet actual hours/materials/issues/tomorrow needs; complete trailer return; update stock from actual counts as needed; create owned/due shortage or repair actions; check offline sync.

Weekly: trailer audit/counts/equipment readiness; upcoming jobs/crew/transport/materials; incomplete work and recurring issues in History; deliberate coaching/clearance review; improve and reapprove confusing cards; export backup.

In-app instructions: Crew & routine → How to use. Full guide: `docs/crew-routine.md`.

## Deferred review reminder

The user asked to park operational approvals/improvements while solving calendar sync. `shared/deferred-review.js` supplies Action ID `hardbond-operations-review-2026-11-03`, titled “Return to crew, task-card and trailer approval review.” It has no chosen deadline. The app creates it once after an authenticated online load; an existing completed action is preserved. Overview shows an open reminder. Its notes include all 35 card titles, priority corrections, worker/trailer setup, pilot and future improvements. It was not independently verified against production account data.

## CURRENT PRIORITY: simple calendar updates

Desired experience: Refresh calendar in HARDBOND plus automatic updates every 24 hours, an honest last-success time and clear connection errors; preserve operational edits and avoid duplicate events/jobs. User wants to manage from iPhone with minimal setup.

Latest user direction: abandon Windows troubleshooting and investigate connecting Apple/iCloud Calendar through a subscription feed. This is a preferred direction, NOT an established connection. We have NOT confirmed that the TimeTree work events appear in Apple Calendar or that a usable subscription URL exists. No URL was supplied. The conversation stopped before that verification, then user requested this account-transfer handoff.

Do NOT assume Apple Calendar can export a TimeTree calendar, or that seeing events on an iPhone makes them readable by a web app. Native calendar access would require an appropriately authorized native app. An iCloud Public Calendar subscription is readable by anyone possessing the link; explain that concrete sharing consequence before the user publishes a calendar. A dedicated work calendar may be appropriate. Do not claim a TimeTree iPhone ICS export exists; it was never verified.

Existing supported-feed implementation:
- `server/calendar-sync.js` polls one private HTTPS iCalendar feed configured as runtime secret `TIMETREE_FEED_URL`.
- It currently checks every FIVE MINUTES when enabled, NOT the requested 24-hour interval. Starts paused; manual refresh and pause controls exist.
- UI: Calendar → Automatic calendar feed → Refresh calendar feed. The separately labeled Windows area also remains in the UI.
- No paste-feed-link configuration screen has been built; setup currently requires runtime secret configuration. Apple `webcal://` links would need proper HTTPS handling/normalization; current validator expects HTTPS.
- Incoming feed is different from HARDBOND's outgoing private calendar subscription. Never feed HARDBOND's own subscription back into itself.
- ICS import/export, stable identities, duplicate prevention, persistent source mapping, conflict/source-baseline handling and operational-field preservation exist. Explicit cancellations are flagged; absence is not deletion. Recurrence requires supported occurrence data and currently emits warnings.
- Automatic feed import currently requests job creation for incoming events. Since the original calendar mixed personal and work events, review source scope/filtering before enabling broadly. Do not turn all personal appointments into jobs.
- No real supported feed, authenticated TimeTree read, or real event transfer was verified.

Original private calendar URL (requires its own authorized access): https://timetreeapp.com/calendars/KuVNdUmWh92w

Existing Windows code is INCOMPLETE and not the user's current preferred route:
- `tools/timetree-connection`, `server/timetree-bridge.js`, `src/TimeTreeBridge.jsx` pair a PC and transfer field-name/type diagnostics only.
- `transferEnabled` is explicitly false. There is NO real TimeTree event parser/uploader in that bridge. Pairing, online status, observed responses and successful simulated tests are not evidence of event sync.
- No diagnostic report from Aidan's signed-in calendar was received in this chat.
- User encountered wrong-folder issues and stalled Chromium downloads. Latest launcher stays open and selects installed Edge when detected. These fixes did not finish the integration.
- Do not repeat the ZIP/Node/terminal process or claim this is nearly connected. If simplifying/hiding these controls, preserve records and explain actual remaining capabilities.

Next useful calendar work: establish whether an independently updating work-calendar feed actually exists and includes the intended events; then provide simple in-app connection configuration, test one real import, verify changed events/duplicates/conflicts/timezones, implement the requested daily interval/manual refresh, and expose success status only after real reads. If no usable source exists, state the exact limitation rather than building more setup scaffolding.

## Important field knowledge retained from earlier handoff

See `docs/FIELD-KNOWLEDGE.md` for the curated source extraction. Preserve practical lessons: stage tools/materials before time-critical coating; assign responsibility; identify equipment bottlenecks; check preparation fully before advancing; record honest outputs and next-day needs once. Historical job areas/times overlap and do not justify definitive benchmarks. Historical names, balances, machines and methods are not current verified facts.

Historical product names include LABPOX MVB Fast Cure, LABPOX 85 Platinum/S85, Technopol PU-3060, Geodesmo-50, Hyperdesmo, Ardex Feather Finish, Sika primer/self-leveler, PE-100, PE-VRM, PP-S85 and EVERFLEX 8084. Exact identities/variants and current manufacturer documents must be established. Do not merge similarly named products or reuse generic cure/coverage/ratio assumptions.

Future improvements worth retaining, not immediate scope: saved custom presets; copy previous day with availability/confirmations reset; scheduling conflicts; automatic messaging once supported/configured; linked shortage follow-up; equipment reservations/condition; mobile photo evidence; verified richer product calculations; comparable phase benchmarks. Avoid full HR dossiers, duplicate spreadsheets, automatic clearance promotion and extra checkboxes that do not support a decision.

## Code map and validation

- `src/App.jsx`: navigation, jobs, Daily Sheets, overview/settings, deferred reminder creation.
- `src/Operations.jsx`: inventory/load checks/calendar/actions/analysis/follow-ups/reminders.
- `src/FieldPlan.jsx`, `src/MaterialPlanner.jsx`: planning, lead release, material estimates.
- `src/CrewOperations.jsx`, `src/crew.css`: crew tabs, cards, roster/day plans, briefs/results/history/trailer/guide.
- `shared/crew.js`, `shared/task-library.json`, `shared/trailer-map.json`, `shared/deferred-review.js`: crew rules and retained source content.
- `server/store-core.js`: shared schemas, persistence/version validation, inventory accounting, backups and crew rules.
- `server/integrations.js`, `server/calendar-sync.js`: import/scheduler/feed/provider services.
- `cloudflare/worker.js`, `cloudflare/database.js`, `cloudflare/router.js`, `wrangler.jsonc`: deployed runtime/storage/routes.
- `src/api.js`, `public/sw.js`: offline cache/queue and requests.

Commands: `npm ci`, `npm run build`, `npm test`, `npm run test:cloudflare`, `npm run check:cloudflare`. Browser tests use Python Playwright and Chromium, temporary databases and fictional data. Relevant scripts: `tests/browser_smoke.py`, `tests/field_plan_browser.py`, `tests/crew_browser.py`, `tests/review_reminder_browser.py`, `tests/timetree_bridge_browser.py`. Set `HARDBOND_BROWSER_RUNTIME=cloudflare` where supported.

Last reported full Node suite during bridge work: 57 tests passed; two Cloudflare runtime scenarios passed. Crew, field-plan, reminder and bridge mobile flows were separately exercised. Later launcher/Edge changes received syntax checks; the actual Windows installation and live TimeTree login were NOT successfully verified. Re-run only checks appropriate to new changes.

IMPORTANT: `docs/STATUS.md` and parts of `docs/DECISIONS.md` contain older snapshots, including statements that hosting was not supplied or features were only local. Those are superseded by the known URL, user-confirmed main auto-deployment and recorded pushes above. Use Git/current code plus actual live verification to resolve discrepancies.

## Preserve before losing the account

1. Keep access to the GitHub repo and Cloudflare account. A new ChatGPT/Codex account does not automatically inherit those connections.
2. Export HARDBOND's production JSON backup from Settings while signed in. Git contains application code, not live jobs, inventory, crew records or history. Never overwrite production with a blank/test backup.
3. Preserve owner login and hosting/provider secrets in the user's password manager, not this prompt. Backups omit some integration mappings/state and runtime secrets; confirm their scope before restoring. Calendar sync should be paused/reviewed after restores.
4. Save both original uploaded documents separately if available. Their old conversation attachment IDs and workspace paths are not portable account storage. The useful curated extraction and 35-card/trailer libraries are in Git, but they are not full copies of the originals.
5. Save this handoff, connect the repository in the new Codex account and paste the starter instruction below.

Starter instruction: “Continue my existing HARDBOND Command project in aidanuse/PM-Aidan-Maximization. Read docs/CODEX-HANDOFF.md first, inspect current main, and preserve the existing app/data. My immediate priority is a simple calendar feed connection managed from iPhone, with manual refresh and automatic 24-hour updates. No TimeTree connection or transfer is proven. Do not restart Windows troubleshooting or call diagnostic scaffolding a working sync. First establish whether my work events exist in a usable Apple/iCloud or other supported feed. Then implement and verify the smallest real end-to-end connection. Keep the deferred crew/card/trailer approval review available for later. Give accurate status and minimize setup work for me.”
