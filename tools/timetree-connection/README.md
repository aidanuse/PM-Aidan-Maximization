# Windows TimeTree pairing and connection checks

This version pairs Windows with HARDBOND and lets you request calendar connection checks from your iPhone. **It does not import events yet.** Actual TimeTree event mapping, timestamps, calendar filtering and complete date coverage need validation from the signed-in response structures.

1. Install Node.js LTS from https://nodejs.org/ if needed, and extract this entire setup folder.
2. Open HARDBOND on Windows → Calendar → TimeTree via Windows → Pair Windows PC. Copy the pairing key. This key grants connector-check access only; it cannot access your jobs or owner account. Do not share it in chat.
3. Double-click `Start-Windows.cmd`. Paste the key into the hidden prompt and press Enter.
4. Sign into TimeTree yourself in the browser that opens. Complete normal login verification. Open your calendar, open an event, and move to another month; press Enter in the terminal.
5. Leave the helper and browser running. On iPhone, use HARDBOND → Calendar → TimeTree via Windows to see online/offline status, request a check, pause/resume five-minute connection checks, or revoke the Windows pairing. A manual check can run while periodic checks are paused. First pairing queues one check; periodic checks start paused.
6. Once a report is received, click Download connection diagnostics in HARDBOND and attach that file in chat. It contains field names, data types and counts—not event text or credential values. The same report is saved at `%LOCALAPPDATA%\HardbondTimeTree\connection-diagnostics.json`.

The PC must stay awake and online with this helper running. After a restart, run Start-Windows.cmd again; it reuses the browser session and pairing key. No background startup task is installed. If sign-in expires, log in again in the helper's browser. Pausing stops future checks, not a browser request already underway; cancelled results are discarded. Pairing rotation revokes the old key.

The pairing key is stored using Windows DPAPI for your Windows account. The browser profile remains local under `%LOCALAPPDATA%\HardbondTimeTree\browser-profile`. Do not share that folder. Disconnect Windows PC revokes access to HARDBOND, but does not log you out of TimeTree. To remove the local TimeTree session, sign out in that browser and close it; delete the profile folder if desired.

Only use your own authorized calendar. This setup does not bypass login challenges. No TimeTree password or login cookies are sent to HARDBOND. Connection reports cannot establish full calendar completeness or successful event sync.

The Windows launcher uses installed Microsoft Edge when found in a standard installation location, skipping the Chromium download. Edge opens with the connector’s separate local browser profile. If Edge is absent, the launcher installs Chromium.
