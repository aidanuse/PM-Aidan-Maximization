import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { pushFailureDetail } from "../server/push-errors.js";
import {
  createIntegrationService,
  buildFollowupPreview,
  localClock,
} from "../server/integrations.js";
function service(t, options = {}) {
  const s = createStore();
  t.after(() => s.close());
  let clock = new Date("2026-10-19T23:10:00Z");
  const i = createIntegrationService(
    { ...s },
    { vapid: { ready: false }, env: {}, now: () => clock, ...options },
  );
  return { s, i, setTime: (v) => (clock = new Date(v)) };
}
const ics = (description = "AREA: 490\\nSYSTEM: TEST system") =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TEST//EN\r\nBEGIN:VEVENT\r\nUID:test-job@example.test\r\nDTSTART:20261020T120000Z\r\nDTEND:20261020T210000Z\r\nSUMMARY:TEST calendar job\r\nLOCATION:TEST address\r\nDESCRIPTION:${description}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
test("Toronto schedule respects timezone", () => {
  assert.deepEqual(localClock(new Date("2026-10-19T23:10:00Z")), {
    date: "2026-10-19",
    time: "19:10",
  });
});
test("preview uses missing fields, excludes cancelled jobs and suppresses repeat gaps", () => {
  const now = new Date("2026-10-19T23:10:00Z");
  const jobs = [
    {
      id: "1",
      title: "TEST",
      date: "2026-10-20",
      bookingStatus: "tentative",
      address: "",
    },
    {
      id: "2",
      title: "cancelled",
      date: "2026-10-20",
      bookingStatus: "cancelled",
    },
  ];
  const p = buildFollowupPreview(
    jobs,
    { followupRequiredFields: ["address"] },
    now,
  );
  assert.equal(p.jobs.length, 1);
  assert.match(p.message, /job address/);
  const q = buildFollowupPreview(
    jobs,
    { followupRequiredFields: ["address"] },
    now,
    new Map([["1", { signature: p.jobs[0].signature, count: 2 }]]),
  );
  assert.equal(q.message, "");
  assert.equal(q.jobs[0].suppressed, true);
});
test("ICS import is idempotent and preserves locally edited event", async (t) => {
  const { s, i } = service(t);
  const one = await i.importCalendar({
    ics: ics(),
    source: "timetree",
    createJobs: true,
  });
  assert.equal(one.created, 1);
  assert.equal(one.jobsCreated, 1);
  const two = await i.importCalendar({
    ics: ics(),
    source: "timetree",
    createJobs: true,
  });
  assert.equal(two.unchanged, 1);
  assert.equal(s.getRecords("jobs").length, 1);
  assert.equal(s.getRecords("jobs")[0].areaSqft, 490);
  const e = s.getRecords("calendarEvents")[0];
  s.saveRecord("calendarEvents", { ...e, title: "Locally corrected" });
  const three = await i.importCalendar({ ics: ics(), source: "timetree" });
  assert.equal(three.conflicts.length, 1);
  assert.equal(s.getRecords("calendarEvents")[0].title, "Locally corrected");
  assert.match(i.exportCalendar(), /BEGIN:VCALENDAR/);
});
test("calendar rejects malformed files, skips recurrence and timezone ambiguity", async (t) => {
  const { i } = service(t);
  await assert.rejects(i.importCalendar({ ics: "invalid", source: "ics" }));
  const floating = ics().replace("20261020T120000Z", "20261020T120000");
  const report = await i.importCalendar({ ics: floating, source: "ics" });
  assert.equal(report.created, 0);
  assert.ok(report.warnings.length);
  const recurring = ics().replace("SUMMARY:", "RRULE:FREQ=WEEKLY\r\nSUMMARY:");
  assert.equal(
    (await i.importCalendar({ ics: recurring, source: "ics" })).created,
    0,
  );
});
test("SMS sends one digest per day and pause stops further sends (mock transport)", async (t) => {
  let calls = 0;
  const { s, i, setTime } = service(t, {
    env: {
      TWILIO_ACCOUNT_SID: "AC" + "0".repeat(32),
      TWILIO_AUTH_TOKEN: "test-fixture-only",
      TWILIO_FROM_NUMBER: "+14165550100",
    },
    fetch: async () => {
      calls++;
      return { ok: true };
    },
  });
  s.updateSettings({ maxPhone: "+14165550101", smsAutomationEnabled: true });
  s.saveRecord("jobs", { id: "j", title: "TEST ONLY", date: "2026-10-20" });
  await i.runOnce();
  await i.runOnce();
  assert.equal(calls, 1);
  assert.equal(i.deliveryLog()[0].status, "accepted");
  setTime("2026-10-20T23:10:00Z");
  s.updateSettings({ smsAutomationPaused: true });
  await i.runOnce();
  assert.equal(calls, 1);
});
test("SMS timeout is recorded unknown and never blindly retried", async (t) => {
  let calls = 0;
  const { s, i } = service(t, {
    env: {
      TWILIO_ACCOUNT_SID: "AC" + "0".repeat(32),
      TWILIO_AUTH_TOKEN: "test-fixture-only",
      TWILIO_FROM_NUMBER: "+14165550100",
    },
    fetch: async () => {
      calls++;
      throw new DOMException("timeout", "TimeoutError");
    },
  });
  s.updateSettings({ maxPhone: "+14165550101", smsAutomationEnabled: true });
  s.saveRecord("jobs", { title: "TEST", date: "2026-10-20" });
  await i.runOnce();
  await i.runOnce();
  assert.equal(calls, 1);
  assert.equal(i.deliveryLog()[0].status, "unknown");
});
test("push accepts once, expires stale reminders and removes gone subscriptions (mock transport)", async (t) => {
  let calls = 0;
  const { s, i } = service(t, {
    vapid: { ready: true, details: {} },
    pushSend: async () => {
      calls++;
    },
  });
  i.subscribe({
    endpoint: "https://web.push.apple.com/test-only",
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
  });
  s.saveRecord("reminders", {
    id: "r",
    title: "TEST",
    dueAt: "2026-10-19T23:00:00Z",
  });
  s.saveRecord("reminders", {
    id: "old",
    title: "OLD",
    dueAt: "2026-10-17T23:00:00Z",
  });
  await i.runOnce();
  await i.runOnce();
  assert.equal(calls, 1);
  assert.equal(s.getRecord("reminders", "r").status, "sent");
  assert.equal(s.getRecord("reminders", "old").status, "expired");
});
test("push failure keeps safe provider reason and does not automatically retry", async (t) => {
  let calls = 0;
  const { s, i } = service(t, {
    vapid: { ready: true, details: {} },
    pushSend: async () => {
      calls++;
      throw Object.assign(new Error("SECRET should not be logged"), {
        statusCode: 403,
        body: JSON.stringify({
          reason: "VapidPkHashMismatch",
          secret: "SECRET",
        }),
      });
    },
  });
  i.subscribe({
    endpoint: "https://web.push.apple.com/test-only",
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
  });
  s.saveRecord("reminders", {
    id: "rejected",
    title: "TEST",
    dueAt: "2026-10-19T23:00:00Z",
  });
  await i.runOnce();
  await i.runOnce();
  assert.equal(calls, 1);
  assert.equal(s.getRecord("reminders", "rejected").status, "pending");
  assert.match(i.deliveryLog()[0].detail, /HTTP 403 \(VapidPkHashMismatch\)/);
  assert.doesNotMatch(i.deliveryLog()[0].detail, /SECRET|test-only/);
  assert.doesNotMatch(
    pushFailureDetail({
      statusCode: 400,
      body: '{"reason":"SECRET"}',
      message: "SECRET",
    }),
    /SECRET/,
  );
  assert.match(
    pushFailureDetail({ name: "TimeoutError" }),
    /acceptance is unknown/,
  );
  assert.match(
    pushFailureDetail({ pushStage: "prepare" }),
    /encryption\/signing failed/,
  );
});

