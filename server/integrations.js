import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import ICAL from "ical.js";
import webpush from "web-push";
import { pushFailureDetail } from "./push-errors.js";

const FIELD_LABELS = {
  phone: "client phone",
  date: "job date",
  clientName: "client name",
  address: "job address",
  areaSqft: "area in square feet",
  system: "coating system",
  product: "exact product",
  crew: "crew",
  arrivalTime: "arrival time",
  access: "access instructions",
  scope: "scope of work",
};
const DEFAULT_FIELDS = [
  "address",
  "areaSqft",
  "system",
  "arrivalTime",
  "access",
  "scope",
  "crew",
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const iso = (value) => new Date(value).toISOString();
const E164 = /^\+[1-9]\d{7,14}$/;

export function localClock(now = new Date(), timezone = "America/Toronto") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (name) => parts.find((p) => p.type === name)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export function missingJobFields(job, required = DEFAULT_FIELDS) {
  return required
    .filter((field) => Object.hasOwn(FIELD_LABELS, field))
    .filter((field) => {
      const value = job[field];
      return field === "areaSqft"
        ? !(Number(value) > 0)
        : typeof value !== "string" || !value.trim();
    })
    .map((field) => ({ field, label: FIELD_LABELS[field] }));
}

function normalizeSettings(settings) {
  const recipient = settings.followupRecipient === "Daniel" ? "Daniel" : "Max";
  let timezone = settings.timezone || "America/Toronto";
  try {
    localClock(new Date(), timezone);
  } catch {
    timezone = "America/Toronto";
  }
  return {
    ...settings,
    timezone,
    followupRecipient: recipient,
    followupTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.followupTime || "")
      ? settings.followupTime
      : "19:08",
    followupDaysAhead: Math.min(
      14,
      Math.max(0, Number(settings.followupDaysAhead ?? 2)),
    ),
    followupRequiredFields: Array.isArray(settings.followupRequiredFields)
      ? settings.followupRequiredFields
      : DEFAULT_FIELDS,
    recipientPhone: String(
      recipient === "Daniel"
        ? settings.danielPhone || ""
        : settings.maxPhone || "",
    ).trim(),
  };
}

