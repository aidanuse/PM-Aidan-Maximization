import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { HttpError } from "./store-core.js";
const INTERVAL = 5 * 60_000;
const digest = (token) => createHash("sha256").update(token).digest("hex");
const bad = (message) => {
  throw new HttpError(400, message);
};
// A diagnostic is only a tree of schema keys and type labels, never raw event values.
function validShape(value, depth = 0) {
  if (depth > 8) return false;
  if (typeof value === "string")
    return [
      "string",
      "number",
      "boolean",
      "null",
      "undefined",
      "…",
      "[redacted]",
    ].includes(value);
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.type === "array")
    return (
      Object.keys(value).every((k) =>
        ["type", "count", "sample"].includes(k),
      ) &&
      Number.isInteger(value.count) &&
      value.count >= 0 &&
      validShape(value.sample, depth + 1)
    );
  return (
    Object.keys(value).length <= 80 &&
    Object.entries(value).every(
      ([k, v]) =>
        (/^[a-zA-Z_]{1,45}$/.test(k) || k === "[dynamic key]") &&
        validShape(v, depth + 1),
    )
  );
}
export function createTimeTreeBridge({ db, now = () => new Date() }) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS integration_timetree_bridge (id INTEGER PRIMARY KEY CHECK(id=1), token_hash TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '{}'); INSERT OR IGNORE INTO integration_timetree_bridge(id) VALUES(1);`,
  );
  const read = () => {
    const row = db
      .prepare("SELECT * FROM integration_timetree_bridge WHERE id=1")
      .get();
    return { hash: row.token_hash, state: JSON.parse(row.state) };
  };
  const write = (state) =>
    db
      .prepare("UPDATE integration_timetree_bridge SET state=? WHERE id=1")
      .run(JSON.stringify(state));
  function status() {
    const { hash, state } = read();
    return {
      ...state,
      paired: !!hash,
      paused: state.paused !== false,
      online:
        !!hash &&
        !!state.lastSeen &&
        now().getTime() - Date.parse(state.lastSeen) < 90_000,
      transferEnabled: false,
      stage: "awaiting-event-mapping",
      intervalMinutes: 5,
    };
  }
  function pair() {
    const token = randomBytes(32).toString("base64url");
    const state = {
      paused: true,
      pairedAt: now().toISOString(),
      requestId: randomUUID(),
      requestAt: now().toISOString(),
      lastSeen: null,
      lastCheck: null,
      observation: "not-checked",
      diagnostics: null,
    };
    db.prepare(
      "UPDATE integration_timetree_bridge SET token_hash=?, state=? WHERE id=1",
    ).run(digest(token), JSON.stringify(state));
    return { token, status: status() };
  }
  function disconnect() {
    db.prepare(
      "UPDATE integration_timetree_bridge SET token_hash='', state='{}' WHERE id=1",
    ).run();
    return status();
  }
  function authenticate(value) {
    const token =
      typeof value === "string" && value.startsWith("Bearer ")
        ? value.slice(7)
        : "";
    const { hash } = read();
    if (
      !hash ||
      !/^[-_A-Za-z0-9]{43}$/.test(token) ||
      !timingSafeEqual(
        Buffer.from(hash, "hex"),
        Buffer.from(digest(token), "hex"),
      )
    )
      throw new HttpError(
        401,
        "Windows pairing expired or was revoked. Pair again in HARDBOND.",
      );
  }
  function control(body) {
    const { hash, state } = read();
    if (!hash) throw new HttpError(409, "Pair your Windows PC first.");
    if (body?.action === "refresh") {
      if (!state.requestId) {
        state.requestId = randomUUID();
        state.requestAt = now().toISOString();
      }
    } else if (body?.action === "pause") {
      state.paused = true;
      state.requestId = null;
      state.requestAt = null;
    } else if (body?.action === "resume") {
      state.paused = false;
      state.nextCheck = 0;
    } else bad("Choose refresh, pause or resume.");
    write(state);
    return status();
  }
  function poll(body) {
    if (
      typeof body?.version !== "string" ||
      !/^\d+\.\d+\.\d+$/.test(body.version)
    )
      bad("Invalid connector version.");
    const { state } = read();
    const stamp = now().getTime();
    state.lastSeen = now().toISOString();
    state.connectorVersion = body.version;
    if (
      !state.paused &&
      !state.requestId &&
      (!state.nextCheck || state.nextCheck <= stamp)
    ) {
      state.requestId = randomUUID();
      state.requestAt = now().toISOString();
    }
    write(state);
    return {
      paused: state.paused !== false,
      request: state.requestId
        ? { id: state.requestId, kind: "inspect-calendar" }
        : null,
      pollSeconds: 15,
      transferEnabled: false,
    };
  }
  function complete(body) {
    const { state } = read();
    if (!state.requestId || body?.requestId !== state.requestId)
      throw new HttpError(
        409,
        "This connection check was cancelled or replaced.",
      );
    const report = body.report;
    if (
      !report ||
      !Array.isArray(report.eventResponseShapes) ||
      report.eventResponseShapes.length > 12 ||
      JSON.stringify(report).length > 100_000 ||
      !report.eventResponseShapes.every((s) => validShape(s))
    )
      bad(
        "Send field names and types only; raw calendar data is not accepted.",
      );
    if (
      !["events-observed", "no-events", "browser-unavailable"].includes(
        body.observation,
      )
    )
      bad("Invalid connection result.");
    if (
      (body.observation === "events-observed") !==
      report.eventResponseShapes.length > 0
    )
      bad("Connection result does not match observations.");
    state.diagnostics = {
      toolVersion: state.connectorVersion || "unknown",
      capturedAt: now().toISOString(),
      eventResponseShapes: report.eventResponseShapes,
      transferEnabled: false,
    };
    state.observation = body.observation;
    state.lastCheck = now().toISOString();
    state.lastSeen = now().toISOString();
    state.requestId = null;
    state.requestAt = null;
    state.nextCheck = now().getTime() + INTERVAL;
    write(state);
    return { accepted: true, transferEnabled: false };
  }
  return { status, pair, disconnect, authenticate, control, poll, complete };
}
export function registerTimeTreeBridge(app, bridge, auth) {
  const route = (handler) => async (req, res, next) => {
    try {
      res.json(handler(req));
    } catch (e) {
      if (e.status) res.status(e.status).json({ error: e.message });
      else next(e);
    }
  };
  const client = (req, res, next) => {
    try {
      bridge.authenticate(req.get("authorization"));
      next();
    } catch (e) {
      res.status(e.status || 401).json({ error: e.message });
    }
  };
  const root = "/api/integrations/timetree-bridge";
  app.get(
    root,
    auth,
    route(() => bridge.status()),
  );
  app.post(
    `${root}/pair`,
    auth,
    route(() => bridge.pair()),
  );
  app.post(
    `${root}/disconnect`,
    auth,
    route(() => bridge.disconnect()),
  );
  app.post(
    `${root}/control`,
    auth,
    route((req) => bridge.control(req.body)),
  );
  app.post(
    `${root}/poll`,
    client,
    route((req) => bridge.poll(req.body)),
  );
  app.post(
    `${root}/result`,
    client,
    route((req) => bridge.complete(req.body)),
  );
}
