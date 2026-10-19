export const REQUIRED_JOB_FIELDS = [
  "address",
  "areaSqft",
  "system",
  "arrivalTime",
  "access",
  "scope",
  "crew",
];

const FIELD_LABELS = {
  address: "Job address",
  areaSqft: "Area (sq ft)",
  system: "Coating system",
  product: "Exact product",
  arrivalTime: "Arrival time",
  access: "Site access",
  scope: "Scope of work",
  crew: "Crew",
  date: "Job date",
};

export function jobGaps(job = {}, fields = REQUIRED_JOB_FIELDS) {
  return fields.filter((field) =>
    field === "areaSqft"
      ? !(Number.isFinite(job[field]) && job[field] > 0)
      : !String(job[field] ?? "").trim(),
  );
}

export function jobGapLabel(field) {
  return FIELD_LABELS[field] || field;
}

export function inventoryStatus(item = {}) {
  if (
    item.quantity === null ||
    item.quantity === undefined ||
    !Number.isFinite(item.quantity)
  )
    return "unknown";
  if (item.quantity < 0) return "deficit";
  if (item.quantity === 0) return "out";
  if (Number.isFinite(item.minimum) && item.quantity <= item.minimum)
    return "low";
  return "available";
}

function clockMinutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

// Travel stays separate. Missing times and shifts crossing midnight need clarification.
export function laborMinutes(entry = {}) {
  const start = clockMinutes(entry.start),
    end = clockMinutes(entry.end);
  const breaks = entry.breakMinutes ?? 0;
  if (
    start === null ||
    end === null ||
    end < start ||
    !Number.isFinite(breaks) ||
    breaks < 0 ||
    breaks > end - start
  )
    return null;
  return end - start - breaks;
}

export function totalLaborMinutes(crew = []) {
  const values = crew.map(laborMinutes).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function materialTotals(lines = []) {
  const totals = new Map();
  for (const line of lines) {
    if (line.inventoryId && Number.isFinite(line.quantity) && line.quantity > 0)
      totals.set(
        line.inventoryId,
        (totals.get(line.inventoryId) || 0) + line.quantity,
      );
  }
  return Object.fromEntries(totals);
}

export function loadCheckStatus(check = {}) {
  if (!check.requirementsConfirmed) return "requirements-unconfirmed";
  if (!check.items?.length) return "empty";
  if (
    check.items.some(
      (item) =>
        item.required === null ||
        item.required === undefined ||
        item.counted === null ||
        item.counted === undefined,
    )
  )
    return "counts-incomplete";
  if (check.items.some((item) => item.counted < item.required)) return "short";
  if (!check.checkpoint || !check.checkedBy || !check.checkedAt)
    return "checkpoint-incomplete";
  if (
    check.items.some(
      (item) =>
        !item.name?.trim() || !item.unit?.trim() || !item.location?.trim(),
    )
  )
    return "item-details-incomplete";
  return "listed-quantities-matched";
}