export function buildFollowupPreview(
  jobs,
  rawSettings,
  now,
  gapHistory = new Map(),
) {
  const settings = normalizeSettings(rawSettings);
  const clock = localClock(now, settings.timezone);
  const endDate = new Date(`${clock.date}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + settings.followupDaysAhead);
  const lastDate = endDate.toISOString().slice(0, 10);
  const results = jobs
    .filter(
      (job) =>
        job.bookingStatus !== "cancelled" &&
        job.date >= clock.date &&
        job.date <= lastDate,
    )
    .map((job) => {
      const missing = missingJobFields(job, settings.followupRequiredFields);
      const signature = hash(
        JSON.stringify({
          id: job.id,
          date: job.date,
          fields: missing.map((field) => field.field),
          values: settings.followupRequiredFields.map((field) => [
            field,
            job[field] ?? null,
          ]),
        }),
      );
      const old = gapHistory.get(job.id);
      return {
        id: job.id,
        title: job.title,
        date: job.date,
        missing,
        signature,
        stale:
          !!job.source &&
          job.source !== "manual" &&
          (!job.sourceVerifiedAt ||
            !Number.isFinite(Date.parse(job.sourceVerifiedAt)) ||
            now.getTime() - Date.parse(job.sourceVerifiedAt) > 86400000),
        suppressed: old?.signature === signature && old.count >= 2,
        sentCount: old?.signature === signature ? old.count : 0,
      };
    })
    .filter((job) => job.missing.length)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    );
  const eligibleJobs = results.filter((job) => !job.suppressed && !job.stale);
  // Bound one digest so a busy schedule cannot unexpectedly create dozens of SMS segments.
  const included = [];
  const owner = String(settings.ownerName || "Aidan").slice(0, 50);
  const greeting = `Hi ${settings.followupRecipient}, ${owner}'s HARDBOND job-details check:`;
  let message = greeting;
  for (const job of eligibleJobs) {
    const line = `\n${job.date} ${String(job.title).slice(0, 90)}: please add ${job.missing.map((item) => item.label).join(", ")}.`;
    if ((message + line).length > 1300) break;
    message += line;
    included.push(job.id);
  }
  if (included.length)
    message += "\nPlease update the team calendar. Thank you.";
  else message = "";
  return {
    recipient: settings.followupRecipient,
    phoneConfigured: E164.test(settings.recipientPhone),
    scheduledTime: settings.followupTime,
    timezone: settings.timezone,
    localDate: clock.date,
    jobs: results,
    includedJobIds: included,
    deferredJobs: eligibleJobs.length - included.length,
    message,
    eligible: included.length > 0,
    blockers: [],
    todayAttempted: false,
  };
}

function initTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_subscriptions (endpoint TEXT PRIMARY KEY, subscription TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS integration_deliveries (id TEXT PRIMARY KEY, channel TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, detail TEXT NOT NULL, source_id TEXT);
    CREATE TABLE IF NOT EXISTS integration_sms_days (day TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS integration_gap_history (job_id TEXT PRIMARY KEY, signature TEXT NOT NULL, count INTEGER NOT NULL, last_sent_date TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS integration_calendar_sources (source_key TEXT PRIMARY KEY, record_id TEXT NOT NULL, fingerprint TEXT NOT NULL, synced_version INTEGER NOT NULL);
  `);
}

function initializeVapid(dataDir, env, db) {
  if (
    (env.VAPID_PUBLIC_KEY && !env.VAPID_PRIVATE_KEY) ||
    (!env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
  ) {
    return {
      ready: false,
      publicKey: null,
      source: "environment",
      error:
        "Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, or remove both to generate a persistent pair.",
    };
  }
  try {
    let keys;
    let source;
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
      keys = {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      };
      source = "environment";
    } else {
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      const path = join(dataDir, "vapid-keys.json");
      if (existsSync(path)) keys = JSON.parse(readFileSync(path, "utf8"));
      else {
        keys = webpush.generateVAPIDKeys();
        writeFileSync(path, JSON.stringify(keys), { mode: 0o600, flag: "wx" });
      }
      source = "generated";
    }
    const origin = /^https:\/\//.test(
      env.PUBLIC_URL || env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || "",
    )
      ? env.PUBLIC_URL || env.APP_ORIGIN || env.RENDER_EXTERNAL_URL
      : "";
    const subject = env.VAPID_SUBJECT || origin;
    if (!subject)
      return {
        ready: false,
        publicKey: keys.publicKey,
        source,
        error:
          "Set APP_ORIGIN to the public HTTPS address or set VAPID_SUBJECT to your contact mailto: address.",
      };
    // Validate before reporting readiness; private key stays in memory/file only.
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    return {
      ready: true,
      publicKey: keys.publicKey,
      source,
      details: { subject, ...keys },
    };
  } catch {
    return {
      ready: false,
      publicKey: null,
      source: "unavailable",
      error:
        "Push keys could not be loaded or validated. Check private file permissions and VAPID configuration.",
    };
  }
}

function validateSubscription(subscription) {
  if (
    !subscription ||
    typeof subscription.endpoint !== "string" ||
    !subscription.keys
  )
    return false;
  let endpoint;
  try {
    endpoint = new URL(subscription.endpoint);
  } catch {
    return false;
  }
  const domains = [
    "push.apple.com",
    "fcm.googleapis.com",
    "push.services.mozilla.com",
    "notify.windows.com",
    "notify.live.net",
  ];
  const knownProvider = domains.some(
    (domain) =>
      endpoint.hostname === domain || endpoint.hostname.endsWith(`.${domain}`),
  );
  return (
    endpoint.protocol === "https:" &&
    !endpoint.username &&
    !endpoint.password &&
    (!endpoint.port || endpoint.port === "443") &&
    knownProvider &&
    typeof subscription.keys.p256dh === "string" &&
    /^[A-Za-z0-9_-]{80,100}={0,2}$/.test(subscription.keys.p256dh) &&
    typeof subscription.keys.auth === "string" &&
    /^[A-Za-z0-9_-]{20,26}={0,2}$/.test(subscription.keys.auth)
  );
}

function safeError(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError")
    return "The provider request timed out; acceptance is unknown.";
  return "The provider could not accept the request. Check provider logs and configuration.";
}

export function createIntegrationService(context, options = {}) {
  const {
    db,
    getRecords,
    getSettings,
    saveRecord,
    emitAudit = () => {},
  } = context;
  const env = options.env || context.env || process.env;
  const now = options.now || (() => new Date());
  const pushSend = options.pushSend || webpush.sendNotification.bind(webpush);
  const fetcher = options.fetch || globalThis.fetch;
  const dataDir = context.dataDir || join(process.cwd(), "data");
  initTables(db);
  const vapid = options.vapid || initializeVapid(dataDir, env, db);
  let running = false;

  const log = (channel, status, detail, sourceId = null, id = randomUUID()) => {
    db.prepare(
      "INSERT INTO integration_deliveries (id,channel,status,created_at,detail,source_id) VALUES (?,?,?,?,?,?)",
    ).run(id, channel, status, iso(now()), detail, sourceId);
    emitAudit("integration_delivery", { channel, status, sourceId });
  };

  function smsConfig() {
    const settings = normalizeSettings(getSettings());
    return {
      settings,
      ready: !!(
        env.TWILIO_ACCOUNT_SID &&
        env.TWILIO_AUTH_TOKEN &&
        E164.test(env.TWILIO_FROM_NUMBER || "")
      ),
    };
  }

  function status() {
    const { settings, ready } = smsConfig();
    return {
      calendar: {
        timeTreeDirectAvailable: false,
        icsImportAvailable: true,
        icsExportAvailable: true,
        detail:
          "TimeTree is connected through files you import. Changes here do not automatically update TimeTree.",
      },
      push: {
        configured: vapid.ready,
        publicKeyAvailable: !!vapid.publicKey,
        subscriptionCount: db
          .prepare("SELECT count(*) AS count FROM integration_subscriptions")
          .get().count,
        vapidSource: vapid.source,
        error: vapid.error || null,
        deliveryMeaning:
          "Sent means the push service accepted it; phone receipt is not confirmed.",
      },
      sms: {
        credentialsConfigured: ready,
        accountSidPresent: !!env.TWILIO_ACCOUNT_SID,
        authTokenPresent: !!env.TWILIO_AUTH_TOKEN,
        fromNumberPresent: !!env.TWILIO_FROM_NUMBER,
        enabled: settings.smsAutomationEnabled === true,
        paused: settings.smsAutomationPaused === true,
        recipient: settings.followupRecipient,
        recipientConfigured: E164.test(settings.recipientPhone),
        scheduledTime: settings.followupTime,
        timezone: settings.timezone,
        detail:
          "At most one scheduled digest daily. Unchanged missing details are included at most twice.",
      },
    };
  }

  function preview() {
    const { settings, ready } = smsConfig();
    const history = new Map(
      db
        .prepare("SELECT * FROM integration_gap_history")
        .all()
        .map((row) => [row.job_id, row]),
    );
    const result = buildFollowupPreview(
      getRecords("jobs"),
      settings,
      now(),
      history,
    );
    result.todayAttempted = !!db
      .prepare("SELECT day FROM integration_sms_days WHERE day=?")
      .get(result.localDate);
    if (!ready)
      result.blockers.push(
        "Configure the Twilio account SID, auth token, and sender number on the server.",
      );
    if (!result.phoneConfigured)
      result.blockers.push(
        `Add ${result.recipient}'s number in international format, for example +1 followed by ten digits.`,
      );
    if (!settings.smsAutomationEnabled)
      result.blockers.push("Automatic texts are turned off.");
    if (settings.smsAutomationPaused)
      result.blockers.push("Automatic texts are paused.");
    if (!result.message)
      result.blockers.push(
        "No upcoming jobs have current, unsuppressed missing details.",
      );
    result.staleJobCount = result.jobs.filter((job) => job.stale).length;
    if (result.todayAttempted)
      result.blockers.push("A text was already attempted today.");
    result.eligible = result.eligible && result.blockers.length === 0;
    return result;
  }

  async function processSms() {
    const { settings, ready } = smsConfig();
    if (
      !ready ||
      settings.smsAutomationEnabled !== true ||
      settings.smsAutomationPaused === true ||
      !E164.test(settings.recipientPhone)
    )
      return;
    const clock = localClock(now(), settings.timezone);
    if (clock.time < settings.followupTime) return;
    // A long outage must not result in old late-night followups being sent on restart.
    const minuteOf = (time) =>
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    if (minuteOf(clock.time) - minuteOf(settings.followupTime) >= 60) return;
    const draft = preview();
    if (!draft.eligible) return;
    const claim = db
      .prepare(
        "INSERT OR IGNORE INTO integration_sms_days (day,status,created_at) VALUES (?, ?, ?)",
      )
      .run(clock.date, "attempting", iso(now()));
    if (!claim.changes) return;
    // Reserve the unresolved gaps before network IO. A timeout may still have reached Twilio.
    const included = draft.jobs.filter((job) =>
      draft.includedJobIds.includes(job.id),
    );
    for (const job of included) {
      db.prepare(
        `INSERT INTO integration_gap_history(job_id,signature,count,last_sent_date) VALUES(?,?,1,?)
        ON CONFLICT(job_id) DO UPDATE SET count=CASE WHEN signature=excluded.signature THEN count+1 ELSE 1 END,
        signature=excluded.signature,last_sent_date=excluded.last_sent_date`,
      ).run(job.id, job.signature, clock.date);
    }
    try {
      const sid = env.TWILIO_ACCOUNT_SID;
      if (!/^AC[a-fA-F0-9]{32}$/.test(sid)) throw new Error("Invalid SID");
      const response = await fetcher(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            To: settings.recipientPhone,
            From: env.TWILIO_FROM_NUMBER,
            Body: draft.message,
          }),
        },
      );
      if (!response.ok) {
        db.prepare("UPDATE integration_sms_days SET status=? WHERE day=?").run(
          "failed",
          clock.date,
        );
        log(
          "sms",
          "failed",
          `Twilio rejected the daily digest (HTTP ${response.status}). No automatic retry today.`,
          clock.date,
        );
        return;
      }
      db.prepare("UPDATE integration_sms_days SET status=? WHERE day=?").run(
        "accepted",
        clock.date,
      );
      log(
        "sms",
        "accepted",
        `Twilio accepted the daily digest for ${settings.followupRecipient}; ${included.length} job(s). Recipient delivery is not confirmed.`,
        clock.date,
      );
    } catch (error) {
      db.prepare("UPDATE integration_sms_days SET status=? WHERE day=?").run(
        "unknown",
        clock.date,
      );
      log(
        "sms",
        "unknown",
        `${safeError(error)} No automatic retry today.`,
        clock.date,
      );
    }
  }

  async function processReminders() {
    if (getSettings().pushEnabled === false) return;
    const current = now().getTime();
    const reminders = getRecords("reminders").filter(
      (reminder) =>
        reminder.status === "pending" &&
        reminder.dueAt &&
        Date.parse(reminder.dueAt) <= current,
    );
    for (const reminder of reminders) {
      const expires = reminder.expiresAt
        ? Date.parse(reminder.expiresAt)
        : Date.parse(reminder.dueAt) + 24 * 60 * 60 * 1000;
      const deliveryId = `push:${reminder.id}:${hash(reminder.dueAt).slice(0, 16)}`;
      if (expires <= current) {
        await saveRecord(
          "reminders",
          { ...reminder, status: "expired" },
          { system: true },
        );
        log(
          "push",
          "expired",
          "The reminder expired before it could be accepted by a push service.",
          reminder.id,
        );
        continue;
      }
      if (!vapid.ready) continue;
      const subscriptions = db
        .prepare("SELECT endpoint, subscription FROM integration_subscriptions")
        .all();
      if (!subscriptions.length) continue;
      const previous = db
        .prepare("SELECT status FROM integration_deliveries WHERE id=?")
        .get(deliveryId);
      if (previous) {
        if (previous.status === "accepted")
          await saveRecord(
            "reminders",
            { ...reminder, status: "sent" },
            { system: true },
          );
        continue;
      }
      // Claim persists through process restarts; do not send twice after an ambiguous provider response.
      log(
        "push",
        "attempting",
        "Submitting to the registered push services.",
        reminder.id,
        deliveryId,
      );
      let accepted = 0;
      let gone = 0;
      const failures = new Set();
      for (const row of subscriptions) {
        try {
          await pushSend(
            JSON.parse(row.subscription),
            JSON.stringify({
              title: reminder.title,
              body: reminder.body || "",
              tag: `reminder-${reminder.id}`,
              url: "/?view=reminders",
            }),
            {
              vapidDetails: vapid.details,
              TTL: Math.max(
                1,
                Math.min(86400, Math.floor((expires - current) / 1000)),
              ),
              timeout: 15000,
            },
          );
          accepted += 1;
        } catch (error) {
          failures.add(pushFailureDetail(error));
          if (error.statusCode === 404 || error.statusCode === 410) {
            db.prepare(
              "DELETE FROM integration_subscriptions WHERE endpoint=?",
            ).run(row.endpoint);
            gone += 1;
          }
        }
      }
      const deliveryStatus = accepted ? "accepted" : "failed";
      const summary = accepted
        ? `Push service accepted ${accepted} of ${subscriptions.length} subscription(s). Phone receipt is not confirmed.`
        : `No push service accepted the reminder. ${gone} expired subscription(s) removed. Open the reminder to reschedule; no automatic duplicate send.`;
      const detail = `${summary}${failures.size ? " " + [...failures].slice(0, 3).join(" ") : ""}`;
      db.prepare(
        "UPDATE integration_deliveries SET status=?,detail=? WHERE id=?",
      ).run(deliveryStatus, detail, deliveryId);
      if (accepted)
        await saveRecord(
          "reminders",
          { ...reminder, status: "sent" },
          { system: true },
        );
    }
  }

  async function prepareDailyPrompt() {
    const settings = getSettings();
    if (settings.pushEnabled === false || !settings.notificationTime) return;
    const clock = localClock(now(), settings.timezone);
    const minutes = (value) =>
      Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const elapsed = minutes(clock.time) - minutes(settings.notificationTime);
    if (elapsed < 0 || elapsed >= 180) return;
    const jobs = getRecords("jobs").filter(
      (job) => job.date === clock.date && job.bookingStatus !== "cancelled",
    );
    const sheets = getRecords("dailySheets").filter(
      (sheet) => sheet.date === clock.date,
    );
    const id = `evening-${clock.date}`;
    const existing = getRecords("reminders").find(
      (reminder) => reminder.id === id,
    );
    const outstanding = jobs.filter(
      (job) =>
        !sheets.some(
          (sheet) => sheet.jobId === job.id && sheet.status === "reviewed",
        ),
    );
    const drafts = sheets.filter((sheet) => sheet.status === "draft");
    if (!outstanding.length && !drafts.length) {
      if (existing?.status === "pending")
        await saveRecord(
          "reminders",
          { ...existing, status: "cancelled" },
          { system: true },
        );
      return;
    }
    if (existing) return;
    const names = outstanding.map((job) => job.title).slice(0, 5);
    await saveRecord(
      "reminders",
      {
        id,
        title: "Close today. Prepare tomorrow.",
        body: `Finish your Daily Sheet${names.length ? " for " + names.join(", ") : ""}. Record materials used, delays and what tomorrow needs.`,
        dueAt: iso(now()),
        expiresAt: iso(new Date(now().getTime() + (180 - elapsed) * 60000)),
        sourceType: "eveningCheck",
        sourceId: clock.date,
        status: "pending",
      },
      { system: true },
    );
  }

  async function runOnce() {
    if (running) return;
    running = true;
    try {
      await prepareDailyPrompt();
      await processReminders();
      await processSms();
    } catch {
      log(
        "worker",
        "failed",
        "Automation could not complete this cycle. Check server logs and record validation.",
      );
    } finally {
      running = false;
    }
  }

  return {
    status,
    preview,
    runOnce,
    vapid,
    deliveryLog: () =>
      db
        .prepare(
          "SELECT id,channel,status,created_at AS createdAt,detail,source_id AS sourceId FROM integration_deliveries ORDER BY created_at DESC LIMIT 100",
        )
        .all(),
    subscribe: (subscription) => {
      if (!validateSubscription(subscription))
        throw Object.assign(
          new Error("Invalid subscription or unsupported push provider."),
          { status: 400 },
        );
      db.prepare(
        "INSERT INTO integration_subscriptions(endpoint,subscription,created_at) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription",
      ).run(subscription.endpoint, JSON.stringify(subscription), iso(now()));
      return { subscribed: true };
    },
    unsubscribe: (endpoint) => {
      db.prepare("DELETE FROM integration_subscriptions WHERE endpoint=?").run(
        String(endpoint || ""),
      );
      return { subscribed: false };
    },
    importCalendar: (input) => importCalendar(context, input),
    exportCalendar: (id) => exportCalendar(getRecords("calendarEvents"), id),
  };
}

