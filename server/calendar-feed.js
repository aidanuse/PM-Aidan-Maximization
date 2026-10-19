import { randomBytes, createHash } from "node:crypto";
import { exportCalendar } from "./integrations.js";
const digest = (value) => createHash("sha256").update(value).digest("hex");
export function calendarRecords(store) {
  const jobs = store.getRecords("jobs");
  const records = store
    .getRecords("calendarEvents")
    .filter(
      (event) =>
        !event.jobId ||
        jobs.find((j) => j.id === event.jobId)?.bookingStatus !== "cancelled",
    );
  const events = [...records];
  for (const job of jobs) {
    if (!job.date || job.bookingStatus === "cancelled") continue;
    if (
      records.some(
        (event) =>
          event.jobId === job.id ||
          (job.sourceEventId && event.sourceEventId === job.sourceEventId),
      )
    )
      continue;
    const end = new Date(job.date + "T12:00:00Z");
    end.setUTCDate(end.getUTCDate() + 1);
    events.push({
      id: `job-${job.id}`,
      title: `${job.bookingStatus === "tentative" ? "[Tentative] " : ""}${job.title}`,
      start: job.date,
      end: end.toISOString().slice(0, 10),
      allDay: true,
      location: job.address,
      updatedAt: job.updatedAt,
      description: [
        job.arrivalTime && `Planned arrival: ${job.arrivalTime}`,
        job.system && `System: ${job.system}`,
        job.product && `Product: ${job.product}`,
        job.crew && `Crew: ${job.crew}`,
        job.scope && `Scope: ${job.scope}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
  return events;
}
export function registerCalendarFeed(app, { store, requireAuth, env }) {
  store.db.exec(
    "CREATE TABLE IF NOT EXISTS calendar_feed (id INTEGER PRIMARY KEY CHECK(id=1),token_hash TEXT NOT NULL,created_at TEXT NOT NULL)",
  );
  app.get("/calendar/:token.ics", (req, res) => {
    res.set("Cache-Control", "no-store");
    const token = req.params.token;
    if (
      !/^[A-Za-z0-9_-]{40,100}$/.test(token) ||
      !store.db
        .prepare("SELECT id FROM calendar_feed WHERE token_hash=?")
        .get(digest(token))
    )
      return res.status(404).send("Calendar subscription not found.");
    res.type("text/calendar").send(exportCalendar(calendarRecords(store)));
  });
  app.get(
    "/api/integrations/calendar/subscription",
    requireAuth,
    (_req, res) => {
      const row = store.db
        .prepare("SELECT created_at FROM calendar_feed WHERE id=1")
        .get();
      res.json({ active: !!row, createdAt: row?.created_at || null });
    },
  );
  app.post(
    "/api/integrations/calendar/subscription",
    requireAuth,
    (req, res) => {
      const origin =
        env.PUBLIC_URL || env.APP_ORIGIN || env.RENDER_EXTERNAL_URL;
      let parsed;
      try {
        parsed = new URL(origin);
      } catch {
        return res
          .status(503)
          .json({
            error:
              "Set the app’s public HTTPS address on the host before creating an iPhone calendar subscription.",
          });
      }
      if (parsed.protocol !== "https:")
        return res
          .status(503)
          .json({
            error:
              "A public HTTPS address is required for the phone calendar subscription.",
          });
      const token = randomBytes(32).toString("base64url");
      store.db
        .prepare(
          "INSERT INTO calendar_feed VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at",
        )
        .run(digest(token), new Date().toISOString());
      store.emitAudit("calendar.subscription-created");
      const url = `${parsed.origin}/calendar/${token}.ics`;
      res.json({
        url,
        subscribeUrl: url.replace(/^https:/, "webcal:"),
        detail:
          "Anyone with this private link can read the calendar. Creating a new link invalidates the old one. Your calendar app controls refresh timing.",
      });
    },
  );
  app.delete(
    "/api/integrations/calendar/subscription",
    requireAuth,
    (_req, res) => {
      store.db.prepare("DELETE FROM calendar_feed").run();
      res.json({ active: false });
    },
  );
}