test("unconfigured SMS performs no network requests", async (t) => {
  let calls = 0;
  const { s, i } = service(t, {
    fetch: async () => {
      calls++;
      throw new Error("unexpected");
    },
  });
  s.updateSettings({ smsAutomationEnabled: true, maxPhone: "+14165550101" });
  s.saveRecord("jobs", { title: "TEST", date: "2026-10-20" });
  await i.runOnce();
  assert.equal(calls, 0);
  assert.equal(i.preview().eligible, false);
});
test("stale imported jobs cannot trigger automatic follow-ups", () => {
  const now = new Date("2026-10-19T23:10:00Z");
  const jobs = [
    {
      id: "1",
      title: "TEST",
      date: "2026-10-20",
      source: "timetree",
      sourceVerifiedAt: "2026-10-17T23:00:00Z",
    },
  ];
  const p = buildFollowupPreview(jobs, {}, now);
  assert.equal(p.jobs[0].stale, true);
  assert.equal(p.message, "");
});
test("evening prompt uses unfinished jobs and cancels when reviewed", async (t) => {
  const { s, i, setTime } = service(t);
  setTime("2026-10-20T00:05:00Z");
  s.saveRecord("jobs", { id: "today", title: "TEST job", date: "2026-10-19" });
  await i.runOnce();
  let r = s
    .getRecords("reminders")
    .find((x) => x.sourceType === "eveningCheck");
  assert.ok(r);
  assert.match(r.body, /TEST job/);
  s.saveRecord("dailySheets", {
    date: "2026-10-19",
    jobId: "today",
    status: "reviewed",
  });
  await i.runOnce();
  assert.equal(s.getRecord("reminders", r.id).status, "cancelled");
});
