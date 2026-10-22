# Free Cloudflare hosting for HARDBOND

This is the recommended deployment for the requested free hosting route. The app, API, private calendar feed, persistent SQLite data and minute-by-minute scheduled checks run on Cloudflare Workers with one SQLite-backed Durable Object. No Render service, disk, D1 database, Pages project, custom domain or paid Workers subscription is needed for this configuration.

Cloudflare's Workers Free plan includes usage limits. It is suitable for a modest personal workspace, not an unlimited service guarantee. Limits are shared with other apps on your account. If a limit is exhausted, operations can fail until it resets; reminders may be delayed or expire. Do not upgrade to a paid plan or enter payment information to follow this guide. If Cloudflare presents an account verification requirement you cannot complete, stop there and report the exact screen.

## 1. Connect the repository

1. Create or sign in to a free account at https://dash.cloudflare.com/.
2. Open **Workers & Pages**, then **Create application** and choose the option to **import/connect a Git repository**. Labels can vary. Choose a **Worker**, not a static Pages-only project.
3. Connect GitHub and authorize only the repository you need: `aidanuse/PM-Aidan-Maximization`.
4. Choose branch `main` and app name `hardbond-command`. Keep the root directory at the repository root.
5. Set **Build command** to `npm run build`.
6. Set **Deploy command** to `npx wrangler deploy`.
7. If prompted for a Node version, use `24`. Cloudflare installs dependencies from the committed npm lockfile. Keep development dependencies available during the build: Wrangler and Vite are build tools.
8. Deploy on the **Workers Free** plan. The checked-in `wrangler.jsonc` supplies the assets, SQLite object binding, schema migration and Cron Trigger automatically.

There is no database ID to paste or SQL migration to run separately. Keep the Worker name, Durable Object binding/class, migration tag and fixed workspace name intact: changing these can point the app at a new empty workspace.

## 2. Set your private password

After the first deployment, open the Worker in Cloudflare:

1. Open **Settings → Variables and Secrets** (sometimes **Variables**).
2. Add a variable of type **Secret**, named `OWNER_PASSWORD`.
3. Set a unique private password of at least **16 characters**. Do not put it in GitHub, build commands, ordinary public variables, or this chat.
4. Save and deploy/apply the secret change as Cloudflare prompts.

This is a **runtime Worker secret**, not just a build environment variable. Until it is set correctly, private records are inaccessible and scheduled automations do not run. The app has no public development login bypass. Changing this secret invalidates session signatures; do not reuse old passwords.

The built frontend is public to download, like any login page. Workspace records, recipient numbers and backups require authentication. Calendar links are a deliberate read-only exception, protected by a random revocable token.

## 3. Open and validate the app

1. Open the app's production HTTPS address shown by Cloudflare, such as `https://hardbond-command.YOUR-SUBDOMAIN.workers.dev`.
2. Sign in with your password. If necessary, enable the Worker's production `workers.dev` address under **Settings → Domains & Routes**.
3. Create a clearly labeled temporary inventory item, job and Daily Sheet. Refresh and confirm they remain saved. Remove only your own test records after checking them.
4. Export a JSON backup from HARDBOND Settings and store it privately elsewhere.
5. In Cloudflare, check the Worker's **Triggers/Cron Triggers** section: the repository configures `* * * * *` (once a minute). Cron changes can take up to 15 minutes to propagate. The code converts each cycle into the timezone configured in the app, defaulting to America/Toronto.

Cloudflare persists the records and private push keys in the Durable Object's SQLite storage across restarts and code deployments. This is separate from browser offline storage. Deleting the Worker/namespace, changing the workspace identity or applying destructive migrations can remove access to data. Normal redeployment does not reset it.

## 4. Install on the iPhone

