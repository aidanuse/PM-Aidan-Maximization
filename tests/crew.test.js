import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import { renderBrief, morningStatus, PRESETS } from "../shared/crew.js";
const setup = (t) => {
  const s = createStore();
  t.after(() => s.close());
  s.saveRecord("jobs", {
    id: "job",
    title: "Customer $4,000 PRIVATE",
    address: "123 Test Street",
    notes: "PRIVATE rate 500",
    bookingStatus: "confirmed",
  });
  s.saveRecord("taskCards", {
    id: "A4",
    title: "Vac setup",
    instructions: "Setup. Safety. Stop and ask. Report back.",
    approved: true,
    reviewedBy: "TEST lead",
  });
  s.saveRecord("workers", {
    id: "worker",
    name: "TEST worker",
    clearances: { A4: "SOLO" },
    notes: "PRIVATE coaching",
  });
  return s;
};
const day = () => ({
  id: "crew-2026-11-03",
  date: "2026-11-03",
  leadContact: "TEST lead 555-0100",
  crew: [
    {
      workerId: "worker",
      available: true,
      callTime: "08:00",
      transport: "Meet at site",
      tasks: [{ id: "task", jobId: "job", cardId: "A4" }],
    },
  ],
});
const status = (s, d, value) =>
  s.saveRecord("crewDays", {
    ...d,
    crew: d.crew.map((r) => ({ ...r, status: value })),
  });
