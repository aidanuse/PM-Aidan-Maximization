import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { loadCheckStatus, laborMinutes, jobGaps } from "../shared/domain.js";
const fixture = (t) => {
  const s = createStore();
  t.after(() => s.close());
  s.saveRecord("jobs", { id: "job1", title: "TEST job" });
  s.saveRecord("inventory", {
    id: "kit",
    name: "TEST material",
    unit: "kit",
    quantity: 5,
  });
  return s;
};
const sheet = {
  id: "day1",
  date: "2026-10-19",
  jobId: "job1",
  status: "reviewed",
  materials: [{ inventoryId: "kit", quantity: 2 }],
};
test("reviewed consumption and retried create apply once", (t) => {
  const s = fixture(t);
  s.saveRecord("dailySheets", sheet, { createOnly: true });
  assert.equal(s.getRecord("inventory", "kit").quantity, 3);
  s.saveRecord("dailySheets", sheet, { createOnly: true });
  assert.equal(s.getRecord("inventory", "kit").quantity, 3);
});
test("corrected consumption applies net difference and rejects conflicting stale version", (t) => {
  const s = fixture(t);
  const a = s.saveRecord("dailySheets", sheet);
  const b = s.saveRecord("dailySheets", {
    ...a,
    materials: [{ inventoryId: "kit", quantity: 3 }],
  });
  assert.equal(s.getRecord("inventory", "kit").quantity, 2);
  assert.throws(
    () => s.saveRecord("dailySheets", { ...a, issues: "stale edit" }),
    (e) => e.status === 409,
  );
  s.saveRecord("dailySheets", { ...b, status: "draft" });
  assert.equal(s.getRecord("inventory", "kit").quantity, 5);
});
test("drafts preserve unknowns and do not consume; review requires job and date", (t) => {
  const s = fixture(t);
  s.saveRecord("dailySheets", {
    id: "draft",
    materials: [{ inventoryId: "kit", quantity: 2 }],
  });
  assert.equal(s.getRecord("inventory", "kit").quantity, 5);
  assert.throws(
    () => s.saveRecord("dailySheets", { status: "reviewed" }),
    (e) => e.status === 400,
  );
});
test("unknown opening stock stays unknown, deficit remains visible", (t) => {
  const s = fixture(t);
  let item = s.getRecord("inventory", "kit");
  s.saveRecord("inventory", { ...item, quantity: null });
  const d = s.saveRecord("dailySheets", sheet);
  assert.equal(s.getRecord("inventory", "kit").quantity, null);
  assert.equal(d.inventoryEffect.unknown.length, 1);
  s.deleteRecord("dailySheets", d.id, d.version);
  item = s.getRecord("inventory", "kit");
  s.saveRecord("inventory", { ...item, quantity: 1 });
  s.saveRecord("dailySheets", sheet);
  assert.equal(s.getRecord("inventory", "kit").quantity, -1);
});
test("physical recount prevents unsafe historical material correction", (t) => {
  const s = fixture(t);
  const d = s.saveRecord("dailySheets", sheet);
  s.saveRecord("inventory", {
    ...s.getRecord("inventory", "kit"),
    quantity: 8,
  });
  assert.throws(
    () =>
      s.saveRecord("dailySheets", {
        ...d,
        materials: [{ inventoryId: "kit", quantity: 1 }],
      }),
    (e) => e.status === 409,
  );
  assert.equal(s.getRecord("inventory", "kit").quantity, 8);
  s.deleteRecord("dailySheets", d.id, d.version);
  assert.equal(s.getRecord("inventory", "kit").quantity, 8);
});
test("reminders follow daily content and cancellation without duplicates", (t) => {
  const s = fixture(t);
  let d = s.saveRecord("dailySheets", {
    ...sheet,
    tomorrowNeeds: "Collect two kits",
    remindAt: "2026-10-20T11:00:00Z",
  });
  d = s.saveRecord("dailySheets", {
    ...d,
    tomorrowNeeds: "Collect three kits",
  });
  assert.equal(s.getRecords("reminders").length, 1);
  assert.equal(s.getRecords("reminders")[0].body, "Collect three kits");
  s.saveRecord("dailySheets", { ...d, remindAt: "" });
  assert.equal(s.getRecords("reminders")[0].status, "cancelled");
});
test("negative material use and unknown collections rejected atomically", (t) => {
  const s = fixture(t);
  assert.throws(
    () =>
      s.saveRecord("dailySheets", {
        ...sheet,
        materials: [{ inventoryId: "kit", quantity: -2 }],
      }),
    (e) => e.status === 400,
  );
  assert.equal(s.getRecord("inventory", "kit").quantity, 5);
  assert.throws(
    () => s.getRecords("__proto__"),
    (e) => e.status === 404,
  );
});
test("backup restores accounting and pauses automatic sending", (t) => {
  const s = fixture(t);
  s.saveRecord("dailySheets", sheet);
  const b = s.backup();
  const restored = createStore();
  t.after(() => restored.close());
  restored.restoreBackup(b);
  assert.equal(restored.getRecord("inventory", "kit").quantity, 3);
  assert.equal(restored.getSettings().smsAutomationPaused, true);
  let d = restored.getRecord("dailySheets", "day1");
  restored.saveRecord("dailySheets", {
    ...d,
    materials: [{ inventoryId: "kit", quantity: 1 }],
  });
  assert.equal(restored.getRecord("inventory", "kit").quantity, 4);
  assert.throws(
    () => restored.restoreBackup(b),
    (e) => e.status === 409,
  );
});
test("load check cannot hide missing counts, quantities or checkpoint", () => {
  assert.equal(loadCheckStatus({}), "requirements-unconfirmed");
  assert.equal(
    loadCheckStatus({
      requirementsConfirmed: true,
      items: [{ required: 2, counted: null }],
    }),
    "counts-incomplete",
  );
  assert.equal(
    loadCheckStatus({
      requirementsConfirmed: true,
      items: [{ required: 2, counted: 1 }],
    }),
    "short",
  );
  assert.equal(
    loadCheckStatus({
      requirementsConfirmed: true,
      items: [{ required: 2, counted: 2 }],
    }),
    "checkpoint-incomplete",
  );
});
test("missing clocks and reversed intervals remain unknown; gap checks include actual product", () => {
  assert.equal(laborMinutes({ start: "08:00", end: "" }), null);
  assert.equal(laborMinutes({ start: "17:00", end: "08:00" }), null);
  assert.equal(
    laborMinutes({ start: "08:00", end: "17:00", breakMinutes: 30 }),
    510,
  );
  assert.deepEqual(jobGaps({ product: "" }, ["product"]), ["product"]);
});
test("HTTP authentication, validation, CSRF and logout", async (t) => {
  const store = createStore();
  const env = {
    OWNER_PASSWORD: "fixture-only-not-a-real-secret",
    NODE_ENV: "test",
  };
  const { app, close } = await createApp({ store, env, integrations: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    close();
    store.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + "/api/state")).status, 401);
  const login = await fetch(url + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: env.OWNER_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await fetch(url + "/api/state", { headers: { cookie } })).status,
    200,
  );
  assert.equal(
    (
      await fetch(url + "/api/settings", {
        method: "PUT",
        headers: {
          cookie,
          "Content-Type": "application/json",
          Origin: "https://unrelated.example",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  const out = await fetch(url + "/api/auth/logout", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
  });
  assert.equal(out.status, 200);
  assert.equal(
    (await fetch(url + "/api/state", { headers: { cookie } })).status,
    401,
  );
});
test("private calendar subscription updates from records and can be revoked", async (t) => {
  const store = createStore();
  const env = {
    ALLOW_DEV_AUTH: "1",
    PUBLIC_URL: "https://hardbond.example.test",
  };
  const { app, close } = await createApp({ store, env, integrations: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    close();
    store.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  store.saveRecord("jobs", {
    id: "feedjob",
    title: "TEST calendar subscription",
    date: "2026-10-20",
  });
  const make = await fetch(url + "/api/integrations/calendar/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(make.status, 200);
  const link = await make.json();
  const path = new URL(link.url).pathname;
  const first = await (await fetch(url + path)).text();
  assert.match(first, /TEST calendar subscription/);
  const job = store.getRecord("jobs", "feedjob");
  store.saveRecord("jobs", { ...job, date: "2026-10-22" });
  assert.match(await (await fetch(url + path)).text(), /20261022/);
  await fetch(url + "/api/integrations/calendar/subscription", {
    method: "DELETE",
  });
  assert.equal((await fetch(url + path)).status, 404);
});
test("physical check needs item identity, units and location as well as counts", () => {
  const base = {
    checkpoint: "At the jobsite",
    checkedBy: "Aidan",
    checkedAt: "2026-10-19T12:00:00Z",
    requirementsConfirmed: true,
    items: [
      { name: "TEST kit", unit: "kit", required: 2, counted: 2, location: "" },
    ],
  };
  assert.equal(loadCheckStatus(base), "item-details-incomplete");
  base.items[0].location = "Trailer";
  assert.equal(loadCheckStatus(base), "listed-quantities-matched");
});
