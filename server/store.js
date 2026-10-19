import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { materialTotals } from "../shared/domain.js";

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const text = (max = 10000) => z.string().max(max).default("");
const id = z
  .string()
  .min(1)
  .max(150)
  .regex(/^[A-Za-z0-9_:.-]+$/);
const nullableNumber = z.number().finite().nullable().default(null);
const positiveNullable = z
  .number()
  .finite()
  .nonnegative()
  .nullable()
  .default(null);
const isDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const date = z
  .string()
  .refine(
    (value) => !value || isDate(value),
    "Use a real date in YYYY-MM-DD format",
  )
  .default("");
const timestamp = z
  .string()
  .refine(
    (value) =>
      !value ||
      (!Number.isNaN(Date.parse(value)) &&
        (/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || isDate(value))),
    "Use an ISO timestamp with timezone",
  )
  .default("");
const clock = z
  .string()
  .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/)
  .default("");
const materials = z
  .array(
    z
      .object({ inventoryId: id, quantity: z.number().finite().nonnegative() })
      .strict(),
  )
  .max(500)
  .default([]);
const base = {
  id: id.optional(),
  version: z.number().int().positive().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
};

export const recordSchemas = {
  jobs: z
    .object({
      ...base,
      title: z.string().trim().min(1).max(300),
      clientName: text(300),
      phone: text(60),
      address: text(1000),
      date,
      bookingStatus: z
        .enum(["tentative", "confirmed", "cancelled"])
        .default("tentative"),
      areaSqft: positiveNullable,
      system: text(1000),
      product: text(1000),
      crew: text(1000),
      arrivalTime: clock,
      access: text(),
      scope: text(),
      materials,
      source: z.enum(["manual", "timetree", "calendar"]).default("manual"),
      sourceEventId: text(500),
      sourceVerifiedAt: timestamp,
      notes: text(),
    })
    .strict(),
  inventory: z
    .object({
      ...base,
      name: z.string().trim().min(1).max(300),
      unit: text(80),
      quantity: nullableNumber,
      location: text(300),
      minimum: positiveNullable,
      exactProduct: text(500),
      notes: text(),
      stockGeneration: z.number().int().nonnegative().optional(),
    })
    .strict(),
  dailySheets: z
    .object({
      ...base,
      date,
      jobId: text(150),
      crew: z
        .array(
          z
            .object({
              person: text(200),
              role: text(200),
              start: clock,
              end: clock,
              driveMinutes: z.number().finite().nonnegative().default(0),
              breakMinutes: z.number().finite().nonnegative().default(0),
            })
            .strict(),
        )
        .max(100)
        .default([]),
      conditions: text(),
      coatsCompleted: text(),
      materials,
      issues: text(),
      delayMinutes: positiveNullable,
      delayCause: text(),
      deliveryCost: positiveNullable,
      tomorrowNeeds: text(),
      status: z.enum(["draft", "reviewed"]).default("draft"),
      remindAt: timestamp,
      inventoryEffect: z.any().optional(),
    })
    .strict(),
  loadChecks: z
    .object({
      ...base,
      jobId: text(150),
      checkpoint: text(300),
      vehicle: text(300),
      checkedBy: z.string().max(200).default("Aidan"),
      checkedAt: timestamp,
      requirementsConfirmed: z.boolean().default(false),
      items: z
        .array(
          z
            .object({
              inventoryId: id.optional(),
              name: text(300),
              unit: text(80),
              required: positiveNullable,
              counted: positiveNullable,
              location: text(300),
            })
            .strict(),
        )
        .max(500)
        .default([]),
      notes: text(),
    })
    .strict(),
  actions: z
    .object({
      ...base,
      jobId: text(150),
      title: z.string().trim().min(1).max(500),
      owner: text(200),
      dueAt: timestamp,
      status: z.enum(["open", "waiting", "done"]).default("open"),
      notes: text(),
      sourceType: text(100),
      sourceId: text(150),
    })
    .strict(),
  reminders: z
    .object({
      ...base,
      title: z.string().trim().min(1).max(500),
      body: text(),
      dueAt: timestamp,
      expiresAt: timestamp,
      status: z
        .enum(["pending", "sent", "expired", "cancelled"])
        .default("pending"),
      jobId: text(150),
      sourceType: text(100),
      sourceId: text(150),
    })
    .strict(),
  calendarEvents: z
    .object({
      ...base,
      title: z.string().trim().min(1).max(500),
      start: timestamp,
      end: timestamp,
      allDay: z.boolean().default(false),
      jobId: text(150),
      source: z.enum(["manual", "timetree", "google", "ics"]).default("manual"),
      sourceEventId: text(500),
      description: text(30000),
      location: text(1000),
    })
    .strict(),
};

