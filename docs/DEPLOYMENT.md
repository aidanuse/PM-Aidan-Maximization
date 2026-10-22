# New hosting setup for HARDBOND

**For the requested free hosting route, use [Cloudflare setup](CLOUDFLARE.md).** This page describes the optional paid Node/Render route. Do not deploy the original filesystem SQLite backend on ephemeral free Render storage: records can be lost on restarts/redeploys and a sleeping server cannot run reliable scheduled tasks.

The recommended first release is an always-on Render web service with a persistent disk. Render supplies an HTTPS `onrender.com` address, so a custom domain is optional. A paid always-on service and disk may incur charges: review the provider's current price before creating them. This guide and blueprint do not purchase, create, or publish any service.

## 1. Create the host

1. Create a Render account and connect the GitHub repository containing this app.
2. Choose a new Blueprint and select the app branch containing `render.yaml` (or create a Node web service using the values below).
3. Review the plan and disk price. Use an always-on service; a sleeping host cannot reliably deliver scheduled reminders/texts.
4. Set `OWNER_PASSWORD` securely in Render's environment settings. Use a unique password of at least 16 characters. Do not paste it into chat or commit it.
5. Deploy. Wait for `/api/health` to pass, then open the service's own HTTPS address and sign in.

Blueprint settings: Node 24, build `npm ci --include=dev && npm run build`, start `node server/index.js`, `NODE_ENV=production`, `HOST=0.0.0.0`, `DATA_DIR=/var/data`, `TRUST_PROXY=1`, persistent disk mounted at `/var/data`. Render supplies its external HTTPS URL; the app can use `RENDER_EXTERNAL_URL` for push identity and calendar links. Set `PUBLIC_URL` explicitly if using a custom domain.

Keep **one service instance** against this SQLite disk. Multiple instances with independent disks create independent records and automation; this version is not a multi-instance application.

## 2. Confirm the deployed app

- Open the HTTPS URL in a private browser window. Job data must require login.
- Sign in, create a temporary clearly labeled test item/job/draft, restart the service, and confirm they persist. Remove only your own test records afterward.
- Export a private backup and store it separately from the host.
- Confirm Settings shows integration status accurately. A reachable website does not prove push or SMS delivery.

## 3. Connect iPhone notifications

Install via Safari as described in IPHONE.md. Set `PUBLIC_URL` to the HTTPS origin if your provider does not supply `RENDER_EXTERNAL_URL`, or set `VAPID_SUBJECT` to a real `mailto:` contact. Push keys are generated once in the persistent data directory; keep them across redeploys. Do not regenerate them casually because existing device subscriptions depend on them.

Open the installed app, sign in, choose Settings → Enable this device's notifications, then allow notifications. Create one reminder for a few minutes ahead and verify delivery with the app closed. Check provider acceptance in the app if delivery fails. The app distinguishes provider acceptance from proven phone receipt.

## 4. Connect automatic follow-up texts

Create/use a Twilio account and an SMS-capable sending number. Enter these in the hosting environment, securely:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` in international format

After restarting the host, confirm Settings reports the provider connected. Enter Max's and Daniel's **confirmed** recipient numbers in the app, choose the recipient, missing-field rules, evening time and look-ahead period. Inspect the preview, then enable automatic texts. Trial accounts or sender registration requirements can limit delivery; use the provider's setup for the actual account and destination.

The worker attempts one digest per Toronto day, only during the hour after its configured time. Ambiguous network responses are logged and are not blindly retried. An unchanged job-gap set is included at most twice. Pause is available in Settings. Imported TimeTree data must be verified within 24 hours to be eligible. Actual delivery must be tested after the real account is connected; development tests use simulated transports only.

## 5. Connect the phone calendar

In Settings, create a private calendar subscription and choose Add to iPhone Calendar. Keep the URL private: it grants read-only access to your job calendar. Creating a replacement link revokes the old link; Disable subscription stops future access. Apple controls refresh timing.

This feed contains HARDBOND's job dates and local/imported events. It does **not** update the TimeTree team calendar. Import a current ICS file if TimeTree offers it through your account/workflow, or enter/update job details manually. Do not enable automation under the assumption that TimeTree is live-connected.

## Backups and updates

Download JSON backups from Settings. Restore is available through authenticated `POST /api/backup/restore` only into an empty workspace and pauses automatic SMS for recipient/timing review. This restores records, not password, push subscriptions, provider credentials, source mapping/delivery history, or calendar-feed tokens. A full disaster-recovery backup should also preserve the private persistent data directory using the host's disk snapshot or a stopped-service copy, including SQLite sidecar files and VAPID keys. Never copy only the live `.sqlite` file while excluding its WAL.

Before an update: export a backup, run tests/build, review migrations, deploy the selected commit, then validate login, one saved record and integration status. This initial schema creates missing tables on startup; future schema changes need explicit migrations. Do not delete the persistent disk to redeploy.

## Alternative: your own server

`compose.yaml` runs the app plus Caddy HTTPS. Copy `.env.example` to `.env`, enter your domain, ACME contact and owner password privately, point DNS to the host, then run `docker compose up -d --build`. The app container is not published directly; Caddy is the only trusted proxy. Verify port access and DNS before expecting a TLS certificate. Named volumes preserve app data and certificates. This route requires owning and maintaining the server.

## Not yet performed

No hosting account, paid plan, domain purchase, live deployment, App Store publication, SMS account connection, or physical iPhone delivery validation has been performed by building these files.
