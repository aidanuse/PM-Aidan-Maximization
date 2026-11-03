import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { createTimeTreeBridge } from "../server/timetree-bridge.js";
import { createBridgeClient } from "../tools/timetree-connection/bridge-client.mjs";
function setup(t) {
  const store = createStore();
  t.after(() => store.close());
  let ms = Date.parse("2026-11-03T12:00:00Z");
  const bridge = createTimeTreeBridge({
    db: store.db,
    now: () => new Date(ms),
  });
  return {
    store,
    bridge,
    advance: (n) => {
      ms += n;
    },
  };
}
const report = {
  eventResponseShapes: [
    {
      events: {
        type: "array",
        count: 2,
        sample: { title: "string", start_at: "number", token: "[redacted]" },
      },
    },
  ],
};
test("pairing key is returned once, hashed at rest, and revoked on rotation/disconnection", (t) => {
  const { store, bridge } = setup(t);
  assert.equal(bridge.status().paired, false);
  const first = bridge.pair();
  assert.equal(first.token.length, 43);
  assert.equal(first.status.paused, true);
  assert.doesNotMatch(JSON.stringify(bridge.status()), new RegExp(first.token));
  assert.ok(
    !JSON.stringify(
      store.db.prepare("SELECT * FROM integration_timetree_bridge").get(),
    ).includes(first.token),
  );
  bridge.authenticate(`Bearer ${first.token}`);
  assert.throws(
    () => bridge.authenticate("Bearer wrong"),
    (e) => e.status === 401,
  );
  const second = bridge.pair();
  assert.throws(
    () => bridge.authenticate(`Bearer ${first.token}`),
    (e) => e.status === 401,
  );
  bridge.authenticate(`Bearer ${second.token}`);
  bridge.disconnect();
  assert.throws(
    () => bridge.authenticate(`Bearer ${second.token}`),
    (e) => e.status === 401,
  );
  assert.equal(bridge.status().diagnostics, undefined);
});
test("offline queued checks, heartbeat timeout, pause cancellation and periodic checks remain truthful", (t) => {
  const { bridge, advance } = setup(t);
  bridge.pair();
  assert.equal(bridge.status().online, false);
  let command = bridge.poll({ version: "0.2.0" });
  assert.ok(command.request);
  assert.equal(bridge.status().online, true);
  bridge.complete({
    requestId: command.request.id,
    observation: "events-observed",
    report,
  });
  assert.equal(bridge.status().transferEnabled, false);
  assert.equal(bridge.status().observation, "events-observed");
  advance(91000);
  assert.equal(bridge.status().online, false);
  assert.equal(bridge.poll({ version: "0.2.0" }).request, null);
  bridge.control({ action: "refresh" });
  command = bridge.poll({ version: "0.2.0" });
  bridge.control({ action: "pause" });
  assert.throws(
    () =>
      bridge.complete({
        requestId: command.request.id,
        observation: "events-observed",
        report,
      }),
    (e) => e.status === 409,
  );
  bridge.control({ action: "resume" });
  command = bridge.poll({ version: "0.2.0" });
  assert.ok(command.request);
  bridge.complete({
    requestId: command.request.id,
    observation: "no-events",
    report: { eventResponseShapes: [] },
  });
  assert.equal(bridge.poll({ version: "0.2.0" }).request, null);
  advance(300001);
  assert.ok(bridge.poll({ version: "0.2.0" }).request);
  assert.equal(bridge.status().lastSuccess, undefined);
});
test("reject raw event data, mismatched reports and stale command acknowledgements", (t) => {
  const { bridge, store } = setup(t);
  bridge.pair();
  const command = bridge.poll({ version: "0.2.0" }).request;
  assert.throws(
    () =>
      bridge.complete({
        requestId: command.id,
        observation: "events-observed",
        report: {
          eventResponseShapes: [{ title: "PRIVATE CUSTOMER CONTENT" }],
        },
      }),
    (e) => e.status === 400,
  );
  assert.throws(
    () =>
      bridge.complete({
        requestId: command.id,
        observation: "events-observed",
        report: { eventResponseShapes: [] },
      }),
    (e) => e.status === 400,
  );
  assert.throws(
    () =>
      bridge.complete({
        requestId: "stale",
        observation: "no-events",
        report: { eventResponseShapes: [] },
      }),
    (e) => e.status === 409,
  );
  assert.equal(store.state().calendarEvents.length, 0);
  assert.equal(store.state().jobs.length, 0);
});
test("bridge state survives service recreation and stays outside portable backups", (t) => {
  const { store, bridge } = setup(t);
  const pair = bridge.pair();
  const another = createTimeTreeBridge({ db: store.db });
  another.authenticate(`Bearer ${pair.token}`);
  assert.equal(another.status().paired, true);
  assert.ok(!JSON.stringify(store.backup()).includes(pair.token));
});
test("Windows client uses fixed host, bearer-only scoped requests, no redirects and no calendar payload", async () => {
  const token = "a".repeat(43);
  const calls = [];
  const client = createBridgeClient(token, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ transferEnabled: false }) };
  });
  await client.poll();
  await client.complete(
    "request",
    "events-observed",
    report.eventResponseShapes,
  );
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.ok(
      c.url.startsWith(
        "https://pm-aidan-maximization.maxim-mdnservices.workers.dev/api/integrations/timetree-bridge/",
      ),
    );
    assert.equal(c.options.redirect, "error");
    assert.equal(c.options.headers.Authorization, `Bearer ${token}`);
    assert.ok(!c.url.includes(token));
  }
  const denied = createBridgeClient(token, async () => ({
    ok: false,
    status: 401,
  }));
  await assert.rejects(
    () => denied.poll(),
    (e) => e.status === 401,
  );
});
