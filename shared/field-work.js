import {
  jobGaps,
  jobGapLabel,
  laborMinutes,
  materialTotals,
} from "./domain.js";
// Operational prompts from the owner's October 2026 handoff, not installation specifications.
export const PHASES = {
  setup: {
    label: "Site setup",
    roles: "Lead: access and scope; support: protection, staging and equipment",
    checks: [
      "Access, work boundaries and reopening restrictions confirmed",
      "Power, dust controls, ventilation and protection checked",
      "Materials, tools and clean mixing area staged",
    ],
  },
  preparation: {
    label: "Grinding / preparation",
    roles: "Main grinder; edges and details; vacuum and defect marking",
    checks: [
      "Required profile and removal endpoint confirmed from the specified system",
      "Tooling, extraction and edge access checked",
      "Prepared surface inspected for contamination and defects",
    ],
  },
  repairs: {
    label: "Repairs",
    roles: "Defect preparation; measured mixing; placement and finishing",
    checks: [
      "Defect depth and cause assessed; exposed reinforcement escalated",
      "Repair product, depth limits and coating compatibility confirmed",
      "Repairs inspected and ready under the specified cure requirements",
    ],
  },
  primer: {
    label: "Primer / moisture barrier",
    roles:
      "Lead checks substrate; mixer controls batches; applicator monitors coverage",
    checks: [
      "Exact product, TDS/SDS and substrate requirements checked",
      "Measured site conditions meet the specified application requirements",
      "Mixing, coverage and next-coat window confirmed",
    ],
  },
  coating: {
    label: "Base coat / broadcast",
    roles:
      "Application lead; walls and edges; main floor; mixing / broadcast support",
    checks: [
      "Walls, edges and floor sequence agreed for this system",
      "Batch size, pot life, pigment consistency and supply checked",
      "Coverage and specified broadcast inspected before the next phase",
    ],
  },
  finish: {
    label: "Scrape / finish coat",
    roles: "Detail preparation; cleaning; measured mixing; finish application",
    checks: [
      "Recoat timing and permitted abrasion method confirmed",
      "Surface cleanliness, compatibility and conditions checked",
      "Finish, coverage and protection inspected",
    ],
  },
  handover: {
    label: "Cure / handover",
    roles:
      "Lead: inspection and release; crew: cleanup, equipment and stock return",
    checks: [
      "Traffic and cure restrictions confirmed from the actual system",
      "Defects and outstanding work assigned to an owner",
      "Equipment cleaned, materials secured and next steps recorded",
    ],
  },
};

export function phaseLabel(key) {
  return PHASES[key]?.label || "Phase not recorded";
}

export function nextWorkItems(state, date, now = new Date().toISOString()) {
  const result = [];
  const jobs = (state.jobs || [])
    .filter((j) => j.bookingStatus !== "cancelled" && j.date && j.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const job of jobs) {
    if (job.date !== jobs[0]?.date) continue;
    const held = (job.fieldPlan || []).find((p) => p.status === "held");
    if (held)
      result.push({
        id: `hold-${job.id}`,
        title: `Resolve hold: ${job.title}`,
        detail: `${job.date} · ${
          held.handover ||
          held.prerequisite ||
          "Confirm the reason with the responsible person before proceeding."
        }`,
        route: "plan",
        jobId: job.id,
      });
  }
  const overdue = (state.actions || [])
    .filter(
      (a) =>
        a.status !== "done" && a.dueAt && Date.parse(a.dueAt) < Date.parse(now),
    )
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  for (const action of overdue)
    result.push({
      id: `action-${action.id}`,
      title: action.title,
      detail: `Overdue · ${action.owner || "Assign an owner"}`,
      route: "actions",
    });
  for (const job of jobs) {
    if (result.some((item) => item.jobId === job.id)) continue;
    const materialGaps = Object.entries(
      materialTotals(job.materials || []),
    ).flatMap(([id, quantity]) => {
      const item = (state.inventory || []).find((i) => i.id === id);
      if (item?.quantity == null)
        return [`${item?.name || "Missing inventory item"}: count needed`];
      return item.quantity < quantity
        ? [
            `${item.name}: ${quantity - item.quantity} ${item.unit || "units"} short`,
          ]
        : [];
    });
    if (materialGaps.length) {
      result.push({
        id: `stock-${job.id}`,
        title: `Check materials: ${job.title}`,
        detail: `${job.date}: ${materialGaps.join("; ")}. Based on recorded stock, before other jobs’ demand.`,
        route: "plan",
        jobId: job.id,
      });
      continue;
    }
    const missing = jobGaps(job);
    if (missing.length)
      result.push({
        id: `details-${job.id}`,
        title: `Confirm ${job.title}`,
        detail: `${job.date}: ${missing.map(jobGapLabel).join(", ")}`,
        route: "plan",
        jobId: job.id,
      });
    else if (!(job.fieldPlan || []).length)
      result.push({
        id: `plan-${job.id}`,
        title: `Set the work sequence: ${job.title}`,
        detail:
          "Assign the first tasks and confirm what must happen before the next phase.",
        route: "plan",
        jobId: job.id,
      });
  }
  return result.slice(0, 3);
}

export function materialRequirement({
  floorArea,
  wallArea,
  coats,
  allowancePercent,
  coverage,
  wholeUnits,
}) {
  if (
    ![floorArea, wallArea, coats, allowancePercent, coverage].every(
      Number.isFinite,
    ) ||
    floorArea < 0 ||
    wallArea < 0 ||
    floorArea + wallArea <= 0 ||
    !Number.isInteger(coats) ||
    coats <= 0 ||
    allowancePercent < 0 ||
    coverage <= 0
  )
    return null;
  const netUnits = ((floorArea + wallArea) * coats) / coverage;
  const withAllowance = netUnits * (1 + allowancePercent / 100);
  if (!Number.isFinite(withAllowance)) return null;
  // Ignore floating-point dust at an exact whole-kit boundary.
  const scale = wholeUnits ? 1 : 1000;
  const scaled = withAllowance * scale;
  if (!Number.isFinite(scaled)) return null;
  const units =
    Math.ceil(scaled - Number.EPSILON * Math.max(1, scaled) * 4) / scale;
  return { netUnits, withAllowance, units };
}

export function productionMetrics(sheet) {
  const p = sheet.production;
  if (
    sheet.status !== "reviewed" ||
    !p?.phase ||
    !(p.areaSqft > 0) ||
    !p.sameWork
  )
    return null;
  const crew = sheet.crew || [];
  // Every interval must be known. A partial crew total would overstate productivity.
  const minutes = crew.map(laborMinutes);
  const intervals = new Map();
  let overlaps = false;
  for (const entry of crew) {
    const person = entry.person?.trim().toLowerCase();
    if (!person) {
      overlaps = true;
      continue;
    }
    const others = intervals.get(person) || [];
    if (
      others.some((other) => entry.start < other.end && other.start < entry.end)
    )
      overlaps = true;
    intervals.set(person, [...others, entry]);
  }
  const laborHours =
    !overlaps && minutes.length && minutes.every((m) => m !== null && m > 0)
      ? minutes.reduce((a, b) => a + b, 0) / 60
      : null;
  return {
    areaSqft: p.areaSqft,
    elapsedRate:
      p.elapsedMinutes > 0 ? p.areaSqft / (p.elapsedMinutes / 60) : null,
    laborHours,
    laborRate: laborHours ? p.areaSqft / laborHours : null,
  };
}
