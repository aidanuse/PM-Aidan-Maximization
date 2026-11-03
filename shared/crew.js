export const PRESETS = {
  "Edge support": ["A2", "A4", "B1", "C1"],
  "Wall support": ["A2", "A4", "B2", "C1"],
  "Prep helper": ["A1", "A4", "B8", "C4", "G1"],
  Cleaning: ["C3", "C2", "C4"],
  "Repair helper": ["D1", "D2", "D3", "B8"],
  "Mixing and runner": ["E1", "E2"],
  "Coating support": ["E2", "E5", "E6", "E9"],
  Flake: ["E6", "E7", "C2"],
  "Lead checks": ["F1", "F3"],
};
export const TRAILER_CHECKS = {
  return: [
    "Return equipment to labeled locations; secure heavy items",
    "Label identifiable partial kits; quarantine unidentified materials",
    "Separate dirty tools and damaged equipment",
    "Check cords, hoses and vacuum supplies",
    "Update actual stock counts and shortages in Inventory",
    "Record missing or broken items in Action list",
  ],
  weekly: [
    "Compare each zone with its reference photo / physical labels",
    "Count usable stock and update Inventory minimums",
    "Check partial-kit identity, storage and manufacturer limits",
    "Inspect equipment and isolate damaged items",
    "Check PPE, first aid and extinguisher readiness",
    "Review upcoming job loads and open purchase / repair actions",
  ],
};
export function clearance(worker, code) {
  return worker?.clearances?.[code] || "NOT ASSESSED";
}
export function assignmentProblems(row, task, state, day) {
  const worker = state.workers.find((w) => w.id === row.workerId);
  const card = state.taskCards.find((c) => c.id === task.cardId);
  const problems = [];
  if (!worker || !worker.active) problems.push("Worker is missing or inactive");
  if (!card?.approved) problems.push(`${task.cardId}: card needs approval`);
  if (
    !state.jobs.some(
      (j) => j.id === task.jobId && j.bookingStatus !== "cancelled",
    )
  )
    problems.push("Choose an active job");
  const level = clearance(worker, task.cardId);
  if (["NEVER", "NOT ASSESSED"].includes(level))
    problems.push(`${task.cardId}: ${level}`);
  if (card?.restriction === "lead" && worker?.role !== "lead")
    problems.push("Lead-only task");
  if (
    card?.restriction === "experienced" &&
    !["lead", "experienced"].includes(worker?.role)
  )
    problems.push("Experienced workers only");
  if (level === "ASSIST") {
    const supervisor = state.workers.find((w) => w.id === task.supervisorId);
    const attending = day.crew.some(
      (r) => r.workerId === task.supervisorId && r.available,
    );
    const eligible =
      card?.restriction !== "lead" || supervisor?.role === "lead";
    const experienced =
      card?.restriction !== "experienced" ||
      ["lead", "experienced"].includes(supervisor?.role);
    if (
      !supervisor?.active ||
      supervisor.id === row.workerId ||
      clearance(supervisor, task.cardId) !== "SOLO" ||
      !attending ||
      !eligible ||
      !experienced ||
      !task.supervisionConfirmed
    )
      problems.push(
        `${task.cardId}: confirm a qualified attending supervisor is available at this job`,
      );
  }
  return problems;
}
export function rowProblems(row, state, day) {
  const problems = row.tasks.flatMap((t) =>
    assignmentProblems(row, t, state, day),
  );
  if (!row.available) problems.push("Confirm availability");
  if (!row.transport.trim())
    problems.push("Confirm transport / meeting arrangement");
  if (!row.callTime) problems.push("Set arrival time");
  if (!day.leadContact.trim()) problems.push("Add lead contact");
  if (!row.tasks.length) problems.push("Add assignments");
  for (const task of row.tasks)
    if (!state.jobs.find((j) => j.id === task.jobId)?.address?.trim())
      problems.push("Job address missing");
  return [...new Set(problems)];
}
// Deliberate allowlist: job titles, scope, customer notes, rates and private worker notes never enter briefs.
export function renderBrief(row, day, state) {
  const worker = state.workers.find((w) => w.id === row.workerId);
  return [
    `HARDBOND · ${day.date}`,
    `For: ${worker?.name || "Unknown worker"}`,
    `Arrival: ${row.callTime}`,
    `Meet / transport: ${row.transport}`,
    `Lead: ${day.leadContact}`,
    `PPE / day instructions: ${row.instructions}`,
    ...row.tasks.map((task, i) => {
      const card = state.taskCards.find((c) => c.id === task.cardId);
      const job = state.jobs.find((j) => j.id === task.jobId);
      const supervisor = state.workers.find((w) => w.id === task.supervisorId);
      return `\n${i + 1}. ${task.cardId} — ${card?.title || "Missing card"}\nJob location: ${job?.address || "Missing address"}\nTiming / area / travel: ${task.detail}\n${supervisor ? `Supervisor: ${supervisor.name}\n` : ""}${card?.instructions || ""}`;
    }),
    "\nReply CONFIRMED after reading. Stop and contact the lead if instructions or conditions are unclear.",
  ].join("\n");
}
export function containsMoney(value) {
  return /[$€£]|\b(?:CAD|USD|dollars?|price|pricing|payment|invoice|profit|wage|salary)\b/i.test(
    value,
  );
}
export function planSignature(day) {
  return JSON.stringify([
    day.date,
    day.leadContact,
    day.crew.map((r) => [
      r.workerId,
      r.available,
      r.callTime,
      r.transport,
      r.instructions,
      r.tasks.map((t) => [
        t.id,
        t.jobId,
        t.cardId,
        t.supervisorId,
        t.supervisionConfirmed,
        t.detail,
      ]),
    ]),
  ]);
}
export function morningStatus(state, date) {
  const day = (state.crewDays || []).find((d) => d.date === date);
  if (!day) return ["Day plan not prepared"];
  if (!day.crew.length) return ["No crew assigned"];
  return day.crew.flatMap((row) => {
    const name =
      state.workers?.find((w) => w.id === row.workerId)?.name ||
      "Unknown worker";
    const problems = rowProblems(row, state, day);
    if (row.status !== "confirmed") problems.unshift("Not confirmed");
    if (row.status !== "draft" && row.brief !== renderBrief(row, day, state))
      problems.push("Brief details changed — resend and reconfirm");
    return problems.length ? [`${name}: ${problems.join("; ")}`] : [];
  });
}
