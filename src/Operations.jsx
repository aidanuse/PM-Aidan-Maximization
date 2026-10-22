import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardCheck,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Info,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { inventoryStatus, loadCheckStatus } from "../shared/domain.js";
import "./operations.css";

const uid = () => crypto.randomUUID();
const numberOrNull = (value) =>
  value === "" || value == null ? null : Number(value);
const amount = (value) =>
  value == null || value === ""
    ? "Unknown"
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const asLocal = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const asISO = (value) => (value ? new Date(value).toISOString() : "");
const nextDate = (value) => {
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const humanDate = (value) => {
  if (!value) return "No date";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Invalid date";
};
const humanTime = (value) => {
  if (!value) return "Not scheduled";
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Invalid date";
};
const jobName = (state, id) =>
  state.jobs?.find((j) => j.id === id)?.title ||
  (id ? "Job no longer available" : "General");
const productName = (state, id) =>
  state.inventory?.find((i) => i.id === id)?.name || "Removed inventory item";
const eventBound = (event, key) =>
  new Date(event.allDay ? `${event[key].slice(0, 10)}T00:00:00` : event[key]);
const eventTouchesDay = (event, date) => {
  const start = new Date(`${date}T00:00:00`),
    end = new Date(start);
  end.setDate(end.getDate() + 1);
  return eventBound(event, "start") < end && eventBound(event, "end") > start;
};

function Heading({ eyebrow, title, description, children }) {
  return (
    <div className="ops-heading">
      <div>
        {eyebrow && <p className="ops-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {children && <div className="ops-heading-actions">{children}</div>}
    </div>
  );
}
function EmptyState({ icon: Icon = Package, title, children, action }) {
  return (
    <div className="card ops-empty">
      <span className="ops-empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p className="muted">{children}</p>
      {action}
    </div>
  );
}
function Field({ label, hint, children, wide = false }) {
  const labelId = React.useId();
  return (
    <label className={`field${wide ? " ops-wide" : ""}`}>
      <span id={labelId}>{label}</span>
      {React.cloneElement(children, { "aria-labelledby": labelId })}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
function ErrorMessage({ message }) {
  return message ? (
    <div className="ops-error" role="alert">
      {message}
    </div>
  ) : null;
}
function FormActions({ busy, onCancel, label = "Save changes" }) {
  return (
    <div className="ops-form-actions">
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : label}
      </button>
      <button className="btn" type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}
function IconButton({ title, onClick, children, disabled = false }) {
  return (
    <button
      type="button"
      className="ops-icon-button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function JobSelect({ state, value, onChange, required = false }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
    >
      <option value="">{required ? "Choose a job" : "General / no job"}</option>
      {(state.jobs || []).map((job) => (
        <option key={job.id} value={job.id}>
          {job.title}
          {job.date ? ` · ${humanDate(job.date)}` : ""}
        </option>
      ))}
    </select>
  );
}
function Stat({ label, value, detail, tone = "" }) {
  return (
    <div className={`card ops-stat ${tone}`}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {detail && <small className="muted">{detail}</small>}
    </div>
  );
}
function Pill({ children, tone = "" }) {
  return <span className={`badge ops-pill ${tone}`}>{children}</span>;
}
function useSave(onSave, toast) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(collection, record, complete) {
    setBusy(true);
    setError("");
    try {
      const saved = await onSave(collection, record);
      toast?.(
        saved?._queued ? "Saved on this device. Waiting to sync." : "Saved.",
      );
      complete?.(saved);
      return saved;
    } catch (e) {
      setError(e.message || "Could not save. Your entries are still here.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, save };
}
async function removeRecord(
  onDelete,
  collection,
  record,
  label,
  toast,
  setError,
) {
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
  try {
    const result = await onDelete(collection, record.id, record.version);
    toast?.(
      result?._queued
        ? "Deletion queued on this device. Waiting to sync."
        : "Deleted.",
    );
  } catch (e) {
    setError(e.message || "Could not delete.");
  }
}

export function InventoryView({ state, onSave, onDelete, toast }) {
  const [draft, setDraft] = useState(null),
    [query, setQuery] = useState("");
  const { busy, error, setError, save } = useSave(onSave, toast);
  const inventory = state.inventory || [];
  const demand = useMemo(() => {
    const totals = {};
    (state.jobs || [])
      .filter(
        (j) => j.bookingStatus !== "cancelled" && j.date && j.date >= today(),
      )
      .forEach((j) =>
        (j.materials || []).forEach((m) => {
          if (m.quantity != null)
            totals[m.inventoryId] =
              (totals[m.inventoryId] || 0) + Number(m.quantity);
        }),
      );
    return totals;
  }, [state.jobs]);
  const lowStock = inventory.filter((i) =>
    ["low", "out", "deficit"].includes(inventoryStatus(i)),
  ).length;
  const filtered = inventory.filter((i) =>
    `${i.name} ${i.exactProduct || ""} ${i.location || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const fresh = () => {
    setError("");
    setDraft({
      id: uid(),
      name: "",
      exactProduct: "",
      unit: "kit",
      quantity: null,
      minimum: null,
      location: "",
      notes: "",
    });
  };
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <div className="ops-view stack">
      <Heading
        eyebrow="MATERIALS & EQUIPMENT"
        title="Know what you have."
        description="Count usable stock, plan the next load, and catch shortages before they become a trip."
      >
        <button className="btn btn-primary" onClick={fresh}>
          <Plus size={17} /> Add item
        </button>
      </Heading>
      <div className="ops-stats">
        <Stat
          label="Inventory items"
          value={inventory.length}
          detail="Your material and equipment list"
        />
        <Stat
          label="Need attention"
          value={lowStock}
          detail="At or below minimum, empty, or a stock deficit"
          tone={lowStock ? "ops-stat-warning" : ""}
        />
        <Stat
          label="Need a count"
          value={inventory.filter((i) => i.quantity == null).length}
          detail="Unknown stock stays unknown"
        />
      </div>
      <ErrorMessage message={error} />
      {draft && (
        <form
          className="card ops-editor"
          onSubmit={(e) => {
            e.preventDefault();
            save(
              "inventory",
              {
                ...draft,
                name: draft.name.trim(),
                quantity: numberOrNull(draft.quantity),
                minimum: numberOrNull(draft.minimum),
              },
              () => setDraft(null),
            );
          }}
        >
          <h3>
            {draft.version ? "Edit inventory item" : "Add an inventory item"}
          </h3>
          <div className="form-grid">
            <Field label="Item name">
              <input
                required
                autoFocus
                value={draft.name}
                onChange={(e) => change("name", e.target.value)}
                placeholder="Material or equipment name"
              />
            </Field>
            <Field label="Exact product / variant">
              <input
                value={draft.exactProduct || ""}
                onChange={(e) => change("exactProduct", e.target.value)}
                placeholder="Manufacturer, product, colour…"
              />
            </Field>
            <Field
              label="Counting unit"
              hint="For kits, count complete usable kits."
            >
              <input
                required
                value={draft.unit}
                onChange={(e) => change("unit", e.target.value)}
                placeholder="kit, bag, litre, each…"
              />
            </Field>
            <Field
              label="Quantity in stock"
              hint="Leave blank if you have not counted it."
            >
              <input
                type="number"
                step="any"
                value={draft.quantity ?? ""}
                onChange={(e) => change("quantity", e.target.value)}
                placeholder="Not counted"
              />
            </Field>
            <Field
              label="Minimum stock"
              hint="Optional threshold for a low-stock flag."
            >
              <input
                type="number"
                min="0"
                step="any"
                value={draft.minimum ?? ""}
                onChange={(e) => change("minimum", e.target.value)}
                placeholder="No minimum set"
              />
            </Field>
            <Field label="Storage location">
              <input
                value={draft.location || ""}
                onChange={(e) => change("location", e.target.value)}
                placeholder="Garage, trailer, jobsite…"
              />
            </Field>
            <Field label="Notes" wide>
              <textarea
                rows="2"
                value={draft.notes || ""}
                onChange={(e) => change("notes", e.target.value)}
              />
            </Field>
          </div>
          <FormActions
            busy={busy}
            onCancel={() => setDraft(null)}
            label={draft.version ? "Save item" : "Add item"}
          />
        </form>
      )}
      {!!inventory.length && (
        <div className="ops-search">
          <Search size={18} />
          <input
            aria-label="Search inventory"
            placeholder="Find a product, item, or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      {!inventory.length ? (
        <EmptyState
          title="Your next load starts here."
          action={
            !draft && (
              <button className="btn" onClick={fresh}>
                <Plus size={16} /> Add your first item
              </button>
            )
          }
        >
          Add your actual products and usable counts. Job material lists will
          use these same items.
        </EmptyState>
      ) : !filtered.length ? (
        <EmptyState title="No matching items">
          Try a different product or location.
        </EmptyState>
      ) : (
        <div className="ops-item-grid">
          {filtered.map((item) => {
            const stockStatus = inventoryStatus(item);
            const low = ["low", "out", "deficit"].includes(stockStatus);
            const stockLabel =
              stockStatus === "unknown"
                ? "Count needed"
                : stockStatus === "deficit"
                  ? "Stock deficit"
                  : stockStatus === "out"
                    ? "Out of stock"
                    : stockStatus === "low"
                      ? "At / below minimum"
                      : "Count recorded";
            const planned = demand[item.id] || 0;
            return (
              <article className="card ops-inventory-card" key={item.id}>
                <div className="ops-card-top">
                  <span className="ops-item-icon">
                    <Package size={19} />
                  </span>
                  <div className="ops-row-actions">
                    <IconButton
                      title={`Edit ${item.name}`}
                      onClick={() => {
                        setError("");
                        setDraft({ ...item });
                      }}
                    >
                      <Edit3 size={16} />
                    </IconButton>
                    <IconButton
                      title={`Delete ${item.name}`}
                      onClick={() =>
                        removeRecord(
                          onDelete,
                          "inventory",
                          item,
                          item.name,
                          toast,
                          setError,
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>
                <h3>{item.name}</h3>
                {item.exactProduct && (
                  <p className="muted ops-small">{item.exactProduct}</p>
                )}
                <div className="ops-stock-number">
                  {item.quantity == null
                    ? "Not counted"
                    : amount(item.quantity)}{" "}
                  {item.quantity != null && <span>{item.unit}</span>}
                </div>
                <div className="ops-card-meta">
                  <span>{item.location || "Location not recorded"}</span>
                  <Pill
                    tone={
                      item.quantity == null
                        ? "neutral"
                        : low
                          ? "warning"
                          : "good"
                    }
                  >
                    {stockLabel}
                  </Pill>
                </div>
                <div className="ops-inventory-foot">
                  <span>
                    Minimum{" "}
                    <strong>
                      {item.minimum == null
                        ? "Not set"
                        : `${amount(item.minimum)} ${item.unit}`}
                    </strong>
                  </span>
                  <span>
                    Upcoming demand{" "}
                    <strong>
                      {amount(planned)} {item.unit}
                    </strong>
                  </span>
                </div>
                {item.notes && (
                  <p className="ops-small muted ops-note">{item.notes}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {!!inventory.length && (
        <p className="ops-footnote">
          Upcoming demand totals materials listed on non-cancelled jobs dated
          today or later. It is a planning figure, not a physical reservation.
          Reviewing a Daily Sheet records actual consumption.
        </p>
      )}
    </div>
  );
}

function loadSummary(check) {
  const status = loadCheckStatus(check);
  const labels = {
    empty: ["No materials listed", "neutral"],
    short: ["Shortage recorded", "warning"],
    "requirements-unconfirmed": ["Requirements unconfirmed", "warning"],
    "counts-incomplete": ["Counts incomplete", "neutral"],
    "checkpoint-incomplete": ["Checkpoint incomplete", "neutral"],
    "listed-quantities-matched": ["Listed quantities covered", "good"],
    "item-details-incomplete": ["Item details / location needed", "warning"],
  };
  const [label, tone] = labels[status] || ["Check incomplete", "neutral"];
  return { label, tone };
}

export function LoadCheckView({ state, onSave, onDelete, toast, onNavigate }) {
  const [draft, setDraft] = useState(null);
  const { busy, error, setError, save } = useSave(onSave, toast);
  const jobs = state.jobs || [],
    checks = [...(state.loadChecks || [])].sort((a, b) =>
      String(b.checkedAt || b.createdAt).localeCompare(
        String(a.checkedAt || a.createdAt),
      ),
    );
  const newCheck = () => {
    setError("");
    setDraft({
      id: uid(),
      jobId: "",
      checkpoint: "",
      vehicle: "",
      checkedBy: "Aidan",
      checkedAt: asLocal(new Date().toISOString()),
      requirementsConfirmed: false,
      items: [],
      notes: "",
    });
  };
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const newLine = () => ({
    name: "",
    unit: "kit",
    required: null,
    counted: null,
    location: "",
  });
  const updateLine = (index, key, value) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((i, n) => (n === index ? { ...i, [key]: value } : i)),
    }));
  const useJob = () => {
    const job = jobs.find((j) => j.id === draft.jobId);
    if (!job) return;
    if (
      draft.items.length &&
      !window.confirm(
        "Replace the current checklist with this job’s material list?",
      )
    )
      return;
    change(
      "items",
      (job.materials || []).map((m) => {
        const inventory = state.inventory?.find((i) => i.id === m.inventoryId);
        return {
          inventoryId: m.inventoryId,
          name: inventory?.name || "Inventory item unavailable",
          unit: inventory?.unit || "unit",
          required: m.quantity ?? null,
          counted: null,
          location: "",
        };
      }),
    );
  };
  return (
    <div className="ops-view stack">
      <Heading
        eyebrow="THE PHYSICAL CHECK"
        title="Count it. Place it. Check it."
        description="Aidan owns the final check. Record the actual location of each item at the checkpoint you choose."
      >
        <button className="btn btn-primary" onClick={newCheck}>
          <Plus size={17} /> New check
        </button>
      </Heading>
      <div className="ops-callout">
        <ClipboardCheck size={22} />
        <div>
          <strong>A count is a point-in-time record.</strong>
          <p>
            Keep completed checks as history. When materials move or the scope
            changes, create a new check for the affected load. Quantities alone
            do not establish installation readiness.
          </p>
        </div>
      </div>
      <ErrorMessage message={error} />
      {draft && (
        <form
          className="card ops-editor"
          onSubmit={(e) => {
            e.preventDefault();
            save(
              "loadChecks",
              {
                ...draft,
                checkedBy: "Aidan",
                checkedAt: asISO(draft.checkedAt),
                items: draft.items.map((i) => ({
                  ...i,
                  required: numberOrNull(i.required),
                  counted: numberOrNull(i.counted),
                })),
              },
              () => setDraft(null),
            );
          }}
        >
          <h3>
            {draft.version ? "Edit recorded check" : "New physical check"}
          </h3>
          <div className="form-grid">
            <Field label="Job">
              <JobSelect
                state={state}
                value={draft.jobId}
                onChange={(v) => change("jobId", v)}
                required
              />
            </Field>
            <Field
              label="Checkpoint"
              hint="Choose where this check takes place."
            >
              <select
                required
                value={draft.checkpoint}
                onChange={(e) => change("checkpoint", e.target.value)}
              >
                <option value="">Choose a checkpoint</option>
                <option>Before departure</option>
                <option>At the jobsite</option>
                <option>After a load change</option>
                <option>End of day</option>
              </select>
            </Field>
            <Field label="Vehicle / trailer">
              <input
                value={draft.vehicle}
                onChange={(e) => change("vehicle", e.target.value)}
                placeholder="Which vehicle or trailer?"
              />
            </Field>
            <Field label="Checked at">
              <input
                required
                type="datetime-local"
                value={draft.checkedAt}
                onChange={(e) => change("checkedAt", e.target.value)}
              />
            </Field>
          </div>
          <div className="ops-checklist-toolbar">
            <strong>Checked by Aidan</strong>
            <button
              type="button"
              className="btn"
              disabled={!draft.jobId}
              onClick={useJob}
            >
              Use job material list
            </button>
          </div>
          {!draft.items.length && (
            <p className="ops-inline-empty">
              Use the job material list or add an item below. Stock recorded in
              inventory does not fill in the physical count.
            </p>
          )}
          <div className="ops-check-lines">
            {draft.items.map((item, index) => (
              <div className="ops-check-line" key={index}>
                <div className="ops-line-title">
                  <strong>Item {index + 1}</strong>
                  <IconButton
                    title={`Remove item ${index + 1}`}
                    onClick={() =>
                      change(
                        "items",
                        draft.items.filter((_, n) => n !== index),
                      )
                    }
                  >
                    <X size={16} />
                  </IconButton>
                </div>
                <div className="form-grid">
                  <Field label="Item / exact product">
                    <input
                      required
                      value={item.name}
                      onChange={(e) =>
                        updateLine(index, "name", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Unit">
                    <input
                      required
                      value={item.unit}
                      onChange={(e) =>
                        updateLine(index, "unit", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Required quantity">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.required ?? ""}
                      placeholder="Unconfirmed"
                      onChange={(e) =>
                        updateLine(index, "required", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Physically counted">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.counted ?? ""}
                      placeholder="Not checked"
                      onChange={(e) =>
                        updateLine(index, "counted", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Actual location" wide>
                    <input
                      value={item.location || ""}
                      onChange={(e) =>
                        updateLine(index, "location", e.target.value)
                      }
                      placeholder="Inside trailer, jobsite, still at garage…"
                    />
                  </Field>
                </div>
                {item.required !== "" &&
                  item.required != null &&
                  item.counted !== "" &&
                  item.counted != null &&
                  Number(item.counted) < Number(item.required) && (
                    <p className="ops-shortage">
                      Short by{" "}
                      {amount(Number(item.required) - Number(item.counted))}{" "}
                      {item.unit}
                    </p>
                  )}
              </div>
            ))}
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => change("items", [...draft.items, newLine()])}
          >
            <Plus size={16} /> Add item
          </button>
          <label className="ops-checkbox">
            <input
              type="checkbox"
              checked={draft.requirementsConfirmed}
              onChange={(e) =>
                change("requirementsConfirmed", e.target.checked)
              }
            />
            <span>
              I have confirmed the required quantities against this job’s
              current scope.
            </span>
          </label>
          <Field label="Notes / shortages / other delivery stops">
            <textarea
              rows="3"
              value={draft.notes}
              onChange={(e) => change("notes", e.target.value)}
              placeholder="What needs attention before the affected work starts?"
            />
          </Field>
          <FormActions
            busy={busy}
            onCancel={() => setDraft(null)}
            label="Save physical check"
          />
        </form>
      )}
      {!checks.length ? (
        <EmptyState
          icon={ClipboardCheck}
          title="A simple pause before the next step."
          action={
            !jobs.length ? (
              <button className="btn" onClick={() => onNavigate("jobs")}>
                Add a job first
              </button>
            ) : (
              !draft && (
                <button className="btn" onClick={newCheck}>
                  Create your first check
                </button>
              )
            )
          }
        >
          Record what is physically present, where it is, and whether the
          required quantities are confirmed.
        </EmptyState>
      ) : (
        <div className="ops-list">
          {checks.map((check) => {
            const summary = loadSummary(check);
            return (
              <article className="card ops-check-record" key={check.id}>
                <div className="ops-card-top">
                  <div>
                    <p className="ops-eyebrow">
                      {check.checkpoint || "Checkpoint not set"}
                    </p>
                    <h3>{jobName(state, check.jobId)}</h3>
                  </div>
                  <Pill tone={summary.tone}>{summary.label}</Pill>
                </div>
                <p className="muted ops-small">
                  {humanTime(check.checkedAt)} ·{" "}
                  {check.checkedBy || "Checker not recorded"}
                  {check.vehicle ? ` · ${check.vehicle}` : ""}
                </p>
                <div className="ops-compact-list">
                  {(check.items || []).map((item, index) => (
                    <div key={index}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.location || "Location not recorded"}
                        </small>
                      </span>
                      <span
                        className={
                          item.counted != null &&
                          item.required != null &&
                          item.counted < item.required
                            ? "ops-danger-text"
                            : ""
                        }
                      >
                        {amount(item.counted)} / {amount(item.required)}{" "}
                        {item.unit}
                        <small>counted / required</small>
                      </span>
                    </div>
                  ))}
                </div>
                {check.notes && <p className="ops-note">{check.notes}</p>}
                <div className="ops-record-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      setError("");
                      setDraft({
                        ...check,
                        items: check.items.map((i) => ({ ...i })),
                        checkedAt: asLocal(check.checkedAt),
                      });
                    }}
                  >
                    <Edit3 size={15} /> Edit record
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setError("");
                      setDraft({
                        id: uid(),
                        jobId: check.jobId,
                        checkpoint: "",
                        vehicle: check.vehicle,
                        checkedBy: "Aidan",
                        checkedAt: asLocal(new Date().toISOString()),
                        requirementsConfirmed: false,
                        items: check.items.map((i) => ({
                          ...i,
                          counted: null,
                        })),
                        notes: "",
                      });
                    }}
                  >
                    New recheck
                  </button>
                  <IconButton
                    title={`Delete check for ${jobName(state, check.jobId)}`}
                    onClick={() =>
                      removeRecord(
                        onDelete,
                        "loadChecks",
                        check,
                        "this physical check",
                        toast,
                        setError,
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ActionsView({ state, onSave, onDelete, toast }) {
  const [draft, setDraft] = useState(null),
    [filter, setFilter] = useState("active");
  const { busy, error, setError, save } = useSave(onSave, toast);
  const actions = [...(state.actions || [])].sort((a, b) =>
    (a.dueAt || "z").localeCompare(b.dueAt || "z"),
  );
  const filtered = actions.filter(
    (a) =>
      filter === "all" ||
      (filter === "active" ? a.status !== "done" : a.status === filter),
  );
  const fresh = () => {
    setError("");
    setDraft({
      id: uid(),
      title: "",
      jobId: "",
      owner: "Aidan",
      dueAt: "",
      status: "open",
      notes: "",
    });
  };
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <div className="ops-view stack">
      <Heading
        eyebrow="CLOSE THE LOOP"
        title="Every loose end has a next step."
        description="Keep follow-ups, buying, callbacks, and unfinished work in one place."
      >
        <button className="btn btn-primary" onClick={fresh}>
          <Plus size={17} /> Add action
        </button>
      </Heading>
      <div className="ops-stats">
        <Stat
          label="Open"
          value={actions.filter((a) => a.status === "open").length}
        />
        <Stat
          label="Waiting"
          value={actions.filter((a) => a.status === "waiting").length}
        />
        <Stat
          label="Completed"
          value={actions.filter((a) => a.status === "done").length}
        />
      </div>
      <ErrorMessage message={error} />
      {draft && (
        <form
          className="card ops-editor"
          onSubmit={(e) => {
            e.preventDefault();
            save(
              "actions",
              {
                ...draft,
                title: draft.title.trim(),
                dueAt: asISO(draft.dueAt),
              },
              () => setDraft(null),
            );
          }}
        >
          <h3>{draft.version ? "Edit action" : "New action"}</h3>
          <div className="form-grid">
            <Field label="What needs to happen?" wide>
              <input
                required
                autoFocus
                value={draft.title}
                onChange={(e) => change("title", e.target.value)}
                placeholder="A clear, specific next step"
              />
            </Field>
            <Field label="Job">
              <JobSelect
                state={state}
                value={draft.jobId}
                onChange={(v) => change("jobId", v)}
              />
            </Field>
            <Field label="Owner">
              <input
                value={draft.owner}
                onChange={(e) => change("owner", e.target.value)}
                list="action-owners"
              />
              <datalist id="action-owners">
                <option>Aidan</option>
                <option>Max</option>
                <option>Daniel</option>
              </datalist>
            </Field>
            <Field
              label="Due date and time"
              hint="Optional. An action deadline does not create a phone notification."
            >
              <input
                type="datetime-local"
                value={draft.dueAt}
                onChange={(e) => change("dueAt", e.target.value)}
              />
            </Field>
            <Field label="Status">
              <select
                value={draft.status}
                onChange={(e) => change("status", e.target.value)}
              >
                <option value="open">Open</option>
                <option value="waiting">Waiting</option>
                <option value="done">Done</option>
              </select>
            </Field>
            <Field label="Details" wide>
              <textarea
                rows="3"
                value={draft.notes}
                onChange={(e) => change("notes", e.target.value)}
              />
            </Field>
          </div>
          <FormActions
            busy={busy}
            onCancel={() => setDraft(null)}
            label="Save action"
          />
        </form>
      )}
      <div className="ops-filter-tabs" aria-label="Filter actions">
        {[
          ["active", "Active"],
          ["waiting", "Waiting"],
          ["done", "Completed"],
          ["all", "All"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            className={filter === key ? "is-active" : ""}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {!filtered.length ? (
        <EmptyState
          icon={CheckCheck}
          title={
            actions.length
              ? "Nothing in this view."
              : "Give the next step a home."
          }
        >
          {actions.length
            ? "Choose another filter to see your other actions."
            : "Add a real task, choose its owner, and set a deadline when one is needed."}
        </EmptyState>
      ) : (
        <div className="ops-list">
          {filtered.map((action) => {
            const overdue =
              action.status !== "done" &&
              action.dueAt &&
              new Date(action.dueAt) < new Date();
            return (
              <article
                key={action.id}
                className={`card ops-action ${action.status === "done" ? "ops-action-done" : ""}`}
              >
                <button
                  className={`ops-complete-button ${action.status === "done" ? "is-complete" : ""}`}
                  onClick={() =>
                    save("actions", {
                      ...action,
                      status: action.status === "done" ? "open" : "done",
                    })
                  }
                  disabled={busy}
                  aria-label={
                    action.status === "done"
                      ? `Reopen ${action.title}`
                      : `Complete ${action.title}`
                  }
                >
                  {action.status === "done" && <Check size={17} />}
                </button>
                <div className="ops-action-content">
                  <h3>{action.title}</h3>
                  <p className="muted ops-small">
                    {action.owner || "No owner"} ·{" "}
                    {jobName(state, action.jobId)}
                    {action.dueAt ? ` · ${humanTime(action.dueAt)}` : ""}
                  </p>
                  {action.notes && (
                    <p className="ops-small ops-note">{action.notes}</p>
                  )}
                  <Pill
                    tone={
                      overdue
                        ? "warning"
                        : action.status === "done"
                          ? "good"
                          : "neutral"
                    }
                  >
                    {overdue
                      ? "Overdue"
                      : action.status === "waiting"
                        ? "Waiting"
                        : action.status === "done"
                          ? "Completed"
                          : "Open"}
                  </Pill>
                </div>
                <div className="ops-row-actions">
                  <IconButton
                    title={`Edit ${action.title}`}
                    onClick={() => {
                      setError("");
                      setDraft({ ...action, dueAt: asLocal(action.dueAt) });
                    }}
                  >
                    <Edit3 size={16} />
                  </IconButton>
                  <IconButton
                    title={`Delete ${action.title}`}
                    onClick={() =>
                      removeRecord(
                        onDelete,
                        "actions",
                        action,
                        action.title,
                        toast,
                        setError,
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AnalysisView({ state, onNavigate }) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const allSheets = state.dailySheets || [];
  const sheets = allSheets.filter(
    (s) =>
      s.status === "reviewed" &&
      (!from || s.date >= from) &&
      (!to || s.date <= to),
  );
  const delaySheets = sheets.filter((s) => s.delayMinutes != null),
    costSheets = sheets.filter((s) => s.deliveryCost != null);
  const delayTotal = delaySheets.reduce(
      (n, s) => n + Number(s.delayMinutes),
      0,
    ),
    costTotal = costSheets.reduce((n, s) => n + Number(s.deliveryCost), 0);
  const causes = {},
    materialUsage = {};
  sheets.forEach((s) => {
    if (s.delayCause?.trim()) {
      const key = s.delayCause.trim();
      if (!causes[key]) causes[key] = { count: 0, minutes: 0, known: 0 };
      causes[key].count++;
      if (s.delayMinutes != null) {
        causes[key].minutes += Number(s.delayMinutes);
        causes[key].known++;
      }
    }
    (s.materials || []).forEach((m) => {
      if (m.quantity != null)
        materialUsage[m.inventoryId] =
          (materialUsage[m.inventoryId] || 0) + Number(m.quantity);
    });
  });
  const issues = sheets
    .filter((s) => s.issues?.trim())
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="ops-view stack">
      <Heading
        eyebrow="LEARN FROM THE DAY"
        title="Less guesswork. Better next weeks."
        description="Analysis uses reviewed Daily Sheets. Missing values are shown as missing, never assumed to be zero."
      />
      <div className="card ops-date-filter">
        <Field label="From date">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Through date">
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        {(from || to) && (
          <button
            className="btn"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Clear dates
          </button>
        )}
      </div>
      <div className="ops-stats">
        <Stat
          label="Reviewed sheets"
          value={sheets.length}
          detail={`${allSheets.filter((s) => s.status !== "reviewed").length} drafts excluded`}
        />
        <Stat
          label="Recorded delay"
          value={
            delaySheets.length ? `${amount(delayTotal)} min` : "Not recorded"
          }
          detail={`${delaySheets.length} of ${sheets.length} sheets include a delay value`}
        />
        <Stat
          label="Recorded delivery cost"
          value={costSheets.length ? `$${amount(costTotal)}` : "Not recorded"}
          detail={`${costSheets.length} of ${sheets.length} sheets include a delivery cost`}
        />
      </div>
      {!sheets.length ? (
        <EmptyState
          icon={CalendarDays}
          title="Your work will tell the story."
          action={
            <button className="btn" onClick={() => onNavigate("daily")}>
              Open Daily Sheets
            </button>
          }
        >
          Review a Daily Sheet to start tracking actual delays, delivery costs,
          and material use. Draft entries are excluded until you review them.
        </EmptyState>
      ) : (
        <>
          <div className="ops-analysis-grid">
            <section className="card ops-panel">
              <div className="ops-section-title">
                <h3>Delay causes</h3>
                <Pill>{Object.keys(causes).length} recorded</Pill>
              </div>
              {!Object.keys(causes).length ? (
                <p className="muted">
                  No causes recorded in this period. Add the cause on a Daily
                  Sheet when a delay happens.
                </p>
              ) : (
                <div className="ops-compact-list">
                  {Object.entries(causes)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([cause, data]) => (
                      <div key={cause}>
                        <span>
                          <strong>{cause}</strong>
                          <small>
                            {data.count} {data.count === 1 ? "sheet" : "sheets"}
                          </small>
                        </span>
                        <span>
                          {data.known
                            ? `${amount(data.minutes)} min`
                            : "Time unknown"}
                          <small>
                            {data.known}/{data.count} include duration
                          </small>
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </section>
            <section className="card ops-panel">
              <h3>Material use</h3>
              <p className="muted ops-small">
                Actual quantities recorded on reviewed sheets, in each item’s
                own unit.
              </p>
              {!Object.keys(materialUsage).length ? (
                <p className="muted">
                  No material usage recorded in this period.
                </p>
              ) : (
                <div className="ops-compact-list">
                  {Object.entries(materialUsage).map(([id, quantity]) => (
                    <div key={id}>
                      <span>
                        <strong>{productName(state, id)}</strong>
                      </span>
                      <span>
                        {amount(quantity)}{" "}
                        {state.inventory?.find((i) => i.id === id)?.unit ||
                          "unit unknown"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          <section className="card ops-panel">
            <h3>What interrupted the work?</h3>
            {!issues.length ? (
              <p className="muted">
                No issue descriptions recorded in these reviewed sheets.
              </p>
            ) : (
              <div className="ops-issue-list">
                {issues.map((s) => (
                  <div key={s.id}>
                    <div className="ops-card-top">
                      <strong>{jobName(state, s.jobId)}</strong>
                      <span className="muted ops-small">
                        {humanDate(s.date)}
                      </span>
                    </div>
                    <p>{s.issues}</p>
                    {s.tomorrowNeeds && (
                      <p className="muted ops-small">
                        <strong>Next day:</strong> {s.tomorrowNeeds}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="ops-callout">
            <Info size={20} />
            <div>
              <strong>Know the coverage behind the number.</strong>
              <p>
                {sheets.length - delaySheets.length} sheets have no delay value;{" "}
                {sheets.length - costSheets.length} have no delivery cost. Enter
                an explicit 0 when there was none. These figures do not
                calculate job profit or claim hours saved.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

async function api(path, options) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}
function useIntegrationData(paths) {
  const [data, setData] = useState({}),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const key = paths.join("|");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(paths.map((path) => api(path)));
      const next = {};
      paths.forEach((path, i) => {
        next[path] = results[i];
      });
      setData(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all(paths.map((path) => api(path)))
      .then((results) => {
        if (!active) return;
        const next = {};
        paths.forEach((path, i) => {
          next[path] = results[i];
        });
        setData(next);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [key]);
  return { data, error, loading, refresh };
}

export function CalendarView({
  state,
  onSave,
  onDelete,
  reload,
  toast,
  onNavigate,
}) {
  const [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [selectedDay, setSelectedDay] = useState(""),
    [draft, setDraft] = useState(null),
    [importOpen, setImportOpen] = useState(false),
    [ics, setIcs] = useState(""),
    [source, setSource] = useState("timetree"),
    [createJobs, setCreateJobs] = useState(false),
    [importing, setImporting] = useState(false),
    [importResult, setImportResult] = useState(null);
  const { busy, error, setError, save } = useSave(onSave, toast);
  const events = [...(state.calendarEvents || [])].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const monthEvents = events.filter(
    (event) =>
      eventBound(event, "start") < monthEnd && eventBound(event, "end") > month,
  );
  const shown = monthEvents.filter(
    (event) => !selectedDay || eventTouchesDay(event, selectedDay),
  );
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay(),
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const fresh = () => {
    setError("");
    const date = selectedDay || today();
    setDraft({
      id: uid(),
      title: "",
      start: `${date}T08:00`,
      end: `${date}T16:00`,
      allDay: false,
      jobId: "",
      source: "manual",
      description: "",
      location: "",
    });
  };
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  async function importCalendar(e) {
    e.preventDefault();
    setError("");
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api("/api/integrations/calendar/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ics, source, createJobs }),
      });
      setImportResult(result);
      await reload();
      toast?.("Calendar import finished. Review the result below.");
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }
  return (
    <div className="ops-view stack">
      <Heading
        eyebrow="YOUR TEAM SCHEDULE"
        title="See what’s coming."
        description="Keep a local working calendar and bring in exported TimeTree events."
      >
        <button
          className="btn"
          onClick={() => {
            setImportOpen((v) => !v);
            setError("");
          }}
        >
          <Upload size={16} /> Import
        </button>
        <button className="btn btn-primary" onClick={fresh}>
          <Plus size={17} /> Add event
        </button>
      </Heading>
      <div className="ops-callout">
        <CalendarDays size={22} />
        <div>
          <strong>TimeTree remains your team schedule.</strong>
          <p>
            This app supports calendar-file import and export. It does not have
            a live TimeTree connection, and editing here does not update
            TimeTree. Import a fresh export when the team schedule changes.
          </p>
        </div>
      </div>
      <ErrorMessage message={error} />
      {importOpen && (
        <form className="card ops-editor" onSubmit={importCalendar}>
          <h3>Import a calendar file</h3>
          <p className="muted ops-small">
            Use an .ics file you can export or obtain from your calendar.
            Imports keep event identifiers to avoid duplicate events. A calendar
            source label does not enable live syncing.
          </p>
          <div className="form-grid">
            <Field label="Calendar source">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="timetree">TimeTree</option>
                <option value="google">Google Calendar</option>
                <option value="ics">Other calendar file</option>
              </select>
            </Field>
            <Field label="Choose an .ics file">
              <input
                type="file"
                accept=".ics,text/calendar"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 2_000_000) {
                      setError("Choose a calendar file smaller than 2 MB.");
                      return;
                    }
                    setIcs(await file.text());
                  }
                }}
              />
            </Field>
            <Field
              label="Calendar file contents"
              hint="Or paste the complete exported .ics text."
              wide
            >
              <textarea
                rows="5"
                required
                value={ics}
                onChange={(e) => setIcs(e.target.value)}
                placeholder="BEGIN:VCALENDAR…"
              />
            </Field>
          </div>
          <label className="ops-checkbox">
            <input
              type="checkbox"
              checked={createJobs}
              onChange={(e) => setCreateJobs(e.target.checked)}
            />
            <span>
              Create linked job cards from these events. Review imported details
              before relying on material requirements.
            </span>
          </label>
          <div className="ops-form-actions">
            <button className="btn btn-primary" disabled={importing}>
              {importing ? "Importing…" : "Import calendar"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setImportOpen(false)}
            >
              Close
            </button>
          </div>
          {importResult && (
            <div className="ops-import-result" role="status">
              <strong>Import result</strong>
              <p>
                {importResult.created || 0} created ·{" "}
                {importResult.updated || 0} updated ·{" "}
                {importResult.unchanged || 0} unchanged
                {createJobs
                  ? ` · ${importResult.jobsCreated || 0} job cards created`
                  : ""}
              </p>
              {!!importResult.conflicts?.length && (
                <p className="ops-danger-text">
                  {importResult.conflicts.length} conflicts need review; locally
                  edited records were preserved.
                </p>
              )}
              {(importResult.conflicts || []).map((c, i) => (
                <p className="ops-small" key={`c-${i}`}>
                  {typeof c === "string"
                    ? c
                    : c.title ||
                      c.reason ||
                      c.message ||
                      "Calendar event conflict"}
                </p>
              ))}
              {(importResult.warnings || []).map((w, i) => (
                <p className="ops-small" key={i}>
                  {typeof w === "string" ? w : w.message || "Import warning"}
                </p>
              ))}
            </div>
          )}
        </form>
      )}
      {draft && (
        <form
          className="card ops-editor"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.end || draft.end <= draft.start) {
              setError("The event end must be after its start.");
              return;
            }
            save(
              "calendarEvents",
              {
                ...draft,
                start: draft.allDay
                  ? draft.start.slice(0, 10)
                  : asISO(draft.start),
                end: draft.end
                  ? draft.allDay
                    ? draft.end.slice(0, 10)
                    : asISO(draft.end)
                  : "",
                title: draft.title.trim(),
              },
              () => setDraft(null),
            );
          }}
        >
          <h3>{draft.version ? "Edit local event" : "New calendar event"}</h3>
          {draft.source !== "manual" && (
            <p className="ops-small muted">
              This edit changes the local copy. A later import may flag a
              conflict.
            </p>
          )}
          <div className="form-grid">
            <Field label="Event title" wide>
              <input
                required
                value={draft.title}
                onChange={(e) => change("title", e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Start">
              <input
                type={draft.allDay ? "date" : "datetime-local"}
                required
                value={draft.allDay ? draft.start.slice(0, 10) : draft.start}
                onChange={(e) => change("start", e.target.value)}
              />
            </Field>
            <Field
              label={draft.allDay ? "End date (exclusive)" : "End"}
              hint={
                draft.allDay
                  ? "For a one-day event, choose the following date."
                  : undefined
              }
            >
              <input
                required
                type={draft.allDay ? "date" : "datetime-local"}
                value={draft.allDay ? draft.end.slice(0, 10) : draft.end}
                min={draft.start}
                onChange={(e) => change("end", e.target.value)}
              />
            </Field>
            <Field label="Linked job">
              <JobSelect
                state={state}
                value={draft.jobId}
                onChange={(v) => change("jobId", v)}
              />
            </Field>
            <Field label="Location">
              <input
                value={draft.location || ""}
                onChange={(e) => change("location", e.target.value)}
              />
            </Field>
            <Field label="Details" wide>
              <textarea
                rows="3"
                value={draft.description || ""}
                onChange={(e) => change("description", e.target.value)}
              />
            </Field>
          </div>
          <label className="ops-checkbox">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(e) => {
                const checked = e.target.checked;
                setDraft((d) => ({
                  ...d,
                  allDay: checked,
                  start: checked
                    ? d.start.slice(0, 10)
                    : `${d.start.slice(0, 10)}T08:00`,
                  end: checked
                    ? d.end.slice(0, 10) > d.start.slice(0, 10)
                      ? d.end.slice(0, 10)
                      : nextDate(d.start)
                    : d.end
                      ? `${d.end.slice(0, 10)}T16:00`
                      : "",
                }));
              }}
            />
            <span>All-day event</span>
          </label>
          <FormActions
            busy={busy}
            onCancel={() => setDraft(null)}
            label="Save event"
          />
        </form>
      )}
      <div className="ops-calendar-layout">
        <section className="card ops-calendar">
          <div className="ops-month-heading">
            <h3>
              {month.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <div className="ops-row-actions">
              <IconButton
                title="Previous month"
                onClick={() => {
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  );
                  setSelectedDay("");
                }}
              >
                <ArrowLeft size={17} />
              </IconButton>
              <IconButton
                title="Next month"
                onClick={() => {
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  );
                  setSelectedDay("");
                }}
              >
                <ArrowRight size={17} />
              </IconButton>
            </div>
          </div>
          <div className="ops-calendar-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span className="ops-weekday" key={day}>
                {day}
              </span>
            ))}
            {Array.from({ length: firstDay }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${monthPrefix}-${String(i + 1).padStart(2, "0")}`,
                count = monthEvents.filter((e) =>
                  eventTouchesDay(e, date),
                ).length;
              return (
                <button
                  key={date}
                  className={`${selectedDay === date ? "selected " : ""}${date === today() ? "today " : ""}`}
                  aria-label={`${humanDate(date)}, ${count} events`}
                  aria-pressed={selectedDay === date}
                  onClick={() =>
                    setSelectedDay((d) => (d === date ? "" : date))
                  }
                >
                  <span>{i + 1}</span>
                  {count > 0 && <span className="ops-calendar-dot" />}
                </button>
              );
            })}
          </div>
          <div className="ops-calendar-bottom">
            <button
              className="ops-text-button"
              onClick={() => {
                setMonth(
                  new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                );
                setSelectedDay(today());
              }}
            >
              Today
            </button>
            {selectedDay && (
              <button
                className="ops-text-button"
                onClick={() => setSelectedDay("")}
              >
                Show full month
              </button>
            )}
          </div>
        </section>
        <section className="ops-calendar-agenda">
          <div className="ops-section-title">
            <h3>{selectedDay ? humanDate(selectedDay) : "This month"}</h3>
            <Pill>{shown.length} events</Pill>
          </div>
          {!shown.length ? (
            <EmptyState icon={CalendarDays} title="Space in the schedule.">
              No events {selectedDay ? "on this date" : "this month"}. Add one
              or import your calendar.
            </EmptyState>
          ) : (
            <div className="ops-list">
              {shown.map((event) => (
                <article className="card ops-event" key={event.id}>
                  <div className="ops-card-top">
                    <h3>{event.title}</h3>
                    <Pill>
                      {event.source === "timetree"
                        ? "TimeTree import"
                        : event.source === "manual"
                          ? "Local event"
                          : `${event.source} import`}
                    </Pill>
                  </div>
                  <p className="ops-small muted">
                    {event.allDay
                      ? `${humanDate(event.start.slice(0, 10))} · All day`
                      : humanTime(event.start)}
                    {!event.allDay && event.end
                      ? ` – ${new Date(event.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                      : ""}
                  </p>
                  {event.location && (
                    <p className="ops-small">{event.location}</p>
                  )}
                  {event.description && (
                    <p className="ops-small ops-note">{event.description}</p>
                  )}
                  {event.jobId && (
                    <button
                      className="ops-text-button"
                      onClick={() => onNavigate("jobs")}
                    >
                      {jobName(state, event.jobId)} <ExternalLink size={13} />
                    </button>
                  )}
                  <div className="ops-record-actions">
                    <button
                      className="btn"
                      onClick={() => {
                        setError("");
                        setDraft({
                          ...event,
                          start: event.allDay
                            ? event.start.slice(0, 10)
                            : asLocal(event.start),
                          end: event.end
                            ? event.allDay
                              ? event.end.slice(0, 10)
                              : asLocal(event.end)
                            : "",
                          description: event.description || "",
                          location: event.location || "",
                        });
                      }}
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <a
                      className="btn"
                      href={`/api/integrations/calendar/export?id=${encodeURIComponent(event.id)}`}
                      download
                    >
                      <Download size={14} /> .ics
                    </a>
                    <IconButton
                      title={`Delete ${event.title}`}
                      onClick={() =>
                        removeRecord(
                          onDelete,
                          "calendarEvents",
                          event,
                          event.title,
                          toast,
                          setError,
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      {!!events.length && (
        <div className="ops-export-row">
          <a className="btn" href="/api/integrations/calendar/export" download>
            <Download size={16} /> Export all events (.ics)
          </a>
          <span className="muted ops-small">
            Open the file in a calendar app that supports importing events.
          </span>
        </div>
      )}
    </div>
  );
}

export function FollowupsView({ state, toast, onNavigate }) {
  const statusPath = "/api/integrations/status",
    previewPath = "/api/integrations/followups/preview",
    logPath = "/api/integrations/delivery-log";
  const { data, error, loading, refresh } = useIntegrationData([
    statusPath,
    previewPath,
    logPath,
  ]);
  const sms = data[statusPath]?.sms,
    preview = data[previewPath],
    entries = (data[logPath]?.entries || [])
      .filter((e) => e.channel === "sms")
      .slice(0, 10);
  const recipient =
    preview?.recipient ||
    sms?.recipient ||
    state.settings?.followupRecipient ||
    "Max";
  const phone =
    recipient === "Daniel"
      ? state.settings?.danielPhone
      : state.settings?.maxPhone;
  const message = preview?.message || "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast?.("Follow-up copied.");
    } catch {
      toast?.("Copy is unavailable here. Select the preview text and copy it.");
    }
  }
  const enabled = Boolean(
    sms?.enabled &&
    !sms?.paused &&
    sms?.credentialsConfigured &&
    sms?.recipientConfigured,
  );
  return (
    <div className="ops-view stack">
      <Heading
        eyebrow="GET THE MISSING DETAILS"
        title="Close the gaps before the job."
        description="Prepare specific follow-ups from the job details you have, and the details you still need."
      >
        <button className="btn" disabled={loading} onClick={refresh}>
          <RefreshCw size={16} /> Refresh
        </button>
        <button
          className="btn btn-primary"
          onClick={() => onNavigate("settings")}
        >
          Configure automation
        </button>
      </Heading>
      <ErrorMessage message={error} />
      <div className="ops-stats">
        <Stat
          label="Recipient"
          value={recipient}
          detail={
            preview?.phoneConfigured
              ? "Recipient number configured"
              : "Add a recipient number in Settings"
          }
        />
        <Stat
          label="Automatic texts"
          value={loading ? "Checking…" : enabled ? "Enabled" : "Not active"}
          detail={
            !sms
              ? "Status unavailable"
              : sms.paused
                ? "Paused in Settings"
                : !sms.credentialsConfigured
                  ? "SMS provider is not configured"
                  : !sms.recipientConfigured
                    ? "Recipient number is missing"
                    : sms.enabled
                      ? "Scheduled server delivery"
                      : "Enable in Settings"
          }
        />
        <Stat
          label="Scheduled check"
          value={sms?.scheduledTime || "Not available"}
          detail={
            sms?.timezone || state.settings?.timezone || "America/Toronto"
          }
        />
      </div>
      <div className="ops-callout">
        <MessageSquare size={22} />
        <div>
          <strong>Automatic sending runs on the app’s server.</strong>
          <p>
            It needs a configured SMS provider, a confirmed recipient number,
            and automation enabled in Settings. TimeTree is not live-connected.
            Imported job details older than 24 hours are excluded from automatic
            texts until reimported or explicitly checked against the team
            calendar.
          </p>
        </div>
      </div>
      {loading && !preview ? (
        <div className="card ops-panel" role="status">
          Checking follow-up rules…
        </div>
      ) : (
        preview && (
          <>
            <section className="card ops-panel">
              <div className="ops-section-title">
                <h3>Message preview for {recipient}</h3>
                <Pill tone={preview.eligible ? "good" : "neutral"}>
                  {preview.eligible
                    ? "Eligible for scheduled sending"
                    : "No automatic send queued here"}
                </Pill>
              </div>
              {message ? (
                <>
                  <p className="ops-message-preview">{message}</p>
                  <div className="ops-record-actions">
                    <button className="btn" onClick={copy}>
                      <Copy size={15} /> Copy message
                    </button>
                    {phone && (
                      <a
                        className="btn"
                        href={`sms:${phone.replace(/[^+\d]/g, "")}&body=${encodeURIComponent(message)}`}
                      >
                        <MessageSquare size={15} /> Open SMS draft
                      </a>
                    )}
                  </div>
                  <p className="ops-footnote">
                    Opening an SMS draft lets you review and send it yourself.
                    Scheduled sending uses the separate automation settings.
                  </p>
                </>
              ) : (
                <p className="muted">
                  There are no missing-detail messages to prepare from the
                  current job records.
                </p>
              )}
              {!!preview.blockers?.length && (
                <div className="ops-blockers">
                  <strong>Before automatic delivery</strong>
                  <ul>
                    {preview.blockers.map((b, i) => (
                      <li key={i}>
                        {typeof b === "string"
                          ? b
                          : b.message || b.label || "Configuration required"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.todayAttempted && (
                <p className="ops-small muted">
                  The scheduler has already attempted today’s follow-up. See the
                  delivery log for the result.
                </p>
              )}
            </section>
            <section className="card ops-panel">
              <div className="ops-section-title">
                <h3>Job detail checks</h3>
                <button
                  className="ops-text-button"
                  onClick={() => onNavigate("jobs")}
                >
                  Open jobs <ArrowRight size={14} />
                </button>
              </div>
              {!preview.jobs?.length ? (
                <p className="muted">
                  No upcoming job gaps to show. Add jobs or import your team
                  calendar to build the handoff.
                </p>
              ) : (
                <div className="ops-gap-list">
                  {preview.jobs.map((job) => (
                    <div key={job.id}>
                      <div className="ops-card-top">
                        <strong>{job.title}</strong>
                        <span className="muted ops-small">
                          {humanDate(job.date)}
                        </span>
                      </div>
                      <div className="ops-gap-tags">
                        {(job.missing || []).map((gap) => (
                          <Pill key={gap.field} tone="warning">
                            {gap.label}
                          </Pill>
                        ))}
                        {!job.missing?.length && (
                          <Pill tone="good">Required details recorded</Pill>
                        )}
                        {job.suppressed && (
                          <Pill>Suppressed from messaging</Pill>
                        )}
                        {job.stale && (
                          <Pill tone="warning">
                            Refresh team details before auto-texting
                          </Pill>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )
      )}
      <section className="card ops-panel">
        <h3>Text delivery history</h3>
        {!entries.length ? (
          <p className="muted">
            No SMS delivery attempts recorded. A preview is not a sent message.
          </p>
        ) : (
          <div className="ops-compact-list">
            {entries.map((entry) => (
              <div key={entry.id}>
                <span>
                  <strong>{entry.status}</strong>
                  <small>{entry.detail || "No additional detail"}</small>
                </span>
                <span className="ops-small muted">
                  {humanTime(entry.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="ops-footnote">
          Provider acceptance does not prove that a message was read.
        </p>
      </section>
    </div>
  );
}

export function RemindersView({ state, onSave, onDelete, toast, onNavigate }) {
  const [draft, setDraft] = useState(null),
    [filter, setFilter] = useState("pending");
  const { busy, error, setError, save } = useSave(onSave, toast);
  const delivery = useIntegrationData(["/api/integrations/delivery-log"]);
  const attempts = (
    delivery.data["/api/integrations/delivery-log"]?.entries || []
  )
    .filter((entry) => entry.channel === "push")
    .slice(0, 5);
  const reminders = [...(state.reminders || [])].sort((a, b) =>
    (a.dueAt || "z").localeCompare(b.dueAt || "z"),
  );
  const shown = reminders.filter(
    (r) => filter === "all" || r.status === filter,
  );
  const fresh = () => {
    setError("");
    setDraft({
      id: uid(),
      title: "",
      body: "",
      dueAt: "",
      expiresAt: "",
      status: "pending",
      jobId: "",
    });
  };
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <div className="ops-view stack">
      <Heading
        eyebrow="THE RIGHT NUDGE"
        title="Remember it when it matters."
        description="Schedule useful reminders with the job details already attached."
      >
        <button className="btn btn-primary" onClick={fresh}>
          <Plus size={17} /> Add reminder
        </button>
      </Heading>
      <section className="card stack">
        <div className="ops-card-top">
          <h3>Notification delivery</h3>
          <button
            className="btn"
            onClick={delivery.refresh}
            disabled={delivery.loading}
          >
            Refresh delivery status
          </button>
        </div>
        <p className="muted">
          Device registration does not confirm delivery. A failed attempt can
          leave a reminder Pending; check its result here before rescheduling.
        </p>
        {delivery.error && (
          <p role="alert" className="error">
            {delivery.error}
          </p>
        )}
        {!delivery.loading && !delivery.error && !attempts.length && (
          <p>No notification attempts recorded yet.</p>
        )}
        {attempts.map((entry) => (
          <div key={entry.id}>
            <strong>
              {state.reminders.find(
                (reminder) => reminder.id === entry.sourceId,
              )?.title || "Reminder"}{" "}
              ·{" "}
              {entry.status === "accepted"
                ? "Push service accepted"
                : entry.status}
            </strong>
            <p className="muted ops-small">{humanTime(entry.createdAt)}</p>
            <p>{entry.detail}</p>
          </div>
        ))}
      </section>
      <div className="ops-callout">
        <Bell size={21} />
        <div>
          <strong>Phone notifications need a connected device.</strong>
          <p>
            On iPhone, install this app on your Home Screen and enable
            notifications from Settings. The hosted server must remain running
            for scheduled delivery.
          </p>
          <button
            className="ops-text-button"
            onClick={() => onNavigate("settings")}
          >
            Set up notifications <ArrowRight size={14} />
          </button>
        </div>
      </div>
      <ErrorMessage message={error} />
      {draft && (
        <form
          className="card ops-editor"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              draft.expiresAt &&
              draft.dueAt &&
              draft.expiresAt <= draft.dueAt
            ) {
              setError("Expiry must be after the scheduled reminder time.");
              return;
            }
            save(
              "reminders",
              {
                ...draft,
                title: draft.title.trim(),
                dueAt: asISO(draft.dueAt),
                expiresAt: asISO(draft.expiresAt),
              },
              () => setDraft(null),
            );
          }}
        >
          <h3>{draft.version ? "Edit reminder" : "New reminder"}</h3>
          {draft.sourceType && (
            <p className="ops-small muted">
              This reminder came from{" "}
              {draft.sourceType === "dailySheet" ||
              draft.sourceType === "daily-sheet"
                ? "a Daily Sheet"
                : draft.sourceType}
              . Updating the source may update this reminder.
            </p>
          )}
          <div className="form-grid">
            <Field label="Reminder title" wide>
              <input
                required
                autoFocus
                value={draft.title}
                onChange={(e) => change("title", e.target.value)}
                placeholder="What do you need to remember?"
              />
            </Field>
            <Field label="Useful details" wide>
              <textarea
                rows="4"
                value={draft.body || ""}
                onChange={(e) => change("body", e.target.value)}
                placeholder="Exact material, quantity, pickup location, or next step…"
              />
            </Field>
            <Field label="Job">
              <JobSelect
                state={state}
                value={draft.jobId}
                onChange={(v) => change("jobId", v)}
              />
            </Field>
            <Field
              label="Remind me at"
              hint="Leave blank to save an unscheduled reminder."
            >
              <input
                type="datetime-local"
                value={draft.dueAt}
                onChange={(e) => change("dueAt", e.target.value)}
              />
            </Field>
            <Field
              label="Expires at (optional)"
              hint="Do not deliver after this time."
            >
              <input
                type="datetime-local"
                value={draft.expiresAt}
                onChange={(e) => change("expiresAt", e.target.value)}
              />
            </Field>
          </div>
          <FormActions
            busy={busy}
            onCancel={() => setDraft(null)}
            label="Save reminder"
          />
        </form>
      )}
      <div className="ops-filter-tabs" aria-label="Filter reminders">
        {[
          ["pending", "Pending"],
          ["sent", "Sent"],
          ["cancelled", "Cancelled"],
          ["all", "All"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "is-active" : ""}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {!shown.length ? (
        <EmptyState
          icon={Bell}
          title={
            reminders.length
              ? "No reminders in this view."
              : "Let tomorrow start prepared."
          }
        >
          {reminders.length
            ? "Choose another filter to see other reminders."
            : "Add a reminder, or schedule tomorrow’s needs from your Daily Sheet. Include enough detail to act without searching."}
        </EmptyState>
      ) : (
        <div className="ops-list">
          {shown.map((reminder) => (
            <article className="card ops-reminder" key={reminder.id}>
              <div className="ops-card-top">
                <div>
                  <p className="ops-eyebrow">
                    {reminder.dueAt
                      ? humanTime(reminder.dueAt)
                      : "Not scheduled"}
                  </p>
                  <h3>{reminder.title}</h3>
                </div>
                <Pill
                  tone={
                    reminder.status === "sent"
                      ? "good"
                      : reminder.status === "pending" && reminder.dueAt
                        ? "warning"
                        : "neutral"
                  }
                >
                  {reminder.status === "sent"
                    ? "Push service accepted"
                    : reminder.status === "pending"
                      ? reminder.dueAt
                        ? "Pending"
                        : "Unscheduled"
                      : reminder.status}
                </Pill>
              </div>
              {reminder.body && <p className="ops-note">{reminder.body}</p>}
              <p className="muted ops-small">
                {jobName(state, reminder.jobId)}
                {reminder.sourceType ? " · Generated from a linked record" : ""}
                {reminder.expiresAt
                  ? ` · Expires ${humanTime(reminder.expiresAt)}`
                  : ""}
              </p>
              <div className="ops-record-actions">
                {reminder.sourceType === "dailySheet" && (
                  <button className="btn" onClick={() => onNavigate("daily")}>
                    <Edit3 size={15} /> Edit linked Daily Sheet
                  </button>
                )}
                {reminder.status === "pending" &&
                  reminder.sourceType !== "dailySheet" && (
                    <>
                      <button
                        className="btn"
                        onClick={() => {
                          setError("");
                          setDraft({
                            ...reminder,
                            dueAt: asLocal(reminder.dueAt),
                            expiresAt: asLocal(reminder.expiresAt),
                          });
                        }}
                      >
                        <Edit3 size={15} /> Edit
                      </button>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          save("reminders", {
                            ...reminder,
                            status: "cancelled",
                          })
                        }
                      >
                        Cancel reminder
                      </button>
                    </>
                  )}
                {reminder.status !== "pending" && (
                  <button
                    className="btn"
                    onClick={() => {
                      setError("");
                      setDraft({
                        id: uid(),
                        title: reminder.title,
                        body: reminder.body || "",
                        dueAt: "",
                        expiresAt: "",
                        status: "pending",
                        jobId: reminder.jobId || "",
                      });
                    }}
                  >
                    Create another
                  </button>
                )}
                {reminder.sourceType !== "dailySheet" && (
                  <IconButton
                    title={`Delete ${reminder.title}`}
                    onClick={() =>
                      removeRecord(
                        onDelete,
                        "reminders",
                        reminder,
                        reminder.title,
                        toast,
                        setError,
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </IconButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="ops-footnote">
        “Push service accepted” records the service response. Device receipt
        depends on connection and notification settings.
      </p>
    </div>
  );
}
