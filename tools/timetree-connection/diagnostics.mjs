// Types and field names only. No event content, credential values, IDs or URLs.
export function shape(value, depth = 0) {
  if (depth > 5) return "…";
  if (value === null) return "null";
  if (Array.isArray(value))
    return {
      type: "array",
      count: value.length,
      sample: value.length ? shape(value[0], depth + 1) : null,
    };
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, v]) => [
          // Dynamic map keys can contain private event IDs; retain ordinary schema field names only.
          /^[a-zA-Z_]{1,45}$/.test(key) ? key : "[dynamic key]",
          /token|cookie|password|secret|authorization|email|phone/i.test(key)
            ? "[redacted]"
            : shape(v, depth + 1),
        ]),
    );
  return typeof value;
}
export function isEventResponse(url, status, contentType) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "timetreeapp.com" ||
        u.hostname.endsWith(".timetreeapp.com")) &&
      status === 200 &&
      /json/i.test(contentType) &&
      /(?:^|\/)events?(?:\/|$)/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}
