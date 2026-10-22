import { DurableObject } from "cloudflare:workers";
import webpush from "web-push";
import {
  createStoreFromDatabase,
  HttpError,
  tokenHash,
} from "../server/store-core.js";
import {
  createIntegrationService,
  registerIntegrations,
} from "../server/integrations.js";
import { registerCalendarFeed } from "../server/calendar-feed.js";
import { durableDatabase } from "./database.js";
import { Router } from "./router.js";
import { providerReason } from "../server/push-errors.js";

const encoder = new TextEncoder();
const cookieName = "hardbond_session";
const sessionLifetime = 14 * 24 * 60 * 60 * 1000;
const b64 = (bytes) => Buffer.from(bytes).toString("base64url");
const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const importKey = (password) =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
const rawCookie = (request) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);

function privateResponse(response, request) {
  const result = new Response(response.body, response);
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("Referrer-Policy", "same-origin");
  result.headers.set("X-Frame-Options", "DENY");
  result.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (new URL(request.url).protocol === "https:")
    result.headers.set("Strict-Transport-Security", "max-age=31536000");
  return result;
}

function fail(error) {
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : error.status === 503
        ? 503
        : 500;
  if (status === 500)
    console.error("HARDBOND Worker request failed:", error.name);
  return Response.json(
    {
      error:
        status === 500
          ? "The request could not be completed. Refresh to check the saved state before retrying."
          : error.message,
      ...(error.details ? { details: error.details } : {}),
    },
    { status },
  );
}

