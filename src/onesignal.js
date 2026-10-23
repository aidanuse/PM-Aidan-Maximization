const APP_ID = "db1141e9-0d2c-4381-9d56-b224b8621244";
const EXTERNAL_ID = "owner";
let ready;

function queue(callback) {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(callback);
}

export function initOneSignal() {
  if (ready || typeof window === "undefined") return ready;
  ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        ready = undefined;
        reject(new Error("OneSignal could not load. Check the HTTPS deployment and try again."));
      },
      10000,
    );
    queue(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId: APP_ID,
          serviceWorkerPath: "/push/onesignal/OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/push/onesignal/" },
        });
        await OneSignal.login(EXTERNAL_ID);
        clearTimeout(timeout);
        resolve(OneSignal);
        window.dispatchEvent(new CustomEvent("hardbond:onesignal-ready"));
      } catch (error) {
        clearTimeout(timeout);
        ready = undefined;
        reject(error);
      }
    });
  });
  return ready;
}

export async function requestOneSignalPermission() {
  const OneSignal = await initOneSignal();
  await OneSignal.Notifications.requestPermission();
  return OneSignal.User.PushSubscription.id || null;
}

export async function oneSignalSubscriptionId() {
  const OneSignal = await initOneSignal();
  return OneSignal.User.PushSubscription.id || null;
}
