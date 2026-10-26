# One-way calendar feed sync

HARDBOND can poll **one supported private HTTPS iCalendar subscription** every five minutes using its existing Node timer or Cloudflare Cron Trigger. This does not supply a TimeTree API, discover private calendars, or make an invitation/webpage into a feed. TimeTree's current export/integration capabilities remain unverified. If it does not expose a supported feed, another supported source or integration is still required.

## Connect

1. Establish that the source calendar provides an automatically updated HTTPS `.ics` subscription. The response must be a VCALENDAR, not a sign-in page. HARDBOND does not sign in to TimeTree or scrape its website.
2. In the **existing Cloudflare Worker**, add the runtime secret `TIMETREE_FEED_URL` with that private subscription URL. Apply/deploy the secret change. Do not paste private feed tokens into chat, source control, or ordinary public variables. Node development can supply the same variable privately in its process environment.
3. Open HARDBOND **Calendar → Automatic calendar feed**. It starts paused. Click **Sync now** and review the timestamps, counts, conflicts and warnings.
4. Enable automatic checks after the source and result are correct. This polls every five minutes; provider refresh schedules and Cron timing add latency. It is not instant delivery.

The app's outgoing calendar subscription is a different feature: it sends HARDBOND dates to a phone. Do not configure that as the incoming feed, which would create a loop. A supported source feed must be independently supplied.

## Update behavior

- Calendar UID plus source identifies records. Repeated reads do not create duplicate jobs. Only one incoming feed is supported; there is no multi-calendar account connection.
- Newly imported jobs are tentative. Supported structured description fields are interpreted by the existing ICS importer. Missing data is not invented.
- Job crew assignments, material requirements, field plans and calculation snapshots are preserved during feed updates. Source-owned fields use the previous source snapshot to preserve local-only edits and report simultaneous conflicting changes.
- Locally edited calendar events are retained and flagged rather than overwritten.
- Explicit cancellations are reported for review, and the job's source verification is cleared so the existing stale-source guard prevents automatic follow-up texts. Missing events are not deleted or treated as cancellations; a feed may use a limited date window. Recurrences require exported individual occurrences and currently generate warnings.
- Unchanged jobs have source verification refreshed within twelve hours rather than changing record versions on every five-minute read. Successful reads and job verification are distinct timestamps. Local source-field overrides are not automatically re-verified.
- Requests have a 15-second timeout, a 1 MB limit and no automatic redirects. The URL must be HTTPS without inline credentials or a nonstandard port. Keep the runtime secret restricted to trusted calendar hosts. URL values and fetch errors containing tokens are not returned to the browser.
- A persistent lease prevents overlapping fetches. Successful reads, failures, report details, pause state and next-check time survive runtime restarts. A failed read retains the last success/report. An interrupted import can have partially applied valid events; review its records before retrying.
- Portable app backups exclude integration mappings, source snapshots and sync state. After a restore, automatic imports retain existing unlinked events as conflicts; inspect the records before explicitly reimporting a reviewed file to establish mapping. The feed secret must be configured separately, and automatic checking starts paused in an empty runtime.

No source calendar is written to. No genuine TimeTree access or real feed has been validated merely by building or deploying this feature.

## Validation

`npm test` covers polling, pause/throttle, persistent state, concurrent leases, duplicate prevention, local-field preservation, conflicting edits, provider failures/redirects, invalid calendars, backup restoration and cancellation/recurrence warnings. Cloudflare tests cover the authenticated status/pause/manual routes with the actual local runtime; browser tests cover the unconfigured setup state. Live operation still requires a real supported subscription.
