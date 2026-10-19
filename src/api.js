const PREFIX = "hardbond:v1:";
const CACHE_KEY = `${PREFIX}state`;
const QUEUE_KEY = `${PREFIX}outbox`;
const COLLECTIONS = new Set([
  "jobs",
  "inventory",
  "dailySheets",
  "loadChecks",
  "actions",
  "reminders",
  "calendarEvents",
]);
let flushing = null;

export class ApiError extends Error {
  constructor(message, { status = 0, details, networkError = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.networkError = networkError;
  }
}

function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new ApiError(
      "This device could not save your offline changes. Free some storage or reconnect before leaving this screen.",
    );
  }
}

function announceQueue() {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("hardbond:queue", { detail: getQueue() }),
    );
}

function setQueue(queue) {
  writeLocal(QUEUE_KEY, queue);
  announceQueue();
}

export function getQueue() {
  const queue = readLocal(QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (
    ["POST", "PUT", "PATCH"].includes(options.method?.toUpperCase()) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  let body = options.body;
  if (
    body != null &&
    typeof body !== "string" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob)
  ) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  } else if (typeof body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response;
  try {
    response = await fetch(path, {
      ...options,
      body,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      "Cannot reach HARDBOND. Check your connection and try again.",
      { networkError: true },
    );
  }
  let raw;
  try {
    raw = await response.text();
  } catch {
    throw new ApiError(
      "The server response was interrupted. Reconnect to confirm this change.",
      { status: response.ok ? 0 : response.status, networkError: response.ok },
    );
  }
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ApiError(
        response.ok
          ? "The server returned an unreadable response. Your change has not been queued."
          : `The server could not complete this request (${response.status}).`,
        { status: response.status },
      );
    }
  }
  if (!response.ok)
    throw new ApiError(
      (data?.error || `Request failed (${response.status}).`) +
        (Array.isArray(data?.details)
          ? " " +
            data.details
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("; ")
          : ""),
      { status: response.status, details: data?.details },
    );
  return data;
}

function overlayQueue(state) {
  const next = { ...state };
  for (const entry of getQueue()) {
    if (!COLLECTIONS.has(entry.collection)) continue;
    const records = [...(next[entry.collection] || [])];
    const index = records.findIndex((record) => record.id === entry.recordId);
    if (entry.operation === "delete") {
      if (index !== -1)
        records[index] = {
          ...records[index],
          _queued: true,
          _pendingDelete: true,
          _syncError: entry.error || "",
        };
    } else {
      const record = {
        ...entry.record,
        _queued: true,
        _pendingDelete: Boolean(entry.deleteAfterSync),
        _syncError: entry.error || "",
      };
      if (index === -1) records.push(record);
      else records[index] = record;
    }
    next[entry.collection] = records;
  }
  return next;
}

export async function loadState() {
  try {
    const state = await request("/api/state");
    // A readable live app still works if device storage is disabled. Offline writes fail clearly.
    try {
      writeLocal(CACHE_KEY, state);
    } catch {
      /* Server remains the source of truth. */
    }
    return { ...overlayQueue(state), _offline: false };
  } catch (error) {
    if (!error.networkError) throw error;
    const cached = readLocal(CACHE_KEY, null);
    if (!cached)
      throw new ApiError(
        "Connect once to load your workspace before working offline.",
        { networkError: true },
      );
    return { ...overlayQueue(cached), _offline: true };
  }
}

function cleanRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.startsWith("_")),
  );
}

function validateCollection(collection) {
  if (!COLLECTIONS.has(collection))
    throw new ApiError("Unknown record collection.");
}

function queueWrite(collection, record, operation, version) {
  const queue = getQueue();
  const index = queue.findIndex(
    (entry) => entry.collection === collection && entry.recordId === record.id,
  );
  const existing = index < 0 ? null : queue[index];
  const now = new Date().toISOString();
  const entry = {
    id: existing?.id || crypto.randomUUID(),
    collection,
    recordId: record.id,
    operation:
      existing?.operation === "create" && operation !== "delete"
        ? "create"
        : operation,
    record: cleanRecord(record),
    version: existing?.version ?? version,
    status: existing?.status || "pending",
    error: existing?.error || "",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    revision: (existing?.revision || 0) + 1,
  };
  if (index < 0) queue.push(entry);
  else queue[index] = entry;
  setQueue(queue);
  return { ...record, _queued: true, _syncError: entry.error || "" };
}

export async function saveRecord(collection, input) {
  validateCollection(collection);
  const record = { ...cleanRecord(input), id: input.id || crypto.randomUUID() };
  const operation =
    Number.isInteger(record.version) && record.version > 0
      ? "update"
      : "create";
  // Preserve operation order for a record which already has a local edit.
  if (
    getQueue().some(
      (entry) =>
        entry.collection === collection && entry.recordId === record.id,
    )
  )
    return queueWrite(collection, record, operation, record.version);
  try {
    const response = await request(
      operation === "create"
        ? `/api/records/${collection}`
        : `/api/records/${collection}/${encodeURIComponent(record.id)}`,
      {
        method: operation === "create" ? "POST" : "PUT",
        body: record,
      },
    );
    return response.record;
  } catch (error) {
    // Rejected writes, invalid data, auth errors, and server failures are never silently queued.
    if (!error.networkError) throw error;
    return queueWrite(collection, record, operation, record.version);
  }
}

