const INTERVAL = 5 * 60_000;
const LIMIT = 1024 * 1024;

// The feed URL is a private runtime secret, never accepted from a browser request.
export function feedUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !host.includes(".") ||
      /[\[\]:]/.test(host) ||
      /^[\d.]+$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function createCalendarFeedSync({ db, env, fetcher, importer, now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS integration_calendar_feed (
    id INTEGER PRIMARY KEY CHECK(id=1), paused INTEGER NOT NULL DEFAULT 1,
    next_check INTEGER NOT NULL DEFAULT 0, lock_until INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT '{}'
  ); INSERT OR IGNORE INTO integration_calendar_feed(id) VALUES(1);`);
  const row = () =>
    db.prepare("SELECT * FROM integration_calendar_feed WHERE id=1").get();
  function status() {
    const value = row();
    return {
      configured: Boolean(feedUrl(env.TIMETREE_FEED_URL)),
      paused: Boolean(value.paused),
      intervalMinutes: 5,
      nextCheck: value.next_check
        ? new Date(value.next_check).toISOString()
        : null,
      ...JSON.parse(value.state),
    };
  }
  function pause(paused) {
    if (typeof paused !== "boolean")
      throw Object.assign(
        new Error("Choose whether automatic sync is paused."),
        { status: 400 },
      );
    db.prepare(
      "UPDATE integration_calendar_feed SET paused=?, next_check=0 WHERE id=1",
    ).run(paused ? 1 : 0);
    return status();
  }
  async function run(force = false) {
    const url = feedUrl(env.TIMETREE_FEED_URL);
    if (!url) return status();
    const stamp = now().getTime();
    const claimed = db
      .prepare(
        "UPDATE integration_calendar_feed SET lock_until=? WHERE id=1 AND lock_until<=? AND (?=1 OR (paused=0 AND next_check<=?))",
      )
      .run(stamp + 120_000, stamp, force ? 1 : 0, stamp);
    if (!claimed.changes) return status();
    const previous = JSON.parse(row().state);
    let state = { ...previous, lastAttempt: new Date(stamp).toISOString() };
    let errorMessage =
      "Calendar feed could not be read. Check the private feed URL and provider access.";
    try {
      const response = await fetcher(url.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "text/calendar" },
      });
      if (!response.ok) {
        errorMessage =
          response.status >= 300 && response.status < 400
            ? "The feed redirects. Configure its final HTTPS subscription URL."
            : `Calendar provider returned HTTP ${response.status}. Check feed access.`;
        throw new Error("feed unavailable");
      }
      if (Number(response.headers.get("content-length")) > LIMIT) {
        await response.body?.cancel();
        errorMessage = "Calendar feed exceeds the 1 MB import limit.";
        throw new Error("large feed");
      }
      if (!response.body) throw new Error("empty feed");
      const reader = response.body.getReader(),
        chunks = [];
      let length = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > LIMIT) {
          await reader.cancel();
          errorMessage = "Calendar feed exceeds the 1 MB import limit.";
          throw new Error("large feed");
        }
        chunks.push(part.value);
      }
      const data = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
      const report = await importer({
        ics: new TextDecoder().decode(data),
        source: "timetree",
        createJobs: true,
        mergeSourceFields: true,
      });
      state = {
        ...state,
        lastSuccess: now().toISOString(),
        lastError: null,
        lastReport: report,
      };
    } catch {
      state = { ...state, lastError: errorMessage };
    } finally {
      db.prepare(
        "UPDATE integration_calendar_feed SET state=?, next_check=?, lock_until=0 WHERE id=1",
      ).run(JSON.stringify(state), now().getTime() + INTERVAL);
    }
    return status();
  }
  return { status, pause, run };
}
