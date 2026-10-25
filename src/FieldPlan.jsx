import React, { useEffect, useState } from "react";
import { Button, Card, Field, Badge, Empty, SectionHead } from "./ui.jsx";
import { PHASES, phaseLabel } from "../shared/field-work.js";
import { jobGaps, jobGapLabel, materialTotals } from "../shared/domain.js";
import "./field-plan.css";
import MaterialPlanner from "./MaterialPlanner.jsx";

export default function FieldPlan({
  state,
  onSave,
  onNavigate,
  initialJobId = "",
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: state.settings.timezone || "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const rank = (j) => (j.date >= today ? 0 : !j.date ? 1 : 2);
  const jobs = state.jobs
    .filter((j) => j.bookingStatus !== "cancelled")
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (rank(a) === 2
          ? b.date.localeCompare(a.date)
          : (a.date || "").localeCompare(b.date || "")),
    );
  const [selected, setSelected] = useState(
    jobs.some((j) => j.id === initialJobId) ? initialJobId : jobs[0]?.id || "",
  );
  const job = jobs.find((j) => j.id === selected);
  return (
    <div className="stack page-enter">
      <SectionHead
        eyebrow="PLAN → DO → HAND OVER"
        title="Field plan"
        description="One target, clear responsibilities, and a next step the crew can follow."
      />
      <Field label="Plan for job">
        <select
          value={selected}
          onChange={(e) => {
            if (
              window.dispatchEvent(
                new Event("hardbond:before-navigate", { cancelable: true }),
              )
            )
              setSelected(e.target.value);
          }}
        >
          <option value="">Choose a job</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
              {j.date ? ` · ${j.date}` : " · Unscheduled"}
            </option>
          ))}
        </select>
      </Field>
      {job ? (
        <JobPlan
          key={job.id}
          job={job}
          state={state}
          onSave={onSave}
          onNavigate={onNavigate}
        />
      ) : (
        <Empty
          title="Start with a real job"
          action={<Button onClick={() => onNavigate("jobs")}>Open Jobs</Button>}
        >
          Your field plan uses existing job details, material requirements and
          daily records.
        </Empty>
      )}
      <ReferenceNotes />
    </div>
  );
}

