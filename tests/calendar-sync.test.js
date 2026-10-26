import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { createIntegrationService } from "../server/integrations.js";
import { feedUrl } from "../server/calendar-sync.js";

const calendar = (title = "TEST feed job", extra = "") =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TEST//EN\r\nBEGIN:VEVENT\r\nUID:feed-job@example.com\r\nDTSTART:20261027T120000Z\r\nDTEND:20261027T200000Z\r\nSUMMARY:${title}\r\nLOCATION:TEST address\r\n${extra}END:VEVENT\r\nEND:VCALENDAR\r\n`;
function fixture(t, options = {}) {
  const store = createStore();
  t.after(() => store.close());
  let time = new Date("2026-10-26T10:00:00Z"),
    text = calendar(),
    calls = 0;
  const service = createIntegrationService(
    { ...store },
    {
      vapid: { ready: false },
      env: {
        TIMETREE_FEED_URL:
          "https://calendar.example.com/private-token/feed.ics",
      },
      now: () => time,
      fetch: async (_url, request) => {
        calls++;
        assert.equal(request.redirect, "manual");
        return new Response(text);
      },
      ...options,
    },
  );
  return {
    store,
    service,
    setText: (v) => (text = v),
    setTime: (v) => (time = new Date(v)),
    calls: () => calls,
  };
}
test("feed URL must be HTTPS without inline credentials, local addresses or nonstandard ports", () => {
  for (const url of [
    "http://calendar.example.com/feed",
    "https://127.0.0.1/feed",
    "https://[::1]/feed",
    "https://localhost/feed",
    "https://service.internal/feed",
    "https://u:p@calendar.example.com/feed",
    "https://calendar.example.com:444/feed",
  ])
    assert.equal(feedUrl(url), null);
  assert.ok(feedUrl("https://calendar.example.com/private/feed.ics"));
});
test("automatic sync starts paused, imports once, throttles and survives service recreation", async (t) => {
  const f = fixture(t);
  await f.service.runOnce();
  assert.equal(f.calls(), 0);
  f.service.calendarSync.pause(false);
  await f.service.runOnce();
  assert.equal(f.calls(), 1);
  assert.equal(f.store.getRecords("jobs").length, 1);
  assert.equal(f.service.calendarSync.status().lastReport.jobsCreated, 1);
  await f.service.runOnce();
  assert.equal(f.calls(), 1);
  f.setTime("2026-10-26T10:06:00Z");
  await f.service.runOnce();
  assert.equal(f.calls(), 2);
  assert.equal(f.store.getRecords("jobs").length, 1);
  assert.equal(
    JSON.stringify(f.service.calendarSync.status()).includes("private-token"),
    false,
  );
  const recreated = createIntegrationService(
    { ...f.store },
    { env: {}, vapid: { ready: false } },
  );
  assert.equal(recreated.calendarSync.status().paused, false);
  assert.ok(recreated.calendarSync.status().lastSuccess);
});
test("source updates keep local operational fields; conflicts keep the local source edit", async (t) => {
  const f = fixture(t);
  await f.service.calendarSync.run(true);
  let job = f.store.getRecords("jobs")[0];
  f.store.saveRecord("inventory", { id: "kit", name: "TEST kit", quantity: 9 });
  job = f.store.saveRecord("jobs", {
    ...job,
    crew: "TEST crew",
    materials: [{ inventoryId: "kit", quantity: 2 }],
    fieldPlan: [{ id: "phase1", phase: "setup", owner: "TEST lead" }],
  });
  f.setText(calendar("TEST renamed by source"));
  await f.service.calendarSync.run(true);
  job = f.store.getRecords("jobs")[0];
  assert.equal(job.title, "TEST renamed by source");
  assert.equal(job.crew, "TEST crew");
  assert.equal(job.fieldPlan[0].owner, "TEST lead");
  assert.equal(job.materials[0].quantity, 2);
  job = f.store.saveRecord("jobs", { ...job, title: "TEST local override" });
  f.setText(calendar("TEST simultaneous source edit"));
  await f.service.calendarSync.run(true);
  assert.equal(f.store.getRecords("jobs")[0].title, "TEST local override");
  assert.equal(f.service.calendarSync.status().lastReport.conflicts.length, 1);
  assert.equal(f.store.getRecord("inventory", "kit").quantity, 9);
});
test("local-only source edits persist when the feed has not changed that field", async (t) => {
  const f = fixture(t);
  await f.service.calendarSync.run(true);
  let job = f.store.getRecords("jobs")[0];
  job = f.store.saveRecord("jobs", { ...job, address: "TEST local address" });
  f.setText(calendar("TEST new source title"));
  await f.service.calendarSync.run(true);
  job = f.store.getRecords("jobs")[0];
  assert.equal(job.address, "TEST local address");
  assert.equal(job.title, "TEST new source title");
  assert.equal(f.service.calendarSync.status().lastReport.conflicts.length, 0);
});
test("feed failures, redirects and malformed responses retain records and prior success", async (t) => {
  const f = fixture(t);
  await f.service.calendarSync.run(true);
  const success = f.service.calendarSync.status().lastSuccess;
  for (const response of [
    () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/private" },
      }),
    () => new Response("no", { status: 403 }),
    () => new Response("not a calendar"),
    () => new Response("large", { headers: { "content-length": "2000000" } }),
  ]) {
    const service = createIntegrationService(
      { ...f.store },
      {
        env: {
          TIMETREE_FEED_URL:
            "https://calendar.example.com/private-token/feed.ics",
        },
        vapid: { ready: false },
        fetch: async () => response(),
      },
    );
    const status = await service.calendarSync.run(true);
    assert.ok(status.lastError);
    assert.equal(status.lastSuccess, success);
    assert.equal(f.store.getRecords("jobs").length, 1);
  }
});
test("concurrent services share a fetch lease and release it on completion", async (t) => {
  let resolve;
  let calls = 0;
  const store = createStore();
  t.after(() => store.close());
  const options = {
    env: { TIMETREE_FEED_URL: "https://calendar.example.com/feed.ics" },
    vapid: { ready: false },
    fetch: () => {
      calls++;
      return new Promise((r) => (resolve = r));
    },
  };
  const one = createIntegrationService({ ...store }, options),
    two = createIntegrationService({ ...store }, options);
  const pending = one.calendarSync.run(true);
  await two.calendarSync.run(true);
  assert.equal(calls, 1);
  resolve(new Response(calendar()));
  await pending;
  assert.equal(store.getRecords("jobs").length, 1);
});
test("explicit cancellations and recurring events are flagged, never silently delete jobs", async (t) => {
  const f = fixture(t);
  await f.service.calendarSync.run(true);
  f.setText(calendar("TEST cancelled", "STATUS:CANCELLED\r\n"));
  await f.service.calendarSync.run(true);
  assert.equal(f.store.getRecords("jobs").length, 1);
  assert.match(
    f.service.calendarSync.status().lastReport.warnings[0],
    /cancellation/,
  );
  assert.equal(f.store.getRecords("jobs")[0].sourceVerifiedAt, "");
  f.setText(calendar("TEST recurrence", "RRULE:FREQ=DAILY\r\n"));
  await f.service.calendarSync.run(true);
  assert.match(
    f.service.calendarSync.status().lastReport.warnings[0],
    /repeating/,
  );
});
test("a restored workspace without import mappings is not overwritten by automatic sync", async (t) => {
  const f = fixture(t);
  await f.service.calendarSync.run(true);
  const restored = createStore();
  t.after(() => restored.close());
  restored.restoreBackup(f.store.backup());
  const service = createIntegrationService(
    { ...restored },
    {
      env: { TIMETREE_FEED_URL: "https://calendar.example.com/feed.ics" },
      vapid: { ready: false },
      fetch: async () => new Response(calendar("TEST changed after restore")),
    },
  );
  const status = await service.calendarSync.run(true);
  assert.equal(restored.getRecords("jobs")[0].title, "TEST feed job");
  assert.equal(status.lastReport.conflicts.length, 1);
});
