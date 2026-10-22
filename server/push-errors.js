// Only standardized provider codes enter delivery history. Never store response
// bodies, subscription URLs, encryption keys, JWTs or arbitrary exception text.
const reasons = new Set([
  "BadJwtToken",
  "BadVapidPublicKey",
  "VapidPkHashMismatch",
  "BadAuthorization",
  "Unauthorized",
  "Forbidden",
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered",
  "ExpiredToken",
  "BadExpirationDate",
  "BadTtl",
  "BadTTL",
  "BadUrgency",
  "BadTopic",
  "BadCryptoKey",
  "BadEncryption",
  "BadPayload",
  "PayloadEmpty",
  "PayloadTooLarge",
  "TooManyRequests",
  "InternalServerError",
  "ServiceUnavailable",
  "MissingAuthorization",
  "MissingCryptoKeys",
]);

export function providerReason(body) {
  try {
    const reason = JSON.parse(String(body).slice(0, 8192)).reason;
    return reasons.has(reason) ? reason : null;
  } catch {
    return null;
  }
}

export function pushFailureDetail(error) {
  const reason = reasons.has(error.providerReason)
    ? error.providerReason
    : providerReason(error.body);
  const status = Number(error.statusCode);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    const hint =
      status === 401 || status === 403
        ? " Check notification signing keys and reconnect this device in Settings."
        : status === 404 || status === 410
          ? " This subscription has expired; reconnect this device in Settings."
          : status === 429
            ? " The provider is rate limiting requests."
            : "";
    return `HTTP ${status}${reason ? ` (${reason})` : ""}.${hint}`;
  }
  if (error.name === "TimeoutError" || error.name === "AbortError")
    return "Provider request timed out; acceptance is unknown.";
  if (error.pushStage === "prepare")
    return "Notification encryption/signing failed before a network request. Reconnect this device in Settings.";
  return "Request failed without a provider HTTP response; check the host's outbound connection and push configuration.";
}
