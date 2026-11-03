import cards from "./task-library.json";
export const REVIEW_ACTION = {
  id: "hardbond-operations-review-2026-11-03",
  title: "Return to crew, task-card and trailer approval review",
  owner: "Aidan",
  status: "open",
  sourceType: "operations-review",
  sourceId: "2026-11-03",
  notes: [
    "Deferred while we focus on TimeTree sync. No due date chosen. Open Crew & routine → How to use and Task cards when ready.",
    "APPROVALS: Review the actual methods, equipment, PPE, stop conditions and completion standards. All 35 source cards start unapproved operationally; B1 retains the owner-FINAL source label. Save corrections, then approve the saved revision with the reviewer name.",
    "PRIORITY CORRECTIONS: B2 needs Aidan’s wall method. A2 needs equipment-specific electrical/generator review. A4/C2 bag/filter and dust controls need equipment verification. E1 mixing and F1 test limits need current exact-product references. E4 tool/technique terminology and E6/E9 spike-shoe movement need review. E8/G3 generic cure times must become product/condition-specific. B4/E3/E4/E8 are restriction notices, not complete operator instructions.",
    "WORKERS: Enter actual contacts, availability, transport, qualifications and per-task SOLO / ASSIST / NEVER / NOT ASSESSED clearances. Check supervisor coverage manually.",
    "TRAILER: Confirm shelf layout and safe storage, label proposed codes only after physical verification, record usable counts and minimums, label partial kits, isolate damaged equipment, and add shelf-photo references.",
    "PILOT: Choose one real job and crew; approve its full task sequence, confirm transport and replies, inspect phase gates, record assignment outcomes, complete Daily Sheet and trailer return, assign shortages/repairs.",
    "LATER IMPROVEMENTS: Copy previous day with confirmations reset; save custom presets; scheduling-conflict checks; automatic messaging and reply processing; linked shortage actions; improved photos and brief readability; maintain product references.",
    "CARDS TO REVIEW:",
    ...cards.map((c) => `${c.id} — ${c.title}`),
  ].join("\n\n"),
};