test("brief excludes private job titles, notes and money; sent then confirmed; closeout preserves confirmation", (t) => {
  const s = setup(t);
  let d = s.saveRecord("crewDays", day());
  assert.throws(() => status(s, d, "confirmed"), /Send the current brief/);
  d = status(s, d, "sent");
  assert.match(d.crew[0].brief, /123 Test Street/);
  assert.doesNotMatch(d.crew[0].brief, /PRIVATE|4,000|500/);
  d = status(s, d, "confirmed");
  assert.ok(d.crew[0].confirmedAt);
  d = s.saveRecord("crewDays", {
    ...d,
    crew: d.crew.map((r) => ({
      ...r,
      tasks: r.tasks.map((t) => ({ ...t, result: "done" })),
    })),
  });
  assert.equal(d.crew[0].status, "confirmed");
  assert.deepEqual(morningStatus(s.state(), d.date), []);
  assert.throws(() => s.deleteRecord("crewDays", d.id, d.version), /history/);
  assert.throws(() => s.saveRecord("crewDays", { ...d, crew: [] }), /history/);
  assert.throws(() => s.deleteRecord("jobs", "job", 1), /history/);
});
test("plan edits reset confirmations; card changes are stale and require approved new brief", (t) => {
  const s = setup(t);
  let d = status(s, s.saveRecord("crewDays", day()), "sent");
  d = status(s, d, "confirmed");
  d = s.saveRecord("crewDays", {
    ...d,
    crew: d.crew.map((r) => ({ ...r, callTime: "09:00" })),
  });
  assert.equal(d.crew[0].status, "draft");
  d = status(s, d, "sent");
  const c = s.getRecord("taskCards", "A4");
  let revised = s.saveRecord("taskCards", {
    ...c,
    instructions: "New instructions",
    approved: true,
  });
  assert.equal(revised.approved, false);
  assert.throws(() => status(s, d, "confirmed"), /approval/);
  revised = s.saveRecord("taskCards", {
    ...revised,
    approved: true,
    reviewedBy: "TEST lead",
  });
  assert.match(morningStatus(s.state(), d.date).join(), /changed/);
  assert.throws(() => status(s, d, "confirmed"), /current brief/);
  d = s.saveRecord("crewDays", {
    ...d,
    crew: d.crew.map((r) => ({
      ...r,
      status: "sent",
      brief: renderBrief(r, d, s.state()),
    })),
  });
  d = status(s, d, "confirmed");
  assert.match(d.crew[0].brief, /New instructions/);
});
test("NEVER, unassessed, restricted tasks and missing supervision block dispatch server-side", (t) => {
  const s = setup(t);
  let d = s.saveRecord("crewDays", day());
  let w = s.getRecord("workers", "worker");
  for (const level of ["NEVER", "NOT ASSESSED", "ASSIST"]) {
    w = s.saveRecord("workers", { ...w, clearances: { A4: level } });
    assert.throws(() => status(s, d, "sent"), /NEVER|NOT ASSESSED|supervisor/);
  }
  const supervisor = s.saveRecord("workers", {
    id: "lead",
    name: "TEST lead",
    role: "lead",
    clearances: { A4: "SOLO" },
  });
  d = s.saveRecord("crewDays", {
    ...d,
    crew: [
      {
        ...d.crew[0],
        tasks: d.crew[0].tasks.map((t) => ({
          ...t,
          supervisorId: supervisor.id,
          supervisionConfirmed: true,
        })),
      },
      { workerId: "lead", available: true },
    ],
  });
  d = s.saveRecord("crewDays", {
    ...d,
    crew: d.crew.map((r, i) => (i === 0 ? { ...r, status: "sent" } : r)),
  });
  assert.equal(d.crew[0].status, "sent");
  let c = s.getRecord("taskCards", "A4");
  c = s.saveRecord("taskCards", { ...c, restriction: "lead" });
  s.saveRecord("taskCards", { ...c, approved: true, reviewedBy: "TEST lead" });
  assert.throws(() => status(s, d, "confirmed"), /Lead-only/);
});
test("pricing in user-facing notes is blocked; unfinished work needs reasons; duplicate date rejected", (t) => {
  const s = setup(t);
  let d = s.saveRecord("crewDays", {
    ...day(),
    crew: day().crew.map((r) => ({ ...r, instructions: "Collect $250" })),
  });
  assert.throws(() => status(s, d, "sent"), /pricing/);
  assert.throws(
    () =>
      s.saveRecord("crewDays", {
        ...d,
        crew: d.crew.map((r) => ({
          ...r,
          tasks: r.tasks.map((t) => ({ ...t, result: "partial" })),
        })),
      }),
    /Explain/,
  );
  assert.throws(
    () => s.saveRecord("crewDays", { ...day(), id: "different" }),
    /already exists/,
  );
});
test("old backups restore; new backup restores crew and trailer records and rejects broken references", (t) => {
  const s = setup(t);
  s.saveRecord("crewDays", day());
  s.saveRecord("trailerChecks", {
    id: "check",
    date: "2026-11-03",
    kind: "weekly",
    checkedBy: "TEST",
    checks: Array(6).fill(false),
  });
  const target = createStore();
  t.after(() => target.close());
  target.restoreBackup(s.backup());
  assert.equal(target.state().crewDays.length, 1);
  assert.equal(target.state().trailerChecks.length, 1);
  const broken = s.backup();
  broken.workers = [];
  const clean = createStore();
  t.after(() => clean.close());
  assert.throws(() => clean.restoreBackup(broken), /crew/);
  const legacy = s.backup();
  for (const k of ["workers", "taskCards", "crewDays", "trailerChecks"])
    delete legacy[k];
  clean.restoreBackup(legacy);
  assert.deepEqual(clean.state().workers, []);
});
test("morning explicitly flags absent day and dependency order is corrected", () => {
  assert.deepEqual(morningStatus({}, "2026-11-03"), ["Day plan not prepared"]);
  assert.ok(
    PRESETS["Edge support"].indexOf("A4") <
      PRESETS["Edge support"].indexOf("B1"),
  );
  assert.ok(PRESETS.Cleaning.indexOf("C3") < PRESETS.Cleaning.indexOf("C2"));
});

