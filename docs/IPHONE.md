# Put HARDBOND on your iPhone

1. Complete [free Cloudflare deployment](CLOUDFLARE.md) and obtain the app's own production HTTPS web address.
2. Open that address in **Safari** on the iPhone.
3. Tap **Share → Add to Home Screen → Add**.
4. Open HARDBOND using the new Home Screen icon and sign in.
5. In Settings, choose **Enable this device's notifications** and allow notifications.
6. Create a short test reminder. Close the app and verify it appears on the phone.
7. Optionally create the private calendar subscription in Settings and add it to Calendar.

Web Push on iPhone requires iOS 16.4 or later and a Home Screen web app. Focus mode, notification settings and connectivity affect delivery. Cloudflare runs the scheduled checks independently of the phone, roughly once a minute; free-tier limits can delay or prevent a cycle. The optional Node hosting route needs an always-on server.

This is a standalone app: ChatGPT is not required to open it, save data or run the hosted automations. It is not currently listed in the App Store. Native App Store distribution would be a later release requiring an Apple Developer account, native packaging and review.

## Offline use

Open the app online at least once to load records and cache the app shell. Drafts and edits can then be saved on the device with a visible pending-sync indicator. Reconnect and check that the queue clears. Conflicts stay visible in Settings; inspect the retained edit before discarding it. Logging out clears locally cached records and pending edits only after a warning when edits exist.

Offline browser storage is not a backup. Clearing website data or removing the app can remove unsynced work. Shared records and scheduled automation live on the host; phone-only edits cannot affect reminders or text generation until they sync.
