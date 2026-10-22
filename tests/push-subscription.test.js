import test from "node:test";
import assert from "node:assert/strict";
import { currentPushSubscription } from "../src/push-subscription.js";

test("matching browser push key preserves the registered subscription", async () => {
  const key = new Uint8Array([1, 2, 3]);
  const subscription = { options: { applicationServerKey: key.buffer } };
  const manager = {
    getSubscription: async () => subscription,
    subscribe: () => assert.fail("Must not replace matching keys"),
  };
  assert.equal(
    await currentPushSubscription(manager, key, () =>
      assert.fail("Must not remove a matching subscription"),
    ),
    subscription,
  );
});

test("changed or missing browser key reconnects and removes only the old endpoint", async () => {
  for (const previous of [new Uint8Array([4, 5, 6]).buffer, undefined]) {
    const events = [];
    const key = new Uint8Array([1, 2, 3]);
    const subscription = {
      endpoint: "TEST-old-endpoint",
      options: { applicationServerKey: previous },
      unsubscribe: async () => {
        events.push("unsubscribe");
        return true;
      },
    };
    const manager = {
      getSubscription: async () => subscription,
      subscribe: async (options) => {
        assert.deepEqual(options.applicationServerKey, key);
        events.push("subscribe");
        return { endpoint: "TEST-new-endpoint" };
      },
    };
    const result = await currentPushSubscription(
      manager,
      key,
      async (endpoint) => {
        assert.equal(endpoint, subscription.endpoint);
        events.push("removeOld");
      },
    );
    assert.equal(result.endpoint, "TEST-new-endpoint");
    assert.deepEqual(events, ["unsubscribe", "removeOld", "subscribe"]);
  }
});

test("failed unsubscribe does not register an incompatible subscription", async () => {
  const manager = {
    getSubscription: async () => ({
      options: {},
      unsubscribe: async () => false,
    }),
    subscribe: () => assert.fail("Must stop on failed unsubscribe"),
  };
  await assert.rejects(
    currentPushSubscription(manager, new Uint8Array([1]), () => assert.fail()),
    /Could not replace/,
  );
});
