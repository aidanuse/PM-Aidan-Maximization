import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/store.js";
import {
  productionMetrics,
  materialRequirement,
  nextWorkItems,
} from "../shared/field-work.js";

const measured = {
  status: "reviewed",
  production: {
    phase: "coating",
    areaSqft: 1600,
    elapsedMinutes: 240,
    sameWork: true,
  },
  crew: Array.from({ length: 4 }, (_, i) => ({
    person: `Worker ${i}`,
    role: "Application",
    start: "08:00",
    end: "12:00",
    breakMinutes: 0,
  })),
};
test("material planning separates area, coats, explicit allowance and unit rounding", () => {
  const input = {
    floorArea: 1000,
    wallArea: 100,
    coats: 2,
    allowancePercent: 10,
    coverage: 400,
    wholeUnits: true,
  };
  assert.equal(materialRequirement(input).units, 7);
  assert.equal(
    materialRequirement({ ...input, wholeUnits: false }).units,
    6.05,
  );
  assert.equal(
    materialRequirement({
      ...input,
      floorArea: 1200,
      wallArea: 0,
      coats: 1,
      allowancePercent: 0,
    }).units,
    3,
  );
  for (const overrides of [
    { coverage: 0 },
    { coats: 1.5 },
    { floorArea: -1 },
    { allowancePercent: -1 },
    { wallArea: NaN },
    { floorArea: 0, wallArea: 0 },
  ])
    assert.equal(materialRequirement({ ...input, ...overrides }), null);
});
test("next actions prioritize holds and overdue work, exclude cancelled jobs, and stay short", () => {
  const state = {
    jobs: [
      {
        id: "cancelled",
        title: "Cancelled",
        bookingStatus: "cancelled",
        date: "2026-10-23",
        fieldPlan: [{ status: "held" }],
      },
      {
        id: "held",
        title: "TEST floor",
        date: "2026-10-23",
        fieldPlan: [
          { status: "held", handover: "Await technical confirmation" },
        ],
      },
      { id: "future", title: "TEST upcoming", date: "2026-10-24" },
    ],
    actions: [
      {
        id: "late",
        title: "Collect tooling",
        status: "open",
        dueAt: "2026-10-22T09:00:00Z",
      },
      {
        id: "done",
        title: "Already complete",
        status: "done",
        dueAt: "2026-10-22T09:00:00Z",
      },
    ],
  };
  const items = nextWorkItems(state, "2026-10-23", "2026-10-23T10:00:00Z");
  assert.equal(items.length, 3);
  assert.equal(items[0].id, "hold-held");
  assert.equal(items[1].id, "action-late");
  assert.equal(
    items.some((i) => i.id.includes("cancelled") || i.id.includes("done")),
    false,
  );
});
test("production distinguishes four elapsed hours from sixteen worker-hours", () => {
  assert.deepEqual(productionMetrics(measured), {
    areaSqft: 1600,
    elapsedRate: 400,
    laborHours: 16,
    laborRate: 100,
  });
  assert.equal(productionMetrics({ ...measured, status: "draft" }), null);
  assert.equal(
    productionMetrics({
      ...measured,
      production: { ...measured.production, sameWork: false },
    }),
    null,
  );
});
test("next actions combine duplicate material lines and keep unknown stock unknown", () => {
  const state = {
    jobs: [
      {
        id: "job",
        title: "TEST supply",
        date: "2026-10-23",
        materials: [
          { inventoryId: "kit", quantity: 3 },
          { inventoryId: "kit", quantity: 3 },
        ],
      },
    ],
    inventory: [{ id: "kit", name: "TEST kit", unit: "kit", quantity: 5 }],
  };
  let items = nextWorkItems(state, "2026-10-23");
  assert.equal(items[0].id, "stock-job");
  assert.match(items[0].detail, /1 kit short/);
  items = nextWorkItems(
    { ...state, inventory: [{ ...state.inventory[0], quantity: null }] },
    "2026-10-23",
  );
  assert.match(items[0].detail, /count needed/);
  assert.doesNotMatch(items[0].detail, /6 kit short/);
});
test("incomplete and invalid crew clocks never produce a partial labor rate", () => {
  for (const entry of [{ end: "" }, { end: "07:00" }, { breakMinutes: 241 }]) {
    const result = productionMetrics({
      ...measured,
      crew: [...measured.crew, { ...measured.crew[0], ...entry }],
    });
    assert.equal(result.laborRate, null);
    assert.equal(result.elapsedRate, 400);
  }
  assert.equal(productionMetrics({ ...measured, crew: [] }).laborRate, null);
  assert.equal(
    productionMetrics({
      ...measured,
      crew: [
        ...measured.crew,
        { ...measured.crew[0], start: "11:00", end: "13:00" },
      ],
    }).laborRate,
    null,
  );
  assert.equal(
    productionMetrics({
      ...measured,
      crew: [
        { ...measured.crew[0], start: "08:00", end: "10:00" },
        { ...measured.crew[0], start: "10:00", end: "12:00" },
      ],
    }).laborHours,
    4,
  );
  assert.equal(
    productionMetrics({
      ...measured,
      production: { ...measured.production, elapsedMinutes: null },
    }).elapsedRate,
    null,
  );
});
test("field plans and measured production survive backup restore, reject stale edits and invalid data", (t) => {
  const store = createStore(),
    restored = createStore();
  t.after(() => {
    store.close();
    restored.close();
  });
  const old = store.saveRecord("jobs", { id: "test-job", title: "TEST plan" });
  const job = store.saveRecord("jobs", {
    ...old,
    fieldPlan: [
      {
        id: "phase-1",
        phase: "preparation",
        owner: "TEST foreman",
        target: "North zone",
        checks: [{ label: "Profile checked", status: "unconfirmed" }],
        status: "held",
        handover: "Await system specification",
      },
    ],
  });
  assert.throws(
    () => store.saveRecord("jobs", { ...old, notes: "stale" }),
    (e) => e.status === 409,
  );
  const day = store.saveRecord("dailySheets", {
    ...measured,
    id: "test-day",
    jobId: job.id,
    date: "2026-10-23",
  });
  assert.throws(
    () =>
      store.saveRecord("dailySheets", {
        ...day,
        production: { ...day.production, areaSqft: -1 },
      }),
    (e) => e.status === 400,
  );
  assert.throws(
    () =>
      store.saveRecord("jobs", {
        ...job,
        fieldPlan: [{ ...job.fieldPlan[0], status: "ready" }],
      }),
    (e) => e.status === 400,
  );
  restored.restoreBackup(store.backup());
  assert.deepEqual(restored.getRecord("jobs", job.id).fieldPlan, job.fieldPlan);
  assert.equal(
    productionMetrics(restored.getRecord("dailySheets", day.id)).laborRate,
    100,
  );
});