function JobPlan({ job, state, onSave, onNavigate }) {
  const [draft, setDraft] = useState(job);
  const [phase, setPhase] = useState("setup");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [openPhase, setOpenPhase] = useState(
    (job.fieldPlan || []).find((p) => p.status !== "complete")?.id ||
      job.fieldPlan?.[0]?.id ||
      "",
  );
  useEffect(() => {
    if (!dirty) return;
    const guard = (e) => {
      if (
        !window.confirm(
          "You have unsaved field-plan changes. Leave without saving?",
        )
      )
        e.preventDefault();
    };
    const unload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("hardbond:before-navigate", guard);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("hardbond:before-navigate", guard);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty]);
  const rows = draft.fieldPlan || [];
  const gaps = jobGaps(job);
  const last = state.dailySheets
    .filter((s) => s.jobId === job.id)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.updatedAt || "").localeCompare(a.updatedAt || ""),
    )[0];
  const update = (id, changes) => {
    setDirty(true);
    setMessage("");
    setDraft((d) => ({
      ...d,
      fieldPlan: (d.fieldPlan || []).map((r) =>
        r.id === id ? { ...r, ...changes } : r,
      ),
    }));
  };
  const shortages = Object.entries(materialTotals(job.materials || []))
    .map(([inventoryId, quantity]) => ({
      inventoryId,
      quantity,
      item: state.inventory.find((i) => i.id === inventoryId),
    }))
    .filter((m) => m.item?.quantity == null || m.item.quantity < m.quantity);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await onSave("jobs", draft);
      setDraft(result);
      setDirty(false);
      setMessage(
        result._queued
          ? "Saved on this device; waiting to sync."
          : "Field plan saved.",
      );
    } catch (e) {
      setMessage(e.message || "Could not save. Your edits remain here.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Card className="field-plan-summary">
        <h2>{job.title}</h2>
        <p>
          {job.address || "Address not recorded"} ·{" "}
          {job.crew || "Crew not confirmed"}
        </p>
        {gaps.length > 0 && (
          <p>
            <strong>Confirm before mobilizing:</strong>{" "}
            {gaps.map(jobGapLabel).join(", ")}.{" "}
            <Button onClick={() => onNavigate("jobs")}>Job details</Button>
          </p>
        )}
        {shortages.length > 0 && (
          <p>
            <strong>Material gaps:</strong>{" "}
            {shortages
              .map(
                (m) =>
                  `${m.item?.name || "Missing inventory item"}: ${m.item?.quantity == null ? "stock unknown" : `${m.quantity - m.item.quantity} ${m.item.unit || "units"} short`}`,
              )
              .join("; ")}
          </p>
        )}
        {!job.materials?.length && (
          <p>Material requirements have not been listed.</p>
        )}
        <div className="field-plan-buttons">
          <Button onClick={() => onNavigate("load")}>
            Physical load check
          </Button>
          <Button onClick={() => onNavigate("daily", { jobId: job.id })}>
            Record today’s work
          </Button>
        </div>
        <small>
          Stock comparison uses recorded counts before other jobs’ demand.
          Aidan’s physical load check remains separate.
        </small>
      </Card>
      {last && (
        <Card className="field-plan-summary">
          <Badge>
            {last.status === "reviewed"
              ? "Reviewed handover"
              : "Draft handover · not reviewed"}{" "}
            · {last.date}
          </Badge>
          <h3>Pick up where you left off</h3>
          <p className="field-plan-note">
            {last.tomorrowNeeds || "No next-day needs recorded."}
          </p>
          {last.issues && (
            <p className="field-plan-note">
              <strong>Unresolved notes:</strong> {last.issues}
            </p>
          )}
        </Card>
      )}
      <form className="stack" onSubmit={save}>
        <MaterialPlanner
          inventory={state.inventory}
          materials={draft.materials || []}
          estimates={draft.materialEstimates || []}
          onNavigate={onNavigate}
          onApply={(materials, materialEstimates) => {
            setDirty(true);
            setDraft((d) => ({ ...d, materials, materialEstimates }));
          }}
        />
        <Card className="field-plan-summary">
          <h2>Work sequence</h2>
          <p>
            Add only the phases this job needs, in the order specified for its
            system. Prompts are starting points for your review.
          </p>
          <div className="field-plan-add">
            <Field label="Phase to add">
              <select value={phase} onChange={(e) => setPhase(e.target.value)}>
                {Object.entries(PHASES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              type="button"
              disabled={rows.length >= 50 || busy}
              onClick={() => {
                const newId = crypto.randomUUID();
                setOpenPhase(newId);
                setDirty(true);
                setDraft((d) => ({
                  ...d,
                  fieldPlan: [
                    ...(d.fieldPlan || []),
                    {
                      id: newId,
                      phase,
                      owner: "",
                      target: "",
                      equipment: "",
                      prerequisite: "",
                      source: "",
                      status: "planned",
                      handover: "",
                      checks: PHASES[phase].checks.map((label) => ({
                        label,
                        status: "unconfirmed",
                      })),
                    },
                  ],
                }));
              }}
            >
              Add phase
            </Button>
          </div>
        </Card>
        {rows.map((row, index) => (
          <details
            className="card field-plan-summary field-phase"
            key={row.id}
            open={openPhase === row.id}
          >
            <summary
              onClick={(e) => {
                e.preventDefault();
                setOpenPhase(openPhase === row.id ? "" : row.id);
              }}
            >
              <span>
                {index + 1}. {phaseLabel(row.phase)}
                <small>
                  {row.owner || "Assign an owner"}
                  {row.target ? ` · ${row.target}` : ""}
                </small>
              </span>
              <Badge
                tone={
                  row.status === "held" ||
                  (row.status === "complete" &&
                    row.checks.some((c) => c.status === "unconfirmed"))
                    ? "warning"
                    : row.status === "complete"
                      ? "success"
                      : "neutral"
                }
              >
                {row.status === "held"
                  ? "On hold"
                  : row.status === "complete" &&
                      row.checks.some((c) => c.status === "unconfirmed")
                    ? "Complete · checks pending"
                    : row.status}
              </Badge>
            </summary>
            <p className="muted">
              Role prompts: {PHASES[row.phase]?.roles}. Assign actual people
              below.
            </p>
            <div className="form-grid">
              <Field label={`Responsible person · phase ${index + 1}`}>
                <input
                  maxLength={300}
                  value={row.owner}
                  onChange={(e) => update(row.id, { owner: e.target.value })}
                  placeholder="Who owns the result?"
                />
              </Field>
              <Field label={`Status · phase ${index + 1}`}>
                <select
                  value={row.status}
                  onChange={(e) => update(row.id, { status: e.target.value })}
                >
                  <option value="planned">Planned</option>
                  <option value="working">Working</option>
                  <option value="held">On hold</option>
                  <option value="complete">Complete</option>
                </select>
              </Field>
              <Field label={`Target and crew assignments · phase ${index + 1}`}>
                <textarea
                  maxLength={2000}
                  value={row.target}
                  onChange={(e) => update(row.id, { target: e.target.value })}
                  placeholder="Area / zone, result, each person’s first task"
                />
              </Field>
              <Field label={`Equipment and materials · phase ${index + 1}`}>
                <textarea
                  maxLength={2000}
                  value={row.equipment}
                  onChange={(e) =>
                    update(row.id, { equipment: e.target.value })
                  }
                  placeholder="Grinder, tooling, extraction, clean buckets, exact products"
                />
              </Field>
              <Field label={`Must happen first · phase ${index + 1}`}>
                <textarea
                  maxLength={2000}
                  value={row.prerequisite}
                  onChange={(e) =>
                    update(row.id, { prerequisite: e.target.value })
                  }
                  placeholder="Previous phase, access, repairs, cure or technical decision"
                />
              </Field>
              <Field
                label={`Technical source and acceptance criteria · phase ${index + 1}`}
              >
                <textarea
                  maxLength={2000}
                  value={row.source}
                  onChange={(e) => update(row.id, { source: e.target.value })}
                  placeholder="Exact product, TDS/SDS revision or URL, requirements, date checked"
                />
              </Field>
            </div>
            <fieldset className="field-plan-checks">
              <legend>Phase checks</legend>
              {row.checks.map((check, i) => (
                <Field key={i} label={check.label}>
                  <select
                    value={check.status}
                    onChange={(e) =>
                      update(row.id, {
                        checks: row.checks.map((c, n) =>
                          n === i ? { ...c, status: e.target.value } : c,
                        ),
                      })
                    }
                  >
                    <option value="unconfirmed">Not confirmed</option>
                    <option value="checked">Checked by crew</option>
                    <option value="not-applicable">
                      Not applicable to this phase
                    </option>
                  </select>
                </Field>
              ))}
            </fieldset>
            {row.status === "complete" &&
              row.checks.some((c) => c.status === "unconfirmed") && (
                <p role="status">
                  This phase is marked complete with unconfirmed checks. Resolve
                  or document these before releasing the next phase.
                </p>
              )}
            <Field label={`Handover / hold reason · phase ${index + 1}`}>
              <textarea
                maxLength={3000}
                value={row.handover}
                onChange={(e) => update(row.id, { handover: e.target.value })}
                placeholder="What remains, who will handle it, and when the next phase may start"
              />
            </Field>
            <div className="field-plan-buttons">
              <Button
                type="button"
                disabled={index === 0 || busy}
                onClick={() => {
                  const next = [...rows];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  setDirty(true);
                  setDraft({ ...draft, fieldPlan: next });
                }}
              >
                Move earlier
              </Button>
              <Button
                type="button"
                kind="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Remove this phase from the plan?")) {
                    setDirty(true);
                    setDraft({
                      ...draft,
                      fieldPlan: rows.filter((r) => r.id !== row.id),
                    });
                  }
                }}
              >
                Remove phase
              </Button>
            </div>
          </details>
        ))}
        <div className="field-plan-save">
          <Button type="submit" kind="primary" disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save field plan"}
          </Button>
          <span role="status">
            {message ||
              (dirty
                ? "Unsaved changes — save before leaving this job."
                : "Plan changes stay separate from inventory consumption.")}
          </span>
        </div>
      </form>
    </>
  );
}