1. Open the production HTTPS address in **Safari**.
2. Tap **Share → Add to Home Screen → Add**. If offered, leave **Open as Web App** enabled.
3. Open the new HARDBOND icon and sign in.
4. In HARDBOND **Settings**, enable this device's notifications and allow the iOS prompt.
5. Create a reminder a few minutes ahead, close the app and verify the physical phone receives it. Scheduled checks run about once a minute, so delivery is not guaranteed at an exact second.

iPhone Web Push requires iOS 16.4 or later and the installed Home Screen app. Focus mode, notification permissions, network availability and free-tier limits still affect delivery. Provider acceptance in the app is not proof of phone receipt.

No push keys need to be copied manually. The app generates them once and keeps them privately in the persistent workspace. On the first visit to its production HTTPS address, it records the public origin used for push identity and private calendar links. If using a custom domain, set `PUBLIC_URL` as a runtime variable to that exact HTTPS origin and redeploy. An optional real `VAPID_SUBJECT` HTTPS or `mailto:` value can override the push contact identity.

## 5. Calendar and automatic follow-ups

In HARDBOND Settings, create a private calendar subscription and add it to iPhone Calendar. Anyone with that URL can read the calendar; revoke it if it is shared accidentally. Apple controls refresh timing. This feed does not edit the TimeTree team calendar. Use current ICS files if available, or manual job updates. Imported job details older than 24 hours stay excluded from automatic texts until refreshed or explicitly verified.

Automatic SMS is optional and is **not included in free Cloudflare hosting**. A messaging provider can charge for a sender, registration and messages. Keep SMS disabled until you choose that service and check the recipient/preview. To use the existing Twilio adapter, add these as runtime Worker secrets:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

Then enter Max's/Daniel's confirmed international phone numbers privately in HARDBOND Settings, review the rules, preview and local send time, and enable automation. At most one digest is attempted per local day; ambiguous network responses are not automatically retried. No real messages are sent by deployment or automated tests alone.

## Backups and updates

Export a private JSON backup before updates. It includes records, settings and the material-accounting ledger. It does not include passwords, private notification keys, push subscriptions, delivery claims, import mappings or calendar-feed tokens. An authenticated restore into an empty workspace preserves accounting and pauses SMS for review. There is no one-click restore screen yet; the API is `POST /api/backup/restore` with the exported JSON.

Do not delete the Durable Object or rename it to redeploy. Inspect Cloudflare's storage/backup capabilities for full disaster recovery; the JSON export is the portable record backup, not a full clone of every integration state. Keep automatic builds restricted to the production branch you intend to deploy. Once Git deployment is connected, a push to that branch can deploy automatically.

## Local development and checks

Requires Node 22.13+; Node 24 was used for validation.

```sh
npm ci
npm run build
# Copy .dev.vars.example to ignored .dev.vars and set a private test password.
npm run dev:cloudflare
```

Wrangler runs the app and actual local Cloudflare runtime at loopback, with persistent development data under ignored `.wrangler/state`. This data is separate from the production workspace. Do not use real provider credentials in local testing. Do not publish `.dev.vars`.

```sh
npm test
npm run test:cloudflare
npm run check:cloudflare
HARDBOND_BROWSER_RUNTIME=cloudflare npm run test:browser
```

The Cloudflare integration test uses a temporary SQLite workspace and random password, proves persistence by restarting the runtime, and performs no live provider sends. The browser test also uses temporary state. The dry run builds and packages without publishing. Some sandboxes require an explicit writable `XDG_CONFIG_HOME` for Wrangler's local configuration/logs; that directory is a developer setting, not a deployed Worker variable.

Optional command-line deployment from your own computer:

```sh
npx wrangler login
npm run deploy:cloudflare
npx wrangler secret put OWNER_PASSWORD
```

These commands require your Cloudflare login and publish the app. Enter the password only at Wrangler's private prompt. The first deployment is locked until the runtime secret is configured. No Cloudflare account creation, real deployment or physical-device delivery is proven by a local build.

## Provider references

- [Workers plans and pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Durable Objects free plan and storage limits](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Git build/deploy settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cron Trigger setup and propagation](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