export const DEFAULT_SETTINGS = {
  timezone: "America/Toronto",
  ownerName: "Aidan",
  maxPhone: "",
  danielPhone: "",
  notificationTime: "20:00",
  followupRecipient: "Max",
  smsAutomationEnabled: false,
  smsAutomationPaused: false,
  followupTime: "19:08",
  followupDaysAhead: 2,
  followupRequiredFields: [
    "address",
    "areaSqft",
    "system",
    "arrivalTime",
    "access",
    "scope",
    "crew",
  ],
  pushEnabled: true,
};

const settingsSchema = z
  .object({
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
    ownerName: z.string().trim().min(1).max(200),
    maxPhone: z
      .string()
      .max(40)
      .regex(
        /^$|^\+[1-9]\d{7,14}$/,
        "Use an international number, such as +14165551234",
      ),
    danielPhone: z
      .string()
      .max(40)
      .regex(/^$|^\+[1-9]\d{7,14}$/, "Use an international number"),
    notificationTime: clock,
    followupRecipient: z.enum(["Max", "Daniel"]),
    smsAutomationEnabled: z.boolean(),
    smsAutomationPaused: z.boolean(),
    followupTime: clock,
    followupDaysAhead: z.number().int().min(0).max(30),
    followupRequiredFields: z
      .array(
        z.enum([
          "address",
          "areaSqft",
          "system",
          "product",
          "arrivalTime",
          "access",
          "scope",
          "crew",
          "date",
          "clientName",
          "phone",
        ]),
      )
      .max(15),
    pushEnabled: z.boolean(),
  })
  .strict();

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(
      400,
      "Please correct the highlighted information.",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  return result.data;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter(
          (key) =>
            ![
              "id",
              "version",
              "createdAt",
              "updatedAt",
              "stockGeneration",
              "inventoryEffect",
            ].includes(key),
        )
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const equal = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const roundQuantity = (value) =>
  Math.round((value + Number.EPSILON) * 1e8) / 1e8;

export function createStore(filename = ":memory:") {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(collection,id));
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory_ledger (sheet_id TEXT NOT NULL,inventory_id TEXT NOT NULL,quantity REAL NOT NULL,applied INTEGER NOT NULL,generation INTEGER NOT NULL,PRIMARY KEY(sheet_id,inventory_id));
    CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY,event TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_config (id INTEGER PRIMARY KEY CHECK(id=1),password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);`);
  db.prepare("INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)").run(
    JSON.stringify(DEFAULT_SETTINGS),
  );

  function collectionSchema(collection) {
    if (!Object.hasOwn(recordSchemas, collection))
      throw new HttpError(404, "Unknown record collection.");
    return recordSchemas[collection];
  }
  function getRecord(collection, recordId) {
    collectionSchema(collection);
    const row = db
      .prepare("SELECT data FROM records WHERE collection=? AND id=?")
      .get(collection, recordId);
    return row ? JSON.parse(row.data) : null;
  }
  function getRecords(collection) {
    collectionSchema(collection);
    return db
      .prepare(
        "SELECT data FROM records WHERE collection=? ORDER BY created_at DESC,id",
      )
      .all(collection)
      .map((row) => JSON.parse(row.data));
  }
  function getSettings() {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(
        db.prepare("SELECT data FROM settings WHERE id=1").get().data,
      ),
    };
  }
  function emitAudit(event, details = {}) {
    db.prepare("INSERT INTO audit_log VALUES(?,?,?,?)").run(
      randomUUID(),
      event,
      JSON.stringify(details),
      new Date().toISOString(),
    );
  }
  function updateSettings(updates) {
    const next = parse(settingsSchema, { ...getSettings(), ...updates });
    db.prepare("UPDATE settings SET data=? WHERE id=1").run(
      JSON.stringify(next),
    );
    emitAudit("settings.updated", { fields: Object.keys(updates) });
    return next;
  }
  function writeRecord(collection, value, old = null) {
    const now = new Date().toISOString();
    const record = {
      ...value,
      id: value.id || randomUUID(),
      version: (old?.version || 0) + 1,
      createdAt: old?.createdAt || now,
      updatedAt: now,
    };
    db.prepare(
      "INSERT INTO records(collection,id,version,data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET version=excluded.version,data=excluded.data,updated_at=excluded.updated_at",
    ).run(
      collection,
      record.id,
      record.version,
      JSON.stringify(record),
      record.createdAt,
      record.updatedAt,
    );
    return record;
  }
  function references(collection, record) {
    if (record.jobId && !getRecord("jobs", record.jobId))
      throw new HttpError(400, "The linked job does not exist.");
    if (collection === "jobs" || collection === "dailySheets")
      for (const line of record.materials || []) {
        if (!getRecord("inventory", line.inventoryId))
          throw new HttpError(
            400,
            "A selected inventory item no longer exists.",
            { inventoryId: line.inventoryId },
          );
      }
  }
  function applyMaterials(record, old) {
    const previous = db
      .prepare("SELECT * FROM inventory_ledger WHERE sheet_id=?")
      .all(record.id);
    const totals =
      record.status === "reviewed" ? materialTotals(record.materials) : {};
    const previousTotals = Object.fromEntries(
      previous.map((entry) => [entry.inventory_id, entry.quantity]),
    );
    if (old && equal(totals, previousTotals) && old.status === record.status)
      return old.inventoryEffect || { applied: [], unknown: [] };
    // A newer physical count supersedes old consumption. Never reverse it blindly.
    for (const entry of previous) {
      const inventory = getRecord("inventory", entry.inventory_id);
      if (!inventory || (inventory.stockGeneration || 0) !== entry.generation)
        throw new HttpError(
          409,
          "Inventory was physically recounted after this sheet. Reconcile its material correction with the current inventory count first.",
          {
            inventoryId: entry.inventory_id,
            reason: "inventory-baseline-changed",
          },
        );
    }
    for (const entry of previous) {
      if (entry.applied) {
        const inventory = getRecord("inventory", entry.inventory_id);
        if (inventory.quantity !== null)
          writeRecord(
            "inventory",
            {
              ...inventory,
              quantity: roundQuantity(inventory.quantity + entry.quantity),
            },
            inventory,
          );
      }
    }
    db.prepare("DELETE FROM inventory_ledger WHERE sheet_id=?").run(record.id);
    const effect = { applied: [], unknown: [] };
    for (const [inventoryId, quantity] of Object.entries(totals)) {
      const inventory = getRecord("inventory", inventoryId);
      if (!inventory)
        throw new HttpError(400, "A selected inventory item no longer exists.");
      const applied = inventory.quantity !== null;
      if (applied)
        writeRecord(
          "inventory",
          {
            ...inventory,
            quantity: roundQuantity(inventory.quantity - quantity),
          },
          inventory,
        );
      effect[applied ? "applied" : "unknown"].push({ inventoryId, quantity });
      db.prepare("INSERT INTO inventory_ledger VALUES(?,?,?,?,?)").run(
        record.id,
        inventoryId,
        quantity,
        applied ? 1 : 0,
        inventory.stockGeneration || 0,
      );
    }
    return effect;
  }
  function syncReminder(sheet) {
    const reminderId = `daily-${sheet.id}`;
    const old = getRecord("reminders", reminderId);
    const hasContent = Boolean(sheet.tomorrowNeeds.trim());
    const scheduled = hasContent && Boolean(sheet.remindAt);
    const title = `Prepare for tomorrow${sheet.date ? ` · ${sheet.date}` : ""}`;
    const body = sheet.tomorrowNeeds.trim();
    if (!hasContent && !old) return;
    let status = scheduled ? "pending" : "cancelled";
    if (
      old &&
      old.body === body &&
      old.dueAt === sheet.remindAt &&
      ["sent", "expired"].includes(old.status)
    )
      status = old.status;
    const next = {
      id: reminderId,
      title,
      body,
      dueAt: sheet.remindAt || "",
      expiresAt: "",
      status,
      jobId: sheet.jobId || "",
      sourceType: "dailySheet",
      sourceId: sheet.id,
    };
    if (!old || !equal(old, next)) writeRecord("reminders", next, old);
  }
  function saveRecord(collection, input, options = {}) {
    const record = parse(collectionSchema(collection), input);
    record.id ||= randomUUID();
    const old = getRecord(collection, record.id);
    const expected = options.expectedVersion ?? record.version;
    if (options.createOnly && old) {
      if (equal(old, record)) return old;
      throw new HttpError(
        409,
        "A different record already uses this ID. Refresh before retrying.",
        { current: old },
      );
    }
    if (options.updateOnly && !old)
      throw new HttpError(404, "This record no longer exists.");
    if (old && expected !== old.version) {
      // Replaying a successful save is safe; conflicting stale content is not.
      if (equal(old, record)) return old;
      throw new HttpError(
        409,
        "This record changed elsewhere. Your edits are retained; refresh and compare before saving.",
        { current: old },
      );
    }
    if (
      collection === "reminders" &&
      !options.system &&
      ["sent", "expired"].includes(record.status) &&
      record.status !== old?.status
    )
      throw new HttpError(
        400,
        "Only the delivery service can mark a reminder sent or expired.",
      );
    if (
      collection === "reminders" &&
      old?.sourceType === "dailySheet" &&
      !options.system
    )
      throw new HttpError(
        409,
        "Edit the linked Daily Sheet to change this reminder.",
      );
    references(collection, record);
    if (collection === "dailySheets" && record.status === "reviewed") {
      if (!record.date || !record.jobId)
        throw new HttpError(
          400,
          "Choose a date and job before reviewing a Daily Sheet. Drafts can remain incomplete.",
        );
      if (
        record.crew.some(
          (person) => !person.person.trim() || !person.role.trim(),
        )
      )
        throw new HttpError(
          400,
          "Each crew member needs a name and responsibility before review.",
        );
    }
    if (
      collection === "calendarEvents" &&
      (!record.start ||
        !record.end ||
        Date.parse(record.end) <= Date.parse(record.start))
    )
      throw new HttpError(
        400,
        "The calendar event needs an end after its start.",
      );
    if (collection === "inventory")
      record.stockGeneration = old
        ? (old.stockGeneration || 0) +
          (old.quantity !== record.quantity ? 1 : 0)
        : 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (collection === "dailySheets")
        record.inventoryEffect = applyMaterials(record, old);
      const saved = writeRecord(collection, record, old);
      if (collection === "dailySheets") syncReminder(saved);
      emitAudit("record.saved", {
        collection,
        id: saved.id,
        version: saved.version,
      });
      db.exec("COMMIT");
      return saved;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function deleteRecord(collection, recordId, expectedVersion) {
    collectionSchema(collection);
    const old = getRecord(collection, recordId);
    if (!old) throw new HttpError(404, "This record no longer exists.");
    if (old.version !== Number(expectedVersion))
      throw new HttpError(
        409,
        "This record changed elsewhere. Refresh before deleting.",
        { current: old },
      );
    if (collection === "jobs") {
      const linked = [
        "dailySheets",
        "loadChecks",
        "actions",
        "reminders",
        "calendarEvents",
      ].some((name) =>
        getRecords(name).some((record) => record.jobId === recordId),
      );
      if (linked)
        throw new HttpError(
          409,
          "This job has linked records. Cancel it to keep its history.",
        );
    }
    if (collection === "inventory") {
      const linked =
        ["jobs", "dailySheets"].some((name) =>
          getRecords(name).some((record) =>
            record.materials.some((line) => line.inventoryId === recordId),
          ),
        ) ||
        getRecords("loadChecks").some((record) =>
          record.items.some((line) => line.inventoryId === recordId),
        );
      if (linked)
        throw new HttpError(
          409,
          "This inventory item is used in saved records. Keep it to preserve history.",
        );
    }
    if (collection === "reminders" && old.sourceType === "dailySheet")
      throw new HttpError(
        409,
        "Clear the reminder time in its Daily Sheet instead.",
      );
    const warnings = [];
    db.exec("BEGIN IMMEDIATE");
    try {
      if (collection === "dailySheets") {
        for (const entry of db
          .prepare("SELECT * FROM inventory_ledger WHERE sheet_id=?")
          .all(recordId)) {
          const inventory = getRecord("inventory", entry.inventory_id);
          if (
            entry.applied &&
            inventory &&
            inventory.quantity !== null &&
            (inventory.stockGeneration || 0) === entry.generation
          )
            writeRecord(
              "inventory",
              {
                ...inventory,
                quantity: roundQuantity(inventory.quantity + entry.quantity),
              },
              inventory,
            );
          else
            warnings.push({
              inventoryId: entry.inventory_id,
              reason: entry.applied
                ? "Newer physical count preserved; historical use was not restored."
                : "Unknown stock baseline; no quantity was changed.",
            });
        }
        db.prepare("DELETE FROM inventory_ledger WHERE sheet_id=?").run(
          recordId,
        );
        const reminder = getRecord("reminders", `daily-${recordId}`);
        if (reminder)
          writeRecord(
            "reminders",
            { ...reminder, status: "cancelled" },
            reminder,
          );
      }
      db.prepare("DELETE FROM records WHERE collection=? AND id=?").run(
        collection,
        recordId,
      );
      emitAudit("record.deleted", { collection, id: recordId, warnings });
      db.exec("COMMIT");
      return { deleted: true, warnings };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function state() {
    return {
      ...Object.fromEntries(
        Object.keys(recordSchemas).map((name) => [name, getRecords(name)]),
      ),
      settings: getSettings(),
    };
  }
  function backup() {
    return {
      format: "hardbond-backup",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      ...state(),
      inventoryLedger: db.prepare("SELECT * FROM inventory_ledger").all(),
    };
  }
  function restoreBackup(input) {
    if (
      !input ||
      input.format !== "hardbond-backup" ||
      input.schemaVersion !== 1
    )
      throw new HttpError(400, "This is not a supported HARDBOND backup.");
    if (Object.keys(recordSchemas).some((name) => getRecords(name).length))
      throw new HttpError(
        409,
        "Restore is allowed only into an empty workspace to avoid overwriting current work.",
      );
    const settings = parse(settingsSchema, {
      ...DEFAULT_SETTINGS,
      ...input.settings,
    });
    const collections = {};
    for (const name of Object.keys(recordSchemas)) {
      if (!Array.isArray(input[name]) || input[name].length > 50000)
        throw new HttpError(400, `Invalid ${name} records in backup.`);
      collections[name] = input[name].map((row) =>
        parse(recordSchemas[name], row),
      );
      if (
        collections[name].some((row) => !row.id) ||
        new Set(collections[name].map((row) => row.id)).size !==
          collections[name].length
      )
        throw new HttpError(400, `Missing or duplicate ${name} IDs.`);
    }
    const ledgerSchema = z.array(
      z
        .object({
          sheet_id: id,
          inventory_id: id,
          quantity: z.number().finite().nonnegative(),
          applied: z.union([z.literal(0), z.literal(1)]),
          generation: z.number().int().nonnegative(),
        })
        .strict(),
    );
    const ledger = parse(ledgerSchema, input.inventoryLedger || []);
    const jobIds = new Set(collections.jobs.map((row) => row.id));
    const inventoryIds = new Set(collections.inventory.map((row) => row.id));
    const sheets = new Map(collections.dailySheets.map((row) => [row.id, row]));
    for (const rows of Object.values(collections))
      for (const row of rows)
        if (row.jobId && !jobIds.has(row.jobId))
          throw new HttpError(400, "Backup has a missing job reference.");
    for (const row of [...collections.jobs, ...collections.dailySheets])
      for (const line of row.materials)
        if (!inventoryIds.has(line.inventoryId))
          throw new HttpError(400, "Backup has a missing inventory reference.");
    const ledgerKeys = new Set();
    for (const entry of ledger) {
      const key = `${entry.sheet_id}/${entry.inventory_id}`;
      const sheet = sheets.get(entry.sheet_id);
      if (
        ledgerKeys.has(key) ||
        !sheet ||
        sheet.status !== "reviewed" ||
        !inventoryIds.has(entry.inventory_id) ||
        materialTotals(sheet.materials)[entry.inventory_id] !== entry.quantity
      )
        throw new HttpError(
          400,
          "Backup inventory ledger does not match its reviewed sheets.",
        );
      ledgerKeys.add(key);
    }
    for (const sheet of collections.dailySheets.filter(
      (row) => row.status === "reviewed",
    ))
      for (const inventoryId of Object.keys(materialTotals(sheet.materials)))
        if (!ledgerKeys.has(`${sheet.id}/${inventoryId}`))
          throw new HttpError(
            400,
            "Backup is missing inventory accounting entries.",
          );
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [collection, rows] of Object.entries(collections))
        for (const row of rows) {
          const restored = {
            ...row,
            version: row.version || 1,
            createdAt: row.createdAt || new Date().toISOString(),
            updatedAt: row.updatedAt || new Date().toISOString(),
          };
          db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?)").run(
            collection,
            row.id,
            restored.version,
            JSON.stringify(restored),
            restored.createdAt,
            restored.updatedAt,
          );
        }
      for (const entry of ledger)
        db.prepare("INSERT INTO inventory_ledger VALUES(?,?,?,?,?)").run(
          entry.sheet_id,
          entry.inventory_id,
          entry.quantity,
          entry.applied,
          entry.generation,
        );
      // Automation remains paused after restore until the owner checks recipients and timing.
      db.prepare("UPDATE settings SET data=? WHERE id=1").run(
        JSON.stringify({ ...settings, smsAutomationPaused: true }),
      );
      emitAudit("backup.restored", {
        counts: Object.fromEntries(
          Object.entries(collections).map(([key, rows]) => [key, rows.length]),
        ),
      });
      db.exec("COMMIT");
      return state();
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return {
    db,
    getRecord,
    getRecords,
    getSettings,
    updateSettings,
    saveRecord,
    deleteRecord,
    state,
    backup,
    restoreBackup,
    emitAudit,
    close: () => db.close(),
  };
}

export function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
