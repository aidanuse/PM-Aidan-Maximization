const ONE_SIGNAL_URL = "https://api.onesignal.com/notifications";

export function createOneSignalSender({
  appId,
  apiKey,
  fetcher = globalThis.fetch,
  externalId = "owner",
}) {
  const ready =
    typeof appId === "string" &&
    /^[0-9a-f-]{36}$/i.test(appId) &&
    typeof apiKey === "string" &&
    apiKey.trim().length > 20;

  return {
    ready,
    async send(payload, ttl) {
      if (!ready) throw Object.assign(new Error("OneSignal is not configured"), { pushStage: "prepare" });
      let response;
      try {
        response = await fetcher(ONE_SIGNAL_URL, {
          method: "POST",
          headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            app_id: appId,
            target_channel: "push",
            include_aliases: { external_id: [externalId] },
            headings: { en: payload.title },
            contents: { en: payload.body || payload.title },
            url: payload.url,
            ttl,
          }),
          signal: AbortSignal.timeout(15000),
        });
      } catch (error) {
        error.pushStage = "network";
        error.pushProviderHost = "api.onesignal.com";
        throw error;
      }
      let body = {};
      try {
        body = await response.json();
      } catch {
        /* Keep the HTTP status while avoiding arbitrary response text. */
      }
      if (!response.ok)
        throw Object.assign(new Error("OneSignal rejected the request."), {
          statusCode: response.status,
          providerReason: typeof body.errors?.[0] === "string" ? body.errors[0] : null,
        });
      if (!(Number(body.recipients) > 0))
        throw Object.assign(new Error("OneSignal has no subscribed recipient."), {
          oneSignalNoRecipients: true,
        });
      return body;
    },
  };
}