export async function deleteRecord(collection, id, version) {
  validateCollection(collection);
  const existing = getQueue().find(
    (entry) => entry.collection === collection && entry.recordId === id,
  );
  // A create may already have reached the server before its response was lost. Do not drop it
  // locally and leave a hidden server record: first synchronize the create, then delete it.
  if (existing) {
    const queue = getQueue();
    const index = queue.findIndex((entry) => entry.id === existing.id);
    queue[index] = {
      ...existing,
      deleteAfterSync: true,
      revision: existing.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    setQueue(queue);
    return { id, _queued: true, _pendingDelete: true };
  }
  try {
    await request(
      `/api/records/${collection}/${encodeURIComponent(id)}?version=${encodeURIComponent(version)}`,
      { method: "DELETE" },
    );
    return { id, deleted: true };
  } catch (error) {
    if (!error.networkError) throw error;
    queueWrite(collection, { id, version }, "delete", version);
    return { id, _queued: true, _pendingDelete: true };
  }
}

async function flushUnlocked() {
  let sent = 0;
  const initialIds = getQueue()
    .filter((entry) => entry.status === "pending")
    .map((entry) => entry.id);
  for (const id of initialIds) {
    const entry = getQueue().find((item) => item.id === id);
    if (!entry || entry.status !== "pending") continue;
    const base = `/api/records/${entry.collection}`;
    const path =
      entry.operation === "create"
        ? base
        : `${base}/${encodeURIComponent(entry.recordId)}${entry.operation === "delete" ? `?version=${encodeURIComponent(entry.version)}` : ""}`;
    try {
      const response = await request(path, {
        method: { create: "POST", update: "PUT", delete: "DELETE" }[
          entry.operation
        ],
        ...(entry.operation !== "delete" && { body: entry.record }),
      });
      const queue = getQueue();
      const index = queue.findIndex((item) => item.id === id);
      if (index !== -1) {
        const latest = queue[index];
        if (latest.deleteAfterSync && entry.operation !== "delete") {
          queue[index] = {
            ...latest,
            operation: "delete",
            record: { id: entry.recordId, version: response.record.version },
            version: response.record.version,
            deleteAfterSync: false,
            revision: latest.revision + 1,
          };
          initialIds.push(id);
        } else if (latest.revision === entry.revision) queue.splice(index, 1);
        else if (response?.record) {
          queue[index] = {
            ...latest,
            operation: "update",
            record: { ...latest.record, version: response.record.version },
            version: response.record.version,
          };
          initialIds.push(id);
        }
        setQueue(queue);
      }
      sent += 1;
    } catch (error) {
      if (
        error.networkError ||
        error.status === 401 ||
        error.status === 403 ||
        error.status >= 500
      )
        break;
      const queue = getQueue();
      const index = queue.findIndex((item) => item.id === id);
      if (index !== -1) {
        queue[index] = {
          ...queue[index],
          status: error.status === 409 ? "conflict" : "rejected",
          error: error.message,
          errorStatus: error.status,
        };
        setQueue(queue);
      }
    }
  }
  const remaining = getQueue();
  return {
    sent,
    remaining: remaining.length,
    conflicts: remaining.filter((entry) => entry.status !== "pending"),
  };
}

export function flushQueue() {
  if (flushing) return flushing;
  const run = () => flushUnlocked();
  flushing = (
    globalThis.navigator?.locks
      ? navigator.locks.request("hardbond-outbox-flush", run)
      : run()
  ).finally(() => {
    flushing = null;
  });
  return flushing;
}

// Call only after showing the user the retained local edit and confirming discard.
export function discardQueued(entryId) {
  setQueue(getQueue().filter((entry) => entry.id !== entryId));
}

// The UI is responsible for confirming loss of pending local drafts before logout.
export function clearLocalData() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(QUEUE_KEY);
  announceQueue();
}

export async function subscribePush() {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new ApiError(
      "Push notifications need a supported browser. On iPhone, install HARDBOND on your Home Screen using Safari and open it there.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new ApiError(
      "Notifications are not enabled. Change this app’s notification permission in your device settings.",
    );
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await request("/api/push/public-key");
  if (!publicKey)
    throw new ApiError(
      "Push notification keys have not been configured on the server.",
    );
  const padded =
    publicKey.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (publicKey.length % 4)) % 4);
  const applicationServerKey = Uint8Array.from(atob(padded), (char) =>
    char.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));
  await request("/api/push/subscribe", {
    method: "POST",
    body: subscription.toJSON(),
  });
  return subscription;
}
