# Windows authenticated TimeTree connection setup

This is the **sign-in and discovery stage**, not a working automatic sync service. It does not upload calendar data or write to TimeTree. TimeTree must permit the access; no login challenges or access controls are bypassed.

1. Install the current Node.js LTS from https://nodejs.org/ if it is not installed.
2. Extract all files in this folder together and double-click `Start-Windows.cmd`. It installs the pinned browser dependency and Chromium.
3. Sign into TimeTree yourself in the browser that opens. Complete any normal login verification.
4. Open your calendar, open an event, and move to another month. Return to the terminal and press Enter.
5. The script writes `%LOCALAPPDATA%\HardbondTimeTree\connection-diagnostics.json`. It contains field names/types and collection counts, not event text or credentials. Share only that file to support implementing the actual event parser.
6. Press Enter again to close the browser. The login session remains in the local `browser-profile` folder, subject to TimeTree expiration.

Do not share the profile folder: it contains sensitive session data. Use your own trusted Windows account. To disconnect, log out of TimeTree inside this browser and close it; delete the `browser-profile` folder if you want to remove the saved session.

Next stages: validate event fields/timezones and calendar filtering against real response structures; implement transfer to HARDBOND with duplicate/conflict protection; test edits, cancellations, date ranges and login expiry; then schedule on Windows. A sleeping/offline PC cannot run scheduled sync. No instant or complete sync is promised by this setup.
