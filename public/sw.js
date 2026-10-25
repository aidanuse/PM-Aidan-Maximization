// Offline records must remain usable when the optional notification provider is unavailable.
// Keep the first-party worker installable; notification setup still reports provider failures.
try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (error) {
  console.warn(
    "HARDBOND: notification provider worker unavailable; offline shell remains enabled.",
  );
}

/* Operational records and API/auth responses never enter the service-worker cache. */
const CACHE_NAME = "hardbond-shell-v1";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL);
      const response = await cache.match("/");
      const html = await response.text();
      const assets = [
        ...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g),
      ].map((match) => match[1]);
      await cache.addAll([...new Set(assets)]);
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter(
                (name) =>
                  name.startsWith("hardbond-shell-") && name !== CACHE_NAME,
              )
              .map((name) => caches.delete(name)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (
            response.ok &&
            response.headers.get("content-type")?.includes("text/html")
          ) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/", response.clone());
          }
          return response;
        } catch {
          return (
            (await caches.match("/")) ||
            new Response(
              "Connect to the internet once to install HARDBOND, then reopen the app.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            )
          );
        }
      })(),
    );
    return;
  }
  // Vite output files are content-hashed. Cache only static first-party assets.
  if (
    !url.pathname.startsWith("/assets/") &&
    !url.pathname.startsWith("/icons/") &&
    url.pathname !== "/manifest.webmanifest"
  )
    return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});

function safeUrl(value) {
  try {
    const target = new URL(value || "/", self.location.origin);
    if (
      target.origin === self.location.origin &&
      ["http:", "https:"].includes(target.protocol)
    )
      return target.href;
  } catch {
    /* Ignore malformed or external navigation. */
  }
  return `${self.location.origin}/`;
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {
      body: event.data?.text() || "Open HARDBOND to review your reminders.",
    };
  }
  if (payload.custom?.i || payload.chnl === "OneSignal") return;
  event.waitUntil(
    self.registration.showNotification(
      String(payload.title || "HARDBOND").slice(0, 120),
      {
        body: String(payload.body || "Open your workspace for details.").slice(
          0,
          500,
        ),
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: String(payload.tag || "hardbond-reminder"),
        data: { url: safeUrl(payload.url) },
      },
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeUrl(event.notification.data?.url);
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = open.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        if ("navigate" in existing) await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