test("lead release requires completed checked work and is cleared by phase changes", (t) => {
  const s = setup(t);
  let job = s.getRecord("jobs", "job");
  const phase = {
    id: "prep",
    phase: "preparation",
    status: "complete",
    checks: [{ label: "Prepared surface", status: "unconfirmed" }],
    releasedBy: "TEST lead",
  };
  assert.throws(
    () => s.saveRecord("jobs", { ...job, fieldPlan: [phase] }),
    /resolve every check/,
  );
  job = s.saveRecord("jobs", {
    ...job,
    fieldPlan: [
      { ...phase, checks: [{ label: "Prepared surface", status: "checked" }] },
    ],
  });
  assert.ok(job.fieldPlan[0].releasedAt);
  job = s.saveRecord("jobs", {
    ...job,
    fieldPlan: job.fieldPlan.map((p) => ({ ...p, target: "Changed area" })),
  });
  assert.equal(job.fieldPlan[0].releasedBy, "");
  assert.equal(job.fieldPlan[0].releasedAt, "");
});

test("recorded assignment history survives resetting a result to pending", (t) => {
  const s = setup(t);
  let d = s.saveRecord("crewDays", day());
  d = s.saveRecord("crewDays", {
    ...d,
    crew: d.crew.map((r) => ({
      ...r,
      tasks: r.tasks.map((t) => ({ ...t, result: "done" })),
    })),
  });
  assert.ok(d.crew[0].tasks[0].recordedAt);
  d = s.saveRecord("crewDays", {
    ...d,
    crew: d.crew.map((r) => ({
      ...r,
      tasks: r.tasks.map((t) => ({ ...t, result: "pending", recordedAt: "" })),
    })),
  });
  assert.ok(d.crew[0].tasks[0].recordedAt);
  assert.throws(() => s.saveRecord("crewDays", { ...d, crew: [] }), /history/);
});

test("worker edits preserve unrelated confirmations; shared changes reset everyone", (t) => {
  const s = setup(t);
  s.saveRecord("workers", {
    id: "second",
    name: "Second",
    clearances: { A4: "SOLO" },
  });
  let input = day();
  input.crew.push({
    ...input.crew[0],
    workerId: "second",
    tasks: input.crew[0].tasks.map((x) => ({ ...x, id: "second-task" })),
  });
  let d = status(s, s.saveRecord("crewDays", input), "sent");
  d = status(s, d, "confirmed");
  const stamp = d.crew[1].confirmedAt,
    brief = d.crew[1].brief;
  d = s.saveRecord("crewDays", {
    ...d,
    crew: d.crew.map((r, i) => (i === 0 ? { ...r, callTime: "09:00" } : r)),
  });
  assert.equal(d.crew[0].status, "draft");
  assert.equal(d.crew[1].status, "confirmed");
  assert.equal(d.crew[1].confirmedAt, stamp);
  assert.equal(d.crew[1].brief, brief);
  d = s.saveRecord("crewDays", { ...d, leadContact: "Changed lead" });
  assert.ok(d.crew.every((r) => r.status === "draft" && !r.confirmedAt));
});

test("supervisor changes affect assigned helpers but results and crew ordering do not", async () => {
  const { confirmationAffected } = await import("../shared/crew.js");
  const before = {
    ...day(),
    crew: [
      {
        ...day().crew[0],
        workerId: "helper",
        tasks: [{ ...day().crew[0].tasks[0], supervisorId: "lead" }],
      },
      { ...day().crew[0], workerId: "lead" },
      { ...day().crew[0], workerId: "other" },
    ],
  };
  const moved = structuredClone(before);
  moved.crew[1].callTime = "10:00";
  assert.equal(confirmationAffected(before, moved, "helper"), true);
  assert.equal(confirmationAffected(before, moved, "other"), false);
  const closeout = structuredClone(before);
  closeout.crew[1].tasks[0].result = "done";
  closeout.crew.reverse();
  assert.equal(confirmationAffected(before, closeout, "helper"), false);
  const removed = {
    ...before,
    crew: before.crew.filter((r) => r.workerId !== "lead"),
  };
  assert.equal(confirmationAffected(before, removed, "helper"), true);
});