function dateValue(time) {
  return time.isDate
    ? `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`
    : time.toJSDate().toISOString();
}

function extractJob(event, record) {
  const text = record.description || "";
  const labels = {
    phone: "client phone",
    clientName: "client(?: name)?",
    areaSqft: "(?:floor sqft|area(?: sqft| sq ft)?|square feet|sqft)",
    system: "(?:coating )?system",
    product: "(?:exact )?product",
    crew: "crew",
    arrivalTime: "arrival(?: time)?",
    access: "access(?: instructions)?",
    scope: "(?:scope(?: of work)?|work)",
    address: "address",
  };
  const fields = {};
  for (const [field, label] of Object.entries(labels)) {
    const match = text.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "im"));
    if (match) fields[field] = match[1].trim();
  }
  const amount = fields.areaSqft
    ? Number(
        fields.areaSqft
          .replace(/,/g, "")
          .replace(/\s*(sq\.?\s*ft\.?|sqft|ft²)$/i, ""),
      )
    : NaN;
  return {
    title: record.title,
    clientName: fields.clientName || "",
    phone: fields.phone || "",
    address: fields.address || record.location || "",
    date: record.allDay
      ? record.start.slice(0, 10)
      : localClock(new Date(record.start)).date,
    bookingStatus: "tentative",
    areaSqft: Number.isFinite(amount) && amount > 0 ? amount : null,
    system: fields.system || "",
    product: fields.product || "",
    crew: fields.crew || "",
    arrivalTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(fields.arrivalTime || "")
      ? fields.arrivalTime
      : "",
    access: fields.access || "",
    scope: fields.scope || "",
    materials: [],
    source: record.source === "timetree" ? "timetree" : "calendar",
    sourceEventId: record.sourceEventId,
    notes: text,
  };
}