function ReferenceNotes() {
  return (
    <Card className="field-plan-summary">
      <details>
        <summary>Field reference · lessons from your work history</summary>
        <div className="stack">
          <p>
            These notes came from your October 2026 handoff. Confirm the current
            system and site conditions before using a past method.
          </p>
          <h3>Keep the next phase moving</h3>
          <ul>
            <li>
              Stage materials and clean buckets before mixing. Match batch size
              to actual placement speed and the specified pot life.
            </li>
            <li>
              Split main-floor work, edges, extraction and defect marking so
              workers do not wait for one tool.
            </li>
            <li>
              For wall-and-floor jobs, plan transitions and access before
              choosing walls first. Protect completed work.
            </li>
            <li>
              Record next-day needs, unfinished repairs and equipment problems
              before leaving.
            </li>
          </ul>
          <h3>Products to identify before estimating</h3>
          <p>
            LABPOX MVB Fast Cure, LABPOX 85 Platinum, LABPOX S85, Technopol
            PU-3060, Geodesmo-50, Hyperdesmo, Ardex Feather Finish, and the
            product recorded as “Labfender polyurethane” appeared in your
            history. Exact versions, current TDS/SDS, kit sizes, coverage,
            permitted substrates and recoat windows still need confirmation.
          </p>
          <h3>Past problems worth remembering</h3>
          <ul>
            <li>
              Lighter rolled areas and metallic marks need diagnosis: record
              thickness, technique, mixing, conditions and when the defect
              appeared before selecting a repair.
            </li>
            <li>
              Opened or leftover primer needs storage, shelf-life and
              compatibility checks.
            </li>
            <li>
              Exposed reinforcement needs a suitable repair assessment before a
              coating decision.
            </li>
            <li>
              Do not turn a historical grit sequence, pressure rating or cure
              observation into a universal instruction.
            </li>
          </ul>
          <p className="muted">
            Historical equipment and crew names are not current availability.
            Jobber, TimeTree, WhatsApp and other systems are not connected by
            these notes.
          </p>
        </div>
      </details>
    </Card>
  );
}
