import express from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStore, HttpError, tokenHash } from "./store.js";
import { registerCalendarFeed } from "./calendar-feed.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loopback = (address = "") =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
const cookieName = "hardbond_session";

export async function createApp(options = {}) {
  const env = options.env || process.env;
  const production = env.NODE_ENV === "production";
  const password = env.OWNER_PASSWORD || "";
  const allowDevAuth = !production && env.ALLOW_DEV_AUTH === "1";
  if (production && !password)
    throw new Error(
      "OWNER_PASSWORD is required in production. Set it in your hosting secret settings.",
    );
  if (password && password.length < 12)
    throw new Error("OWNER_PASSWORD must contain at least 12 characters.");
  const dataDir = resolve(env.DATA_DIR || resolve(ROOT, "data"));
  const store =
    options.store || createStore(resolve(dataDir, "hardbond.sqlite"));
  if (password) {
    const row = store.db
      .prepare("SELECT password_hash FROM auth_config WHERE id=1")
      .get();
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      store.db
        .prepare(
          "INSERT INTO auth_config(id,password_hash) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash",
        )
        .run(await bcrypt.hash(password, 12));
      store.db.prepare("DELETE FROM sessions").run();
    }
  }
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  else if (env.TRUST_PROXY === "loopback") app.set("trust proxy", "loopback");
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    res.set("X-Frame-Options", "DENY");
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (production) res.set("Strict-Transport-Security", "max-age=31536000");
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "12mb" }));
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, app: "HARDBOND Command" }),
  );

  function devSession(req) {
    return allowDevAuth && loopback(req.socket.remoteAddress);
  }
  function authenticated(req) {
    if (devSession(req)) return true;
    if (!password) return false;
    const raw = req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!raw || !/^[A-Za-z0-9_-]{40,100}$/.test(raw)) return false;
    const session = store.db
      .prepare("SELECT expires_at FROM sessions WHERE token_hash=?")
      .get(tokenHash(raw));
    return Boolean(session && session.expires_at > Date.now());
  }
  function requireAuth(req, res, next) {
    if (authenticated(req)) return next();
    res
      .status(401)
      .json({ error: "Sign in to access your private HARDBOND workspace." });
  }
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.get("sec-fetch-site") === "cross-site")
      return res
        .status(403)
        .json({ error: "Cross-site changes are not allowed." });
    const origin = req.get("origin");
    if (origin) {
      let valid = false;
      try {
        const url = new URL(origin);
        const configured =
          env.PUBLIC_URL || env.APP_ORIGIN || env.RENDER_EXTERNAL_URL;
        valid = configured
          ? url.origin === new URL(configured).origin
          : url.host === req.get("host");
        if (
          !production &&
          loopback(req.socket.remoteAddress) &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        )
          valid = true;
      } catch {
        /* Invalid origins fail closed. */
      }
      if (!valid)
        return res
          .status(403)
          .json({
            error: "This origin is not allowed to change your workspace.",
          });
    }
    if (
      ["POST", "PUT", "PATCH"].includes(req.method) &&
      !req.is("application/json")
    )
      return res
        .status(415)
        .json({ error: "Send application/json for API changes." });
    next();
  });
  app.get("/api/auth/status", (req, res) =>
    res.json({
      configured: Boolean(password || devSession(req)),
      authenticated: authenticated(req),
      devMode: devSession(req),
    }),
  );
  const attempts = new Map();
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: "/",
    maxAge: 14 * 24 * 60 * 60 * 1000,
  };
  app.post("/api/auth/login", async (req, res, next) => {
    try {
      if (!password)
        throw new HttpError(
          503,
          "The workspace owner must configure OWNER_PASSWORD on the server before signing in.",
        );
      const key = req.ip;
      const current = attempts.get(key);
      const attempt =
        current && current.until > Date.now()
          ? current
          : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      if (attempt.count >= 15)
        throw new HttpError(
          429,
          "Too many sign-in attempts. Try again in 15 minutes.",
        );
      attempt.count += 1;
      attempts.set(key, attempt);
      const hash = store.db
        .prepare("SELECT password_hash FROM auth_config WHERE id=1")
        .get()?.password_hash;
      if (
        typeof req.body?.password !== "string" ||
        req.body.password.length > 1000 ||
        !(await bcrypt.compare(req.body.password, hash))
      )
        throw new HttpError(401, "The password is incorrect.");
      attempts.delete(key);
      store.db
        .prepare("DELETE FROM sessions WHERE expires_at<=?")
        .run(Date.now());
      const token = randomBytes(32).toString("base64url");
      store.db
        .prepare("INSERT INTO sessions VALUES(?,?)")
        .run(tokenHash(token), Date.now() + cookieOptions.maxAge);
      res
        .cookie(cookieName, token, cookieOptions)
        .json({ authenticated: true });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/auth/logout", (req, res) => {
    const raw = req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (raw)
      store.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(tokenHash(raw));
    res.clearCookie(cookieName, cookieOptions).json({ authenticated: false });
  });
  registerCalendarFeed(app, { store, requireAuth, env });
  app.use("/api", requireAuth);
  app.get("/api/state", (_req, res) =>
    res.json({ ...store.state(), integrations: {} }),
  );
  app.post("/api/records/:collection", (req, res) =>
    res
      .status(201)
      .json({
        record: store.saveRecord(req.params.collection, req.body, {
          createOnly: true,
        }),
      }),
  );
  app.put("/api/records/:collection/:id", (req, res) => {
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
  app.delete("/api/records/:collection/:id", (req, res) =>
    res.json(
      store.deleteRecord(
        req.params.collection,
        req.params.id,
        req.query.version ?? req.body?.version,
      ),
    ),
  );
  app.put("/api/settings", (req, res) =>
    res.json({ settings: store.updateSettings(req.body) }),
  );
  app.get("/api/backup", (_req, res) => {
    res.set(
      "Content-Disposition",
      `attachment; filename="hardbond-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.json(store.backup());
  });
  app.post("/api/backup/restore", (req, res) =>
    res.json({ state: store.restoreBackup(req.body) }),
  );
  let integrationCleanup;
  if (options.integrations !== false) {
    const { registerIntegrations } = await import("./integrations.js");
    const result = await registerIntegrations(app, {
      db: store.db,
      requireAuth,
      getRecords: store.getRecords,
      getSettings: store.getSettings,
      saveRecord: store.saveRecord,
      deleteRecord: store.deleteRecord,
      emitAudit: store.emitAudit,
      dataDir,
      env,
    });
    integrationCleanup = typeof result === "function" ? result : result?.close;
  }
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  const dist = resolve(ROOT, "dist");
  if (existsSync(dist)) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders(res, path) {
          if (/service-worker\.js$|sw\.js$|index\.html$/.test(path))
            res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(dist, "index.html")),
    );
  }
  app.use((error, _req, res, _next) => {
    const status =
      error instanceof HttpError
        ? error.status
        : error.type === "entity.parse.failed"
          ? 400
          : error.status === 413
            ? 413
            : 500;
    if (status === 500) console.error("HARDBOND server error:", error.message);
    res
      .status(status)
      .json({
        error:
          status === 500
            ? "The request could not be completed. Refresh to check the saved state before retrying."
            : status === 400 && error.type === "entity.parse.failed"
              ? "The request contains invalid JSON."
              : error.message,
        ...(error.details ? { details: error.details } : {}),
      });
  });
  return {
    app,
    store,
    close: () => {
      integrationCleanup?.();
      if (!options.store) store.close();
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { app, close } = await createApp();
    const port = Number(process.env.PORT || 3001);
    const host = process.env.HOST || "127.0.0.1";
    const server = app.listen(port, host, () =>
      console.log(`HARDBOND server listening on ${host}:${port}`),
    );
    for (const signal of ["SIGTERM", "SIGINT"])
      process.on(signal, () =>
        server.close(() => {
          close();
          process.exit(0);
        }),
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