export async function importCalendar(context, input) {
  const { db, getRecords, saveRecord } = context;
  if (!input || typeof input.ics !== "string" || !input.ics.trim())
    throw Object.assign(
      new Error("Paste or upload an iCalendar (.ics) file."),
      { status: 400 },
    );
  if (Buffer.byteLength(input.ics) > 1024 * 1024)
    throw Object.assign(new Error("Calendar files must be 1 MB or smaller."), {
      status: 400,
    });
  if (!["timetree", "ics", "google"].includes(input.source))
    throw Object.assign(
      new Error("Choose the calendar source: timetree, ics, or google."),
      { status: 400 },
    );
  let component;
  try {
    component = new ICAL.Component(ICAL.parse(input.ics));
  } catch {
    throw Object.assign(new Error("This file is not a valid iCalendar file."), {
      status: 400,
    });
  }
  if (component.name !== "vcalendar")
    throw Object.assign(new Error("The file must contain a VCALENDAR."), {
      status: 400,
    });
  for (const timezone of component.getAllSubcomponents("vtimezone")) {
    const tzid = timezone.getFirstPropertyValue("tzid");
    if (tzid) ICAL.TimezoneService.register(tzid, new ICAL.Timezone(timezone));
  }
  const events = component.getAllSubcomponents("vevent");
  if (events.length > 1000)
    throw Object.assign(
      new Error("Import at most 1,000 calendar events at once."),
      { status: 400 },
    );
  const report = {
    created: 0,
    updated: 0,
    unchanged: 0,
    conflicts: [],
    warnings: [],
    jobsCreated: 0,
    jobsUpdated: 0,
  };
  const records = new Map(
    getRecords("calendarEvents").map((record) => [record.id, record]),
  );
  const jobs = new Map(getRecords("jobs").map((record) => [record.id, record]));
  for (const item of events) {
    const title = String(
      item.getFirstPropertyValue("summary") || "Untitled calendar event",
    ).slice(0, 200);
    if (item.hasProperty("rrule") || item.hasProperty("rdate")) {
      report.warnings.push(
        `${title}: repeating event skipped. Export individual occurrences before importing.`,
      );
      continue;
    }
    if (
      String(item.getFirstPropertyValue("status") || "").toUpperCase() ===
      "CANCELLED"
    ) {
      report.warnings.push(
        `${title}: cancellation was not applied automatically. Review the linked job and calendar event.`,
      );
      continue;
    }
    let event;
    try {
      event = new ICAL.Event(item);
    } catch {
      report.warnings.push(`${title}: invalid event skipped.`);
      continue;
    }
    if (!event.startDate) {
      report.warnings.push(`${title}: missing start date; skipped.`);
      continue;
    }
    // Unknown TZID must not be silently treated as UTC.
    const startProperty = item.getFirstProperty("dtstart");
    const tzid = startProperty?.getParameter("tzid");
    if (tzid && !ICAL.TimezoneService.has(tzid) && tzid !== "UTC") {
      report.warnings.push(
        `${title}: timezone ${tzid} is not included in this file; skipped.`,
      );
      continue;
    }
    if (!event.startDate.isDate && event.startDate.zone.tzid === "floating") {
      report.warnings.push(
        `${title}: local time has no timezone; skipped. Export with timezone data or UTC.`,
      );
      continue;
    }
    const uid = String(event.uid || "");
    if (!uid) {
      report.warnings.push(
        `${title}: missing calendar UID; skipped to avoid duplicates.`,
      );
      continue;
    }
    const recurrence = item.getFirstPropertyValue("recurrence-id");
    const sourceEventId = `${uid}${recurrence ? `#${recurrence.toString()}` : ""}`;
    const sourceKey = `${input.source}:${sourceEventId}`;
    const recordId = `cal-${hash(sourceKey).slice(0, 40)}`;
    const details = {
      title,
      start: dateValue(event.startDate),
      end: dateValue(event.endDate || event.startDate),
      allDay: event.startDate.isDate,
      source: input.source,
      sourceEventId,
      description: String(event.description || ""),
      location: String(event.location || ""),
    };
    const fingerprint = hash(JSON.stringify(details));
    const mapping = db
      .prepare("SELECT * FROM integration_calendar_sources WHERE source_key=?")
      .get(sourceKey);
    const existing = records.get(mapping?.record_id || recordId);
    if (mapping && existing && existing.version !== mapping.synced_version) {
      report.conflicts.push({
        id: existing.id,
        title,
        reason: "This event changed locally. Import did not overwrite it.",
      });
      continue;
    }
    let saved = existing;
    if (existing && mapping?.fingerprint === fingerprint) report.unchanged += 1;
    else {
      saved = await saveRecord(
        "calendarEvents",
        { ...(existing || {}), ...details, id: existing?.id || recordId },
        { system: true },
      );
      if (saved?.record) saved = saved.record;
      records.set(saved.id, saved);
      db.prepare(
        "INSERT INTO integration_calendar_sources(source_key,record_id,fingerprint,synced_version) VALUES(?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET record_id=excluded.record_id,fingerprint=excluded.fingerprint,synced_version=excluded.synced_version",
      ).run(sourceKey, saved.id, fingerprint, saved.version);
      report[existing ? "updated" : "created"] += 1;
    }
    if (input.createJobs === true) {
      const jobKey = `job:${sourceKey}`;
      const jobId = `job-${hash(sourceKey).slice(0, 40)}`;
      const jobMapping = db
        .prepare(
          "SELECT * FROM integration_calendar_sources WHERE source_key=?",
        )
        .get(jobKey);
      const existingJob = jobs.get(jobMapping?.record_id || jobId);
      if (
        jobMapping &&
        existingJob &&
        existingJob.version !== jobMapping.synced_version
      ) {
        report.conflicts.push({
          id: existingJob.id,
          title,
          reason: "The job card changed locally. Import did not overwrite it.",
        });
        continue;
      }
      if (existingJob && jobMapping?.fingerprint === fingerprint) {
        const refreshed = await saveRecord(
          "jobs",
          { ...existingJob, sourceVerifiedAt: new Date().toISOString() },
          { system: true },
        );
        jobs.set(refreshed.id, refreshed);
        db.prepare(
          "UPDATE integration_calendar_sources SET synced_version=? WHERE source_key=?",
        ).run(refreshed.version, jobKey);
        continue;
      }
      let job = await saveRecord(
        "jobs",
        {
          ...(existingJob || {}),
          ...extractJob(event, details),
          sourceVerifiedAt: new Date().toISOString(),
          id: existingJob?.id || jobId,
        },
        { system: true },
      );
      if (job?.record) job = job.record;
      jobs.set(job.id, job);
      db.prepare(
        "INSERT INTO integration_calendar_sources(source_key,record_id,fingerprint,synced_version) VALUES(?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET record_id=excluded.record_id,fingerprint=excluded.fingerprint,synced_version=excluded.synced_version",
      ).run(jobKey, job.id, fingerprint, job.version);
      if (saved.jobId !== job.id) {
        saved = await saveRecord(
          "calendarEvents",
          { ...saved, jobId: job.id },
          { system: true },
        );
        records.set(saved.id, saved);
        db.prepare(
          "UPDATE integration_calendar_sources SET synced_version=? WHERE source_key=?",
        ).run(saved.version, sourceKey);
      }
      report[existingJob ? "jobsUpdated" : "jobsCreated"] += 1;
    }
  }
  return report;
}

