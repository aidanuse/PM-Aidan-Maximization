import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createECDH } from "node:crypto";
import webpush from "web-push";
import ece from "http_ece";

test(
  "Cloudflare runtime: private records, atomic consumption, restart persistence, calendar and scheduled expiry",
  { timeout: 120000 },
  async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), "hardbond-cloudflare-"));
    // Wrangler keeps one process-wide asynchronous logger across runtime restarts.
    // Keep its config/log directory outside the disposable workspace fixtures.
    process.env.XDG_CONFIG_HOME ||= join(
      process.cwd(),
      ".wrangler",
      "test-config",
    );
    process.env.WRANGLER_SEND_METRICS = "false";
    const { unstable_dev } = await import("wrangler");
    const password = randomBytes(24).toString("base64url");
    let worker;
    t.after(async () => {
      await worker?.stop();
      await rm(temporary, { recursive: true, force: true });
    });
    const start = async (ownerPassword = password) =>
      unstable_dev("cloudflare/worker.js", {
        config: "wrangler.jsonc",
        ip: "127.0.0.1",
        port: 0,
        inspectorPort: 0,
        local: true,
        persistTo: join(temporary, "state"),
        logLevel: "error",
        vars: {
          OWNER_PASSWORD: ownerPassword,
          PUBLIC_URL: "https://hardbond.example.test",
          TWILIO_ACCOUNT_SID: "",
          TWILIO_AUTH_TOKEN: "",
          TWILIO_FROM_NUMBER: "",
        },
        experimental: {
          disableExperimentalWarning: true,
          disableDevRegistry: true,
          testScheduled: true,
          watch: false,
        },
      });
    worker = await start();
    let cookie = "";
    const call = async (path, method = "GET", data, headers = {}) => {
      const response = await worker.fetch(path, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: response.status, body, headers: response.headers };
    };
    const login = async (ownerPassword = password) => {
      const result = await call("/api/auth/login", "POST", {
        password: ownerPassword,
      });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      cookie = result.headers.get("set-cookie").split(";")[0];
      assert.match(result.headers.get("set-cookie"), /HttpOnly/);
      assert.match(result.headers.get("set-cookie"), /Secure/);
    };
    assert.equal((await call("/api/health")).body.runtime, "cloudflare");
    assert.equal((await call("/api/state")).status, 401);
    assert.equal(
      (await call("/api/auth/login", "POST", { password })).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/api/auth/login",
          "POST",
          { password },
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    await login();
    assert.equal(
      (await call("/api/state")).headers.get("cache-control"),
      "no-store",
    );
    assert.equal((await call("/api/not-real")).status, 404);
    assert.equal((await call("/api")).status, 404);
    assert.equal((await call("/api/settings", "PUT", null)).status, 400);
    assert.equal(
      (
        await call(
          "/api/settings",
          "PUT",
          { ownerName: "TEST Owner" },
          { "Sec-Fetch-Site": "cross-site" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/records/inventory", "POST", {
          id: "kit",
          name: "TEST kits",
          unit: "kit",
          quantity: 5,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call("/api/records/jobs", "POST", {
          id: "job",
          title: "TEST garage",
          date: "2099-10-20",
        })
      ).status,
      201,
    );
    const sheet = {
      id: "day",
      date: "2099-10-20",
      jobId: "job",
      status: "reviewed",
      materials: [{ inventoryId: "kit", quantity: 2 }],
      tomorrowNeeds: "TEST collect rollers",
      remindAt: "2099-10-21T11:00:00Z",
    };
    const saved = await call("/api/records/dailySheets", "POST", sheet);
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    assert.equal(
      (await call("/api/records/dailySheets", "POST", sheet)).status,
      201,
    );
    let state = (await call("/api/state")).body;
    assert.equal(state.inventory[0].quantity, 3);
    assert.equal(state.reminders[0].body, "TEST collect rollers");
    const updated = await call("/api/records/dailySheets/day", "PUT", {
      ...saved.body.record,
      materials: [{ inventoryId: "kit", quantity: 3 }],
    });
    assert.equal(updated.status, 200);
    assert.equal(
      (
        await call("/api/records/dailySheets/day", "PUT", {
          ...saved.body.record,
          issues: "TEST stale edit",
        })
      ).status,
      409,
    );
    state = (await call("/api/state")).body;
    assert.equal(state.inventory[0].quantity, 2);
    const invalid = {
      ...updated.body.record,
      materials: [
        { inventoryId: "kit", quantity: 4 },
        { inventoryId: "missing", quantity: 1 },
      ],
    };
    assert.equal(
      (await call("/api/records/dailySheets/day", "PUT", invalid)).status,
      400,
    );
    assert.equal((await call("/api/state")).body.inventory[0].quantity, 2);
    const integration = (await call("/api/integrations/status")).body;
    assert.equal(
      integration.push.configured,
      true,
      JSON.stringify(integration),
    );
    assert.equal(integration.sms.credentialsConfigured, false);
    const publicKey = (await call("/api/push/public-key")).body.publicKey;
    assert.equal(publicKey.length, 87);
    const feed = await call(
      "/api/integrations/calendar/subscription",
      "POST",
      {},
    );
    assert.equal(feed.status, 200, JSON.stringify(feed.body));
    assert.match(
      (await call(new URL(feed.body.url).pathname)).body,
      /TEST garage/,
    );
    const backup = await call("/api/backup");
    assert.equal(backup.body.format, "hardbond-backup");
    const expired = {
      id: "expired",
      title: "TEST expired",
      dueAt: "2000-01-01T00:00:00Z",
      expiresAt: "2000-01-01T01:00:00Z",
    };
    assert.equal(
      (await call("/api/records/reminders", "POST", expired)).status,
      201,
    );
    const tick = await call("/__scheduled?cron=*+*+*+*+*");
    assert.equal(tick.status, 200, JSON.stringify(tick.body));
    state = (await call("/api/state")).body;
    assert.equal(
      state.reminders.find((r) => r.id === "expired").status,
      "expired",
      JSON.stringify({
        tick: tick.body,
        log: (await call("/api/integrations/delivery-log")).body,
      }),
    );
    await worker.stop();
    worker = await start();
    assert.equal((await call("/api/state")).body.inventory[0].quantity, 2);
    assert.equal(
      (await call("/api/push/public-key")).body.publicKey,
      publicKey,
    );
    assert.match(
      (await call(new URL(feed.body.url).pathname)).body,
      /TEST garage/,
    );
    assert.equal(
      (await call("/api/integrations/calendar/subscription", "DELETE")).status,
      200,
    );
    assert.equal((await call(new URL(feed.body.url).pathname)).status, 404);
    const oldCookie = cookie;
    await worker.stop();
    worker = await start(randomBytes(24).toString("base64url"));
    cookie = oldCookie;
    assert.equal(
      (await call("/api/state")).status,
      401,
      "Changing the secret must invalidate existing sessions",
    );
    await worker.stop();
    worker = await start();
    await login();
    assert.equal(
      (
        await call("/api/auth/logout", "POST", undefined, {
          "Content-Type": "application/json",
        })
      ).status,
      200,
    );
    assert.equal((await call("/api/state")).status, 401);
    cookie = "";
    let limited = false;
    for (let i = 0; i < 20; i++) {
      const result = await call("/api/auth/login", "POST", {
        password: "TEST incorrect password",
      });
      if (result.status === 429) {
        limited = true;
        break;
      }
      assert.equal(result.status, 401);
    }
    assert.equal(
      limited,
      true,
      "Persistent sign-in rate limit did not activate",
    );
    await worker.stop();
    worker = await start("");
    assert.equal((await call("/api/auth/status")).body.configured, false);
    assert.equal(
      (await call("/api/auth/login", "POST", { password })).status,
      503,
    );
    assert.equal((await call("/api/state")).status, 401);
  },
);

test(
  "Cloudflare runtime: SQL rollback and encrypted Web Push transport without real network sends",
  { timeout: 60000 },
  async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), "hardbond-transport-"));
    process.env.WRANGLER_SEND_METRICS = "false";
    process.env.XDG_CONFIG_HOME ||= join(
      process.cwd(),
      ".wrangler",
      "test-config",
    );
    const { unstable_dev } = await import("wrangler");
    const worker = await unstable_dev("tests/cloudflare-transport-worker.js", {
      config: "wrangler.jsonc",
      ip: "127.0.0.1",
      port: 0,
      inspectorPort: 0,
      local: true,
      persistTo: join(temporary, "state"),
      logLevel: "error",
      vars: {
        OWNER_PASSWORD: randomBytes(24).toString("base64url"),
        TWILIO_ACCOUNT_SID: "",
        TWILIO_AUTH_TOKEN: "",
        TWILIO_FROM_NUMBER: "",
      },
      experimental: {
        disableExperimentalWarning: true,
        disableDevRegistry: true,
        watch: false,
      },
    });
    t.after(async () => {
      await worker.stop();
      await rm(temporary, { recursive: true, force: true });
    });
    assert.equal((await (await worker.fetch("/api/rollback")).json()).count, 0);
    const receiver = createECDH("prime256v1");
    receiver.generateKeys();
    const auth = randomBytes(16).toString("base64url");
    const subscription = {
      endpoint: "https://web.push.apple.com/TEST-never-sent",
      keys: { p256dh: receiver.getPublicKey().toString("base64url"), auth },
    };
    const payload = JSON.stringify({
      title: "TEST reminder",
      body: "TEST collect two kits",
    });
    const vapidDetails = {
      subject: "https://hardbond.example.test",
      ...webpush.generateVAPIDKeys(),
    };
    const send = async (status, providerBody = null) => {
      const result = await worker.fetch("/api/transport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription,
          payload,
          vapidDetails,
          status,
          providerBody,
        }),
      });
      assert.equal(result.status, 200);
      return result.json();
    };
    const accepted = await send(201);
    assert.equal(accepted.captured.url, subscription.endpoint);
    assert.equal(accepted.captured.headers["content-encoding"], "aes128gcm");
    assert.match(accepted.captured.headers.authorization, /^vapid t=/);
    assert.equal(
      ece
        .decrypt(Buffer.from(accepted.captured.body, "base64"), {
          version: "aes128gcm",
          privateKey: receiver,
          authSecret: auth,
        })
        .toString(),
      payload,
    );
    const gone = await send(410);
    assert.equal(gone.statusCode, 410);
    const mismatch = await send(
      403,
      JSON.stringify({
        reason: "VapidPkHashMismatch",
        sensitive: "DO-NOT-LOG",
      }),
    );
    assert.equal(mismatch.statusCode, 403);
    assert.equal(mismatch.providerReason, "VapidPkHashMismatch");
    assert.doesNotMatch(JSON.stringify(mismatch), /DO-NOT-LOG/);
    const unknown = await send(400, JSON.stringify({ reason: "DO-NOT-LOG" }));
    assert.equal(unknown.providerReason, null);
  },
);