// Generate encrypted push requests with the existing library, then use Workers fetch
// instead of Node's https client. Never log endpoints, credentials, or payloads.
export async function sendPush(
  subscription,
  payload,
  options,
  fetcher = fetch,
) {
  let details;
  try {
    details = webpush.generateRequestDetails(subscription, payload, options);
  } catch (error) {
    error.pushStage = "prepare";
    throw error;
  }
  const headers = new Headers(details.headers);
  headers.delete("Content-Length");
  const response = await fetcher(details.endpoint, {
    method: details.method,
    headers,
    body: details.body,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    // Limit diagnostic data and expose only a recognized provider reason code.
    let body = "";
    if (response.body) {
      const reader = response.body.getReader();
      let size = 0;
      try {
        while (size < 8192) {
          const { done, value } = await reader.read();
          if (done) break;
          const part = value.subarray(0, 8192 - size);
          size += part.length;
          body += new TextDecoder().decode(part);
        }
      } catch {
        /* Preserve the HTTP status even if its body is interrupted. */
      } finally {
        await reader.cancel().catch(() => {});
      }
    }
    throw Object.assign(new Error("Push provider rejected request."), {
      statusCode: response.status,
      providerReason: providerReason(body),
    });
  }
  await response.body?.cancel().catch(() => {});
}

export class HardbondWorkspace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.store = createStoreFromDatabase(durableDatabase(ctx.storage));
    this.store.db.exec(`
      CREATE TABLE IF NOT EXISTS cloudflare_private (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cloudflare_login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    `);
    const row = this.store.db
      .prepare("SELECT value FROM cloudflare_private WHERE key='vapid'")
      .get();
    if (row) this.keys = JSON.parse(row.value);
    else {
      this.keys = webpush.generateVAPIDKeys();
      this.store.db
        .prepare("INSERT INTO cloudflare_private VALUES('vapid',?)")
        .run(JSON.stringify(this.keys));
    }
    this.origin =
      this.env.PUBLIC_URL ||
      this.store.db
        .prepare("SELECT value FROM cloudflare_private WHERE key='origin'")
        .get()?.value ||
      "";
    this.authKey =
      env.OWNER_PASSWORD?.length >= 16 ? importKey(env.OWNER_PASSWORD) : null;
    this.service = this.makeService();
  }

  makeService() {
    const subject =
      this.env.VAPID_SUBJECT ||
      (/^https:\/\//.test(this.origin) ? this.origin : "");
    let vapid = {
      ready: false,
      publicKey: this.keys.publicKey,
      source: "durable-object",
      error: "Open the deployed HTTPS app before enabling phone notifications.",
    };
    if (subject) {
      try {
        webpush.getVapidHeaders(
          "https://web.push.apple.com",
          subject,
          this.keys.publicKey,
          this.keys.privateKey,
          "aes128gcm",
        );
        vapid = {
          ready: true,
          publicKey: this.keys.publicKey,
          source: "durable-object",
          details: { subject, ...this.keys },
        };
      } catch {
        vapid.error =
          "The VAPID subject or persistent keys could not be validated.";
      }
    }
    return createIntegrationService(
      { ...this.store, env: this.env, dataDir: "/unused" },
      { vapid, pushSend: sendPush, env: this.env },
    );
  }

  async signedToken() {
    const random = randomToken();
    return `${random}.${b64(await crypto.subtle.sign("HMAC", await this.authKey, encoder.encode(random)))}`;
  }

  async authenticated(request) {
    if (!this.authKey) return false;
    const token = rawCookie(request);
    if (!token || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token))
      return false;
    const [random, signature] = token.split(".");
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await this.authKey,
        Buffer.from(signature, "base64url"),
        encoder.encode(random),
      ))
    )
      return false;
    const row = this.store.db
      .prepare("SELECT expires_at FROM sessions WHERE token_hash=?")
      .get(tokenHash(token));
    return !!row && row.expires_at > Date.now();
  }

  rateLimit(request) {
    const db = this.store.db;
    const now = Date.now();
    db.prepare("DELETE FROM cloudflare_login_attempts WHERE expires_at<=?").run(
      now,
    );
    const keys = [
      [
        `ip:${tokenHash(request.headers.get("CF-Connecting-IP") || "local")}`,
        15,
      ],
      ["global", 200],
    ];
    db.transaction(() => {
      for (const [key, maximum] of keys) {
        const row = db
          .prepare("SELECT count FROM cloudflare_login_attempts WHERE key=?")
          .get(key);
        if (row?.count >= maximum)
          throw new HttpError(
            429,
            "Too many sign-in attempts. Try again in 15 minutes.",
          );
      }
      for (const [key] of keys)
        db.prepare(
          "INSERT INTO cloudflare_login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
        ).run(key, now + 15 * 60000);
    });
  }

  router(origin, authenticated) {
    const router = new Router();
    const store = this.store;
    const auth = (_req, res, next) =>
      authenticated
        ? next()
        : res.status(401).json({
            error: "Sign in to access your private HARDBOND workspace.",
          });
    router.get("/api/health", (_req, res) =>
      res.json({ ok: true, app: "HARDBOND Command", runtime: "cloudflare" }),
    );
    router.get("/api/auth/status", (_req, res) =>
      res.json({ configured: !!this.authKey, authenticated, devMode: false }),
    );
    router.post("/api/auth/login", async (req, res) => {
      if (!this.authKey)
        throw new HttpError(
          503,
          "Set OWNER_PASSWORD to at least 16 characters in Cloudflare's secret settings before signing in.",
        );
      this.rateLimit(req.request);
      const password = req.body?.password;
      if (
        typeof password !== "string" ||
        password.length < 16 ||
        password.length > 1000
      )
        throw new HttpError(401, "The password is incorrect.");
      // Native HMAC verification compares credentials without a slow JS password loop
      // or a reusable password verifier stored in the database.
      const challenge = encoder.encode("HARDBOND owner login v1");
      const expected = await crypto.subtle.sign(
        "HMAC",
        await this.authKey,
        challenge,
      );
      if (
        !(await crypto.subtle.verify(
          "HMAC",
          await importKey(password),
          expected,
          challenge,
        ))
      )
        throw new HttpError(401, "The password is incorrect.");
      const token = await this.signedToken();
      store.db
        .prepare("DELETE FROM sessions WHERE expires_at<=?")
        .run(Date.now());
      store.db
        .prepare("INSERT INTO sessions VALUES(?,?)")
        .run(tokenHash(token), Date.now() + sessionLifetime);
      const secure = origin.startsWith("https:") ? "; Secure" : "";
      res
        .set(
          "Set-Cookie",
          `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetime / 1000}${secure}`,
        )
        .json({ authenticated: true });
    });
    router.post("/api/auth/logout", (req, res) => {
      const token = rawCookie(req.request);
      if (token)
        store.db
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .run(tokenHash(token));
      res
        .set(
          "Set-Cookie",
          `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${origin.startsWith("https:") ? "; Secure" : ""}`,
        )
        .json({ authenticated: false });
    });
    registerCalendarFeed(router, {
      store,
      requireAuth: auth,
      env: { ...this.env, PUBLIC_URL: origin },
    });
    router.get("/api/state", auth, (_req, res) =>
      res.json({ ...store.state(), integrations: {} }),
    );
    router.post("/api/records/:collection", auth, (req, res) =>
      res.status(201).json({
        record: store.saveRecord(req.params.collection, req.body, {
          createOnly: true,
        }),
      }),
    );
    router.put("/api/records/:collection/:id", auth, (req, res) => {
      if (req.body.id && req.body.id !== req.params.id)
        throw new HttpError(400, "The record ID does not match the request.");
      res.json({
        record: store.saveRecord(
          req.params.collection,
          { ...req.body, id: req.params.id },
          { updateOnly: true },
        ),
      });
    });
    router.delete("/api/records/:collection/:id", auth, (req, res) =>
      res.json(
        store.deleteRecord(
          req.params.collection,
          req.params.id,
          req.query.version ?? req.body?.version,
        ),
      ),
    );
    router.put("/api/settings", auth, (req, res) =>
      res.json({ settings: store.updateSettings(req.body) }),
    );
    router.get("/api/backup", auth, (_req, res) =>
      res
        .set(
          "Content-Disposition",
          `attachment; filename="hardbond-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        )
        .json(store.backup()),
    );
    router.post("/api/backup/restore", auth, (req, res) =>
      res.json({ state: store.restoreBackup(req.body) }),
    );
    registerIntegrations(
      router,
      { ...store, requireAuth: auth },
      { service: this.service, schedule: false },
    );
    return router;
  }

  async fetch(request) {
    try {
      const origin = this.env.PUBLIC_URL || new URL(request.url).origin;
      if (origin !== this.origin && origin.startsWith("https:")) {
        this.store.db
          .prepare(
            "INSERT INTO cloudflare_private VALUES('origin',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .run(origin);
        this.origin = origin;
        this.service = this.makeService();
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        if (request.headers.get("sec-fetch-site") === "cross-site") {
          await request.body?.cancel();
          throw new HttpError(403, "Cross-site changes are not allowed.");
        }
        const sentOrigin = request.headers.get("origin");
        if (sentOrigin && sentOrigin !== origin) {
          await request.body?.cancel();
          throw new HttpError(
            403,
            "This origin is not allowed to change your workspace.",
          );
        }
      }
      const response = await this.router(
        origin,
        await this.authenticated(request),
      ).dispatch(request);
      return privateResponse(response, request);
    } catch (error) {
      return privateResponse(fail(error), request);
    }
  }

  async runScheduled() {
    if (!this.authKey) return;
    await this.service.runOnce();
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    // Wrangler's local scheduled-event middleware intercepts this in development.
    // Production has no HTTP endpoint for starting automations.
    if (path === "/__scheduled")
      return new Response("Not found", { status: 404 });
    if (
      path === "/api" ||
      path.startsWith("/api/") ||
      path === "/calendar" ||
      path.startsWith("/calendar/")
    ) {
      // A fixed name keeps this personal app in one persistent workspace across deploys.
      // Finish the bounded body upload before a DO can reject it. This prevents
      // interrupted proxy uploads on early auth/origin errors.
      if (request.body) {
        try {
          const reader = request.body.getReader();
          const chunks = [];
          let size = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 12 * 1024 * 1024) {
              await reader.cancel();
              throw new HttpError(413, "Request must be 12 MB or smaller.");
            }
            chunks.push(value);
          }
          const body = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
          }
          request = new Request(request, { body });
        } catch (error) {
          return privateResponse(fail(error), request);
        }
      }
      return env.HARDBOND.getByName("owner").fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env) {
    await env.HARDBOND.getByName("owner").runScheduled();
  },
};