export function exportCalendar(records, id) {
  const selected = id ? records.filter((record) => record.id === id) : records;
  if (id && !selected.length)
    throw Object.assign(new Error("Calendar event not found."), {
      status: 404,
    });
  const calendar = new ICAL.Component(["vcalendar", [], []]);
  calendar.updatePropertyWithValue("version", "2.0");
  calendar.updatePropertyWithValue(
    "prodid",
    "-//HARDBOND//Personal command app//EN",
  );
  calendar.updatePropertyWithValue("calscale", "GREGORIAN");
  for (const record of selected) {
    const component = new ICAL.Component("vevent");
    const event = new ICAL.Event(component);
    event.uid = record.sourceEventId || `${record.id}@hardbond.local`;
    event.summary = record.title;
    event.description = record.description || "";
    event.location = record.location || "";
    event.startDate = record.allDay
      ? ICAL.Time.fromDateString(record.start.slice(0, 10))
      : ICAL.Time.fromJSDate(new Date(record.start), true);
    event.endDate = record.allDay
      ? ICAL.Time.fromDateString((record.end || record.start).slice(0, 10))
      : ICAL.Time.fromJSDate(new Date(record.end || record.start), true);
    component.updatePropertyWithValue(
      "dtstamp",
      ICAL.Time.fromJSDate(new Date(record.updatedAt || Date.now()), true),
    );
    calendar.addSubcomponent(component);
  }
  return calendar.toString();
}

