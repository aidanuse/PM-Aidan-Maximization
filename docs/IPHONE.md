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

## If a notification does not arrive

In HARDBOND's Reminders section, use **Notification delivery → Refresh delivery status**. “Device registered” only confirms a saved browser subscription. A failed send can leave the reminder Pending; this history shows the actual attempt and, for new failures, the provider HTTP status and recognized reason code. Old generic log entries cannot be reconstructed.

After a deployment or notification-key change, press **Enable this device’s notifications** again in Settings. The app now compares the browser subscription's key with the server key and reconnects if they differ. This repairs a possible key mismatch; it does not prove that a particular failure was caused by one.

Create a new test reminder three minutes ahead, then wait until two minutes after its due time. Previously failed attempts are not retried automatically, because an interrupted request may already have reached a provider. If the new attempt fails, report its new detail. Do not share passwords, push subscription URLs or private keys. An “accepted” result still requires a physical phone test.

## Offline use

Open the app online at least once to load records and cache the app shell. Drafts and edits can then be saved on the device with a visible pending-sync indicator. Reconnect and check that the queue clears. Conflicts stay visible in Settings; inspect the retained edit before discarding it. Logging out clears locally cached records and pending edits only after a warning when edits exist.

Offline browser storage is not a backup. Clearing website data or removing the app can remove unsynced work. Shared records and scheduled automation live on the host; phone-only edits cannot affect reminders or text generation until they sync.