export function registerIntegrations(app, context, options = {}) {
  const service = options.service || createIntegrationService(context);
  const auth = context.requireAuth;
  const route = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error.status) res.status(error.status).json({ error: error.message });
      else next(error);
    }
  };
  app.get("/api/integrations/status", auth, (_req, res) =>
    res.json(service.status()),
  );
  app.get("/api/integrations/followups/preview", auth, (_req, res) =>
    res.json(service.preview()),
  );
  app.get("/api/integrations/delivery-log", auth, (_req, res) =>
    res.json({ entries: service.deliveryLog() }),
  );
  app.get("/api/push/public-key", auth, (_req, res) =>
    res.json({
      publicKey: service.vapid.publicKey,
      configured: service.vapid.ready,
      error: service.vapid.error || null,
    }),
  );
  app.post(
    "/api/push/subscribe",
    auth,
    route((req, res) =>
      res.json(service.subscribe(req.body?.subscription || req.body)),
    ),
  );
  app.post(
    "/api/push/unsubscribe",
    auth,
    route((req, res) => res.json(service.unsubscribe(req.body?.endpoint))),
  );
  app.post(
    "/api/integrations/calendar/import",
    auth,
    route(async (req, res) => res.json(await service.importCalendar(req.body))),
  );
  app.get(
    "/api/integrations/calendar/export",
    auth,
    route((req, res) => {
      res
        .type("text/calendar")
        .set(
          "Content-Disposition",
          'attachment; filename="hardbond-calendar.ics"',
        )
        .send(service.exportCalendar(req.query.id));
    }),
  );
  // Cloudflare invokes the same service from a Cron Trigger, without process timers.
  if (options.schedule === false) {
    const cleanup = () => {};
    cleanup.status = service.status;
    cleanup.service = service;
    return cleanup;
  }
  const timer = setInterval(() => {
    void service.runOnce();
  }, 30_000);
  timer.unref();
  // First cycle is deferred so startup and database initialization can finish.
  const startup = setTimeout(() => {
    void service.runOnce();
  }, 1_000);
  startup.unref();
  const cleanup = () => {
    clearInterval(timer);
    clearTimeout(startup);
  };
  cleanup.status = service.status;
  cleanup.service = service;
  return cleanup;
}
