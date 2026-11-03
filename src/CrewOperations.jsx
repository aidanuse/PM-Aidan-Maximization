import React, { useState, useEffect } from "react";
import { Button, Card, Field, Badge, SectionHead } from "./ui.jsx";
import library from "../shared/task-library.json";
import trailerMap from "../shared/trailer-map.json";
import {
  PRESETS,
  TRAILER_CHECKS,
  clearance,
  rowProblems,
  renderBrief,
  containsMoney,
  morningStatus,
} from "../shared/crew.js";
import "./crew.css";
const uid = () => crypto.randomUUID();
const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const levels = ["NOT ASSESSED", "SOLO", "ASSIST", "NEVER"];
const freshTask = (cardId, jobId = "") => ({
  id: uid(),
  cardId,
  jobId,
  supervisorId: "",
  supervisionConfirmed: false,
  detail: "",
  result: "pending",
  note: "",
});
function Text({ label, value, onChange, area = false, ...rest }) {
  return (
    <Field label={label}>
      {area ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      ) : (
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </Field>
  );
}
function Select({ label, value, onChange, children }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </Field>
  );
}
function Tick({ label, checked, onChange }) {
  return (
    <label className="crew-tick">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function CrewMorning({ state, onNavigate, date }) {
  const issues = morningStatus(
    {
      ...state,
      workers: state.workers || [],
      taskCards: state.taskCards || [],
    },
    date,
  );
  return (
    <Card className="field-plan-summary">
      <h2>Crew readiness</h2>
      {issues.length ? (
        <ul>
          {issues.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      ) : (
        <p>
          All crew confirmations recorded. Check site conditions and job
          readiness before departure.
        </p>
      )}
      <Button onClick={() => onNavigate("crew")}>Open crew plan</Button>
    </Card>
  );
}
export default function CrewOperations({ state, onSave, onNavigate }) {
  const [tab, setTab] = useState("day"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false);
  const data = {
    ...state,
    workers: state.workers || [],
    taskCards: state.taskCards || [],
    crewDays: state.crewDays || [],
    trailerChecks: state.trailerChecks || [],
  };
  useEffect(() => {
    if (!dirty) return;
    const guard = (e) => {
      if (!window.confirm("Leave unsaved crew changes?")) e.preventDefault();
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
  async function save(collection, record) {
    setBusy(true);
    setMessage("");
    try {
      const saved = await onSave(collection, record);
      setDirty(false);
      setMessage(
        saved._queued
          ? "Saved on this device; sync before sharing or confirming briefs."
          : "Saved.",
      );
      return saved;
    } catch (e) {
      setMessage(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const props = { state: data, save, busy, setDirty, onNavigate };
  return (
    <div className="stack page-enter crew-view">
      <SectionHead
        eyebrow="PLAN · CONFIRM · FINISH"
        title="Crew & routine"
        description="One personal brief per worker, with approved instructions and a permanent task record."
      />
      <div className="crew-tabs">
        {[
          ["day", "Day plan"],
          ["workers", "Workers"],
          ["cards", "Task cards"],
          ["trailer", "Trailer checks"],
          ["history", "History"],
          ["guide", "How to use"],
        ].map(([id, label]) => (
          <Button
            key={id}
            kind={tab === id ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => {
              if (dirty && !window.confirm("Leave unsaved changes?")) return;
              setDirty(false);
              setMessage("");
              setTab(id);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
      {dirty && <p className="muted">Unsaved changes — save before leaving.</p>}
      {tab === "day" && <DayPlan {...props} />}
      {tab === "workers" && <Workers {...props} />}
      {tab === "cards" && <Cards {...props} />}
      {tab === "trailer" && <Trailer {...props} />}
      {tab === "history" && <History state={data} />}{" "}
      {tab === "guide" && <Guide onNavigate={onNavigate} />}
    </div>
  );
}
function Cards({ state, save, busy, setDirty }) {
  const [selected, setSelected] = useState(""),
    [draft, setDraft] = useState(null),
    [review, setReview] = useState(false),
    [seeding, setSeeding] = useState(false);
  const cards = state.taskCards;
  const missing = library.filter((c) => !cards.some((x) => x.id === c.id));
  const change = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
    setReview(false);
  };
  return (
    <>
      <Card className="field-plan-summary">
        <h2>Task instructions</h2>
        <p>
          35 source cards are available. B1 retains its owner-FINAL source
          label; every card still needs an operational review before sharing.
          Trailer locations are proposed until physically checked. Verify
          product limits, cure times, dust controls, electrical setup and PPE
          against the actual system.
        </p>
        {!!missing.length && (
          <Button
            disabled={busy || seeding}
            onClick={async () => {
              setSeeding(true);
              try {
                for (const card of missing) {
                  if (!(await save("taskCards", card))) break;
                }
              } finally {
                setSeeding(false);
              }
            }}
          >
            {seeding ? "Loading cards…" : `Load ${missing.length} source cards`}
          </Button>
        )}
        <Select
          label="Choose task card"
          value={selected}
          onChange={(id) => {
            if (
              draft &&
              !window.confirm("Switch cards? Unsaved edits will be lost.")
            )
              return;
            setSelected(id);
            setDraft(cards.find((c) => c.id === id) || null);
            setReview(false);
            setDirty(false);
          }}
        >
          <option value="">Choose a card</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} · {c.title} · {c.approved ? "Approved" : "Needs review"}
            </option>
          ))}
        </Select>
      </Card>
      {draft && (
        <form
          className="card field-plan-summary stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await save("taskCards", {
              ...draft,
              approved: review ? true : draft.approved,
            });
            if (result) {
              setDraft(result);
              setReview(false);
            }
          }}
        >
          <Badge>
            {draft.sourceStatus} · revision {draft.revision}
          </Badge>
          <Text
            label="Card title"
            value={draft.title}
            onChange={(v) => change("title", v)}
            required
            maxLength={300}
          />
          <Select
            label="Task restriction"
            value={draft.restriction}
            onChange={(v) => change("restriction", v)}
          >
            {["trained", "experienced", "lead"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
          <Text
            label="Complete task instructions"
            area
            rows={22}
            value={draft.instructions}
            onChange={(v) => change("instructions", v)}
            required
            maxLength={20000}
          />
          <p>
            Editing approved instructions removes approval. Save edits first,
            then review and approve that saved revision. Keep safety,
            stop-and-ask, completion and report-back instructions.
          </p>
          <Text
            label="Reviewed by"
            value={draft.reviewedBy}
            onChange={(v) => {
              setDraft((d) => ({ ...d, reviewedBy: v }));
              setDirty(true);
            }}
            maxLength={200}
          />
          <Tick
            label="I checked this saved revision against actual equipment, trailer locations and current product / safety requirements"
            checked={review}
            onChange={(v) => {
              setReview(v);
              setDirty(true);
            }}
          />
          <div className="crew-tabs">
            <Button
              type="submit"
              kind="primary"
              disabled={busy || (review && !draft.reviewedBy.trim())}
            >
              Save card
            </Button>
            {draft.approved && (
              <Button
                type="button"
                onClick={() => {
                  setDraft((d) => ({ ...d, approved: false }));
                  setReview(false);
                  setDirty(true);
                }}
              >
                Withdraw approval
              </Button>
            )}
          </div>
        </form>
      )}
    </>
  );
}
function Workers({ state, save, busy, setDirty }) {
  const [draft, setDraft] = useState(null);
  const change = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  return (
    <>
      <Card className="field-plan-summary">
        <h2>Worker roster</h2>
        <p>
          Add actual contacts and assessed clearances. Unknown stays unknown.
          Private coaching notes never appear in a worker brief.
        </p>
        <Button
          disabled={busy}
          onClick={() => {
            if (draft && !window.confirm("Discard current edits?")) return;
            setDraft({
              id: uid(),
              name: "",
              phone: "",
              role: "helper",
              active: true,
              availability: "",
              transport: "",
              notes: "",
              clearances: {},
            });
            setDirty(true);
          }}
        >
          Add worker
        </Button>
        {state.workers.map((w) => (
          <div className="row-between" key={w.id}>
            <span>
              {w.name} · {w.role}
              {!w.active ? " · inactive" : ""}
            </span>
            <Button
              disabled={busy}
              onClick={() => {
                if (draft && !window.confirm("Discard current edits?")) return;
                setDraft(w);
                setDirty(false);
              }}
            >
              Edit {w.name}
            </Button>
          </div>
        ))}
      </Card>
      {draft && (
        <form
          className="card stack field-plan-summary"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save("workers", draft)) setDraft(null);
          }}
        >
          <div className="form-grid">
            <Text
              label="Worker name"
              value={draft.name}
              onChange={(v) => change("name", v)}
              required
              maxLength={200}
            />
            <Text
              label="Phone / contact"
              value={draft.phone}
              onChange={(v) => change("phone", v)}
              maxLength={100}
            />
            <Select
              label="Worker role"
              value={draft.role}
              onChange={(v) => change("role", v)}
            >
              {["helper", "experienced", "lead"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Text
              label="Usual availability / qualifications to verify"
              area
              value={draft.availability}
              onChange={(v) => change("availability", v)}
              maxLength={2000}
            />
            <Text
              label="Usual transport arrangement"
              area
              value={draft.transport}
              onChange={(v) => change("transport", v)}
              maxLength={2000}
            />
            <Text
              label="Private factual coaching notes"
              area
              value={draft.notes}
              onChange={(v) => change("notes", v)}
              maxLength={3000}
            />
          </div>
          <Tick
            label="Active worker"
            checked={draft.active}
            onChange={(v) => change("active", v)}
          />
          <h3>Task clearances</h3>
          <p>
            SOLO = independently qualified; ASSIST = named qualified supervisor
            required; NEVER = blocked. No task is automatically granted by role.
          </p>
          <div className="form-grid">
            {state.taskCards.map((c) => (
              <Select
                key={c.id}
                label={`${c.id} · ${c.title}`}
                value={clearance(draft, c.id)}
                onChange={(v) =>
                  change("clearances", { ...draft.clearances, [c.id]: v })
                }
              >
                {levels.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            ))}
          </div>
          <Button type="submit" kind="primary" disabled={busy}>
            Save worker
          </Button>
        </form>
      )}
    </>
  );
}
function DayPlan({ state, save, busy, setDirty }) {
  const [date, setDate] = useState(localDate()),
    [draft, setDraft] = useState(null),
    [addWorker, setAddWorker] = useState(""),
    [preview, setPreview] = useState(""),
    [localMessage, setLocalMessage] = useState("");
  const savedDay = state.crewDays.find((d) => d.date === date);
  const day = draft ||
    savedDay || { id: `crew-${date}`, date, leadContact: "", crew: [] };
  const [edited, setEdited] = useState(false);
  const update = (next, structural = true) => {
    setDraft(
      structural
        ? {
            ...next,
            crew: next.crew.map((r) => ({
              ...r,
              status: "draft",
              brief: "",
              confirmedAt: "",
            })),
          }
        : next,
    );
    setEdited(true);
    setDirty(true);
    setPreview("");
  };
  const rowUpdate = (workerId, changes, structural = true) =>
    update(
      {
        ...day,
        crew: day.crew.map((r) =>
          r.workerId === workerId ? { ...r, ...changes } : r,
        ),
      },
      structural,
    );
  async function persist(next = day) {
    const result = await save("crewDays", next);
    if (result) {
      setDraft(result);
      setEdited(false);
    }
    return result;
  }
  async function status(row, value) {
    setLocalMessage("");
    const next = {
      ...day,
      crew: day.crew.map((r) =>
        r.workerId === row.workerId
          ? {
              ...r,
              status: value,
              brief: value === "sent" ? renderBrief(r, day, state) : r.brief,
            }
          : r,
      ),
    };
    const result = await persist(next);
    if (result?._queued)
      setLocalMessage(
        "This action is queued. Wait for sync and reload before treating it as sent or confirmed.",
      );
  }
  return (
    <>
      <Card className="field-plan-summary stack">
        <h2>One plan for the whole day</h2>
        <Text
          label="Crew plan date"
          type="date"
          value={date}
          onChange={(v) => {
            if (!v) return;
            if (edited && !window.confirm("Discard unsaved plan changes?"))
              return;
            setDate(v);
            setDraft(null);
            setEdited(false);
            setDirty(false);
            setPreview("");
          }}
        />
        <Text
          label="Lead name and contact number"
          value={day.leadContact}
          onChange={(v) => update({ ...day, leadContact: v })}
          maxLength={500}
        />
        <p>
          Changes to the plan reset confirmations. Save the plan before sharing.
          Availability and supervisor coverage are checked by you for this date
          and job.
        </p>
        <div className="crew-tabs">
          <Select
            label="Worker to add"
            value={addWorker}
            onChange={setAddWorker}
          >
            <option value="">Choose a worker</option>
            {state.workers
              .filter(
                (w) => w.active && !day.crew.some((r) => r.workerId === w.id),
              )
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </Select>
          <Button
            disabled={!addWorker || busy}
            onClick={() => {
              const w = state.workers.find((w) => w.id === addWorker);
              update({
                ...day,
                crew: [
                  ...day.crew,
                  {
                    workerId: w.id,
                    available: false,
                    callTime: "",
                    transport: w.transport,
                    instructions: "",
                    status: "draft",
                    brief: "",
                    confirmedAt: "",
                    tasks: [],
                  },
                ],
              });
              setAddWorker("");
            }}
          >
            Add to day
          </Button>
        </div>
        {!day.crew.length && (
          <p>Day plan not prepared: add workers and assignments.</p>
        )}
        <Button
          kind="primary"
          disabled={busy || !edited}
          onClick={() => persist()}
        >
          Save day plan
        </Button>
      </Card>
      {localMessage && <p role="status">{localMessage}</p>}
      {day.crew.map((row) => {
        const w = state.workers.find((w) => w.id === row.workerId);
        const problems = rowProblems(row, state, day);
        const brief = renderBrief(row, day, state);
        const money = containsMoney(brief);
        const stale = row.status !== "draft" && row.brief !== brief;
        return (
          <Card className="field-plan-summary stack" key={row.workerId}>
            <div className="row-between">
              <h2>{w?.name}</h2>
              <Badge
                tone={
                  row.status === "confirmed" && !stale ? "success" : "warning"
                }
              >
                {stale ? "Changed — resend" : row.status}
              </Badge>
            </div>
            <p>
              {w?.phone || "Contact not recorded"} ·{" "}
              {w?.availability || "Standing availability unknown"}
            </p>
            <Tick
              label={`Availability checked for ${w?.name}`}
              checked={row.available}
              onChange={(v) => rowUpdate(row.workerId, { available: v })}
            />
            <div className="form-grid">
              <Text
                label={`Arrival time · ${w?.name}`}
                type="time"
                value={row.callTime}
                onChange={(v) => rowUpdate(row.workerId, { callTime: v })}
              />
              <Text
                label={`Meet / transport · ${w?.name}`}
                value={row.transport}
                onChange={(v) => rowUpdate(row.workerId, { transport: v })}
                maxLength={2000}
              />
              <Text
                label={`PPE and day instructions · ${w?.name}`}
                area
                value={row.instructions}
                onChange={(v) => rowUpdate(row.workerId, { instructions: v })}
                maxLength={3000}
              />
            </div>
            <AssignmentAdder
              cards={state.taskCards}
              jobs={state.jobs}
              onAdd={(codes, jobId) =>
                rowUpdate(row.workerId, {
                  tasks: [
                    ...row.tasks,
                    ...codes.map((c) => freshTask(c, jobId)),
                  ],
                })
              }
            />
            {row.tasks.map((task, index) => {
              const card = state.taskCards.find((c) => c.id === task.cardId);
              const setTask = (changes, structural = true) =>
                rowUpdate(
                  row.workerId,
                  {
                    tasks: row.tasks.map((t) =>
                      t.id === task.id ? { ...t, ...changes } : t,
                    ),
                  },
                  structural,
                );
              return (
                <details className="crew-task" key={task.id} open>
                  <summary>
                    {index + 1}. {task.cardId} · {card?.title} · {task.result}
                  </summary>
                  <div className="stack">
                    <Select
                      label={`Job · assignment ${index + 1} · ${w?.name}`}
                      value={task.jobId}
                      onChange={(v) => setTask({ jobId: v })}
                    >
                      <option value="">Choose job</option>
                      {state.jobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.title}
                        </option>
                      ))}
                    </Select>
                    <Text
                      label={`Timing, area and travel · assignment ${index + 1} · ${w?.name}`}
                      value={task.detail}
                      onChange={(v) => setTask({ detail: v })}
                      maxLength={2000}
                    />
                    <p>
                      Clearance: {clearance(w, task.cardId)} · Card:{" "}
                      {card?.approved ? "Approved" : "Needs review"} ·
                      Restriction: {card?.restriction}
                    </p>
                    {clearance(w, task.cardId) === "ASSIST" && (
                      <>
                        <Select
                          label={`Supervisor · assignment ${index + 1} · ${w?.name}`}
                          value={task.supervisorId}
                          onChange={(v) =>
                            setTask({
                              supervisorId: v,
                              supervisionConfirmed: false,
                            })
                          }
                        >
                          <option value="">Choose supervisor</option>
                          {day.crew
                            .filter((r) => r.workerId !== row.workerId)
                            .map((r) => (
                              <option key={r.workerId} value={r.workerId}>
                                {
                                  state.workers.find((w) => w.id === r.workerId)
                                    ?.name
                                }
                              </option>
                            ))}
                        </Select>
                        <Tick
                          label={`Supervisor qualified and available at this job without conflicting duties · assignment ${index + 1}`}
                          checked={task.supervisionConfirmed}
                          onChange={(v) => setTask({ supervisionConfirmed: v })}
                        />
                      </>
                    )}
                    <Select
                      label={`Result · assignment ${index + 1} · ${w?.name}`}
                      value={task.result}
                      onChange={(v) => setTask({ result: v }, false)}
                    >
                      {[
                        ["pending", "Pending"],
                        ["done", "Done"],
                        ["partial", "Partial"],
                        ["not-done", "Not done"],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                    <Text
                      label={`Result note · assignment ${index + 1} · ${w?.name}`}
                      area
                      value={task.note}
                      onChange={(v) => setTask({ note: v }, false)}
                      maxLength={3000}
                    />
                    <div className="crew-tabs">
                      <Button
                        disabled={index === 0}
                        onClick={() => {
                          const tasks = [...row.tasks];
                          [tasks[index - 1], tasks[index]] = [
                            tasks[index],
                            tasks[index - 1],
                          ];
                          rowUpdate(row.workerId, { tasks });
                        }}
                      >
                        Move earlier
                      </Button>
                      <Button
                        disabled={
                          task.result !== "pending" || !!task.recordedAt
                        }
                        onClick={() => {
                          if (window.confirm("Remove this pending assignment?"))
                            rowUpdate(row.workerId, {
                              tasks: row.tasks.filter((t) => t.id !== task.id),
                            });
                        }}
                      >
                        Remove assignment
                      </Button>
                    </div>
                  </div>
                </details>
              );
            })}
            {!!problems.length && (
              <div>
                <strong>Resolve before sharing:</strong>
                <ul>
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {money && (
              <p role="alert">
                Money / pricing reference detected in this brief. Edit the
                worker-facing content before sharing.
              </p>
            )}
            <div className="crew-tabs">
              <Button
                kind="primary"
                disabled={busy || !edited}
                onClick={() => persist()}
              >
                Save assignments / results
              </Button>
              <Button
                disabled={
                  edited || busy || !!problems.length || money || !!day._queued
                }
                onClick={() =>
                  setPreview(preview === row.workerId ? "" : row.workerId)
                }
              >
                Review worker brief
              </Button>
              <Button
                disabled={
                  edited ||
                  busy ||
                  row.status !== "sent" ||
                  stale ||
                  !!problems.length ||
                  !!day._queued
                }
                onClick={() => {
                  if (
                    window.confirm(
                      `Record ${w?.name}’s actual CONFIRMED reply to this brief?`,
                    )
                  )
                    status(row, "confirmed");
                }}
              >
                Record confirmation
              </Button>
              <Button
                disabled={
                  busy ||
                  row.tasks.some(
                    (t) => t.result !== "pending" || !!t.recordedAt,
                  )
                }
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove worker and pending assignments from this day?",
                    )
                  )
                    update({
                      ...day,
                      crew: day.crew.filter((r) => r.workerId !== row.workerId),
                    });
                }}
              >
                Remove from day
              </Button>
            </div>
            {preview === row.workerId && (
              <div className="stack">
                <p>
                  Review all content before copying. No automatic message is
                  sent. Share only this text; do not give workers your owner
                  login.
                </p>
                <pre className="crew-brief">{brief}</pre>
                <div className="crew-tabs">
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(brief);
                        setLocalMessage(
                          "Brief copied. Paste it into your usual messaging app, then mark sent.",
                        );
                      } catch {
                        setLocalMessage(
                          "Clipboard unavailable. Select and copy the brief text manually.",
                        );
                      }
                    }}
                  >
                    Copy brief
                  </Button>
                  <Button
                    disabled={busy || edited}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Have you reviewed this brief for private information and sent it to this worker?",
                        )
                      )
                        status(row, "sent");
                    }}
                  >
                    I reviewed and sent this brief
                  </Button>
                </div>
              </div>
            )}
            {row.confirmedAt && (
              <p>
                Confirmation recorded:{" "}
                {new Date(row.confirmedAt).toLocaleString()}
              </p>
            )}
          </Card>
        );
      })}
      <Card className="field-plan-summary">
        <h3>Keep the job records connected</h3>
        <p>
          Use Field plan for lead quality checks. Use Daily sheets for hours,
          actual material consumption and the job handover. Assignment results
          above are the crew task history; do not enter material consumption
          here.
        </p>
        <div className="crew-tabs">
          <Button onClick={() => onNavigate("plan")}>
            Field plan / quality checks
          </Button>
          <Button onClick={() => onNavigate("daily")}>Daily sheets</Button>
          <Button onClick={() => onNavigate("actions")}>
            Shortages / repair actions
          </Button>
        </div>
      </Card>
    </>
  );
}
function AssignmentAdder({ cards, jobs, onAdd }) {
  const [job, setJob] = useState(""),
    [choice, setChoice] = useState("");
  return (
    <div className="form-grid">
      <Select label="Job for new assignments" value={job} onChange={setJob}>
        <option value="">Choose job</option>
        {jobs
          .filter((j) => j.bookingStatus !== "cancelled")
          .map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
      </Select>
      <Select
        label="Preset or individual task"
        value={choice}
        onChange={setChoice}
      >
        <option value="">Choose tasks</option>
        <optgroup label="Presets — review order for this job">
          {Object.keys(PRESETS).map((k) => (
            <option key={k} value={`preset:${k}`}>
              {k}
            </option>
          ))}
        </optgroup>
        <optgroup label="Individual tasks">
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} · {c.title}
            </option>
          ))}
        </optgroup>
      </Select>
      <Button
        disabled={
          !job ||
          !choice ||
          !(
            choice.startsWith("preset:") ? PRESETS[choice.slice(7)] : [choice]
          ).every((c) => cards.some((x) => x.id === c))
        }
        onClick={() => {
          onAdd(
            choice.startsWith("preset:") ? PRESETS[choice.slice(7)] : [choice],
            job,
          );
          setChoice("");
        }}
      >
        Add assignments
      </Button>
    </div>
  );
}
function Trailer({ state, save, busy, setDirty, onNavigate }) {
  const [draft, setDraft] = useState({
    id: uid(),
    date: localDate(),
    kind: "return",
    checkedBy: "",
    checks: Array(6).fill(false),
    notes: "",
  });
  const change = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  return (
    <>
      <Card className="field-plan-summary">
        <h2>Trailer return and weekly audit</h2>
        <details>
          <summary>
            Proposed trailer map — confirm physical locations first
          </summary>
          <p>
            These locations came from your handoff. Check shelf dimensions, load
            security, product storage requirements and access before adopting
            them. Copy confirmed codes into Inventory → Storage location. Keep
            shelf photo references in the item notes.
          </p>
          {trailerMap.map((location) => (
            <p key={location.code}>
              <strong>
                {location.code} · {location.zone}
              </strong>
              <br />
              {location.item}
              <br />
              <small>Suggested label: {location.label}</small>
            </p>
          ))}
        </details>

        <p>
          Use Inventory’s existing Storage location and Minimum stock fields.
          Confirm shelf codes physically before using them in task cards. Keep
          usable stock counts separate from damaged equipment.
        </p>
        <div className="crew-tabs">
          <Button onClick={() => onNavigate("inventory")}>
            Inventory / locations / minimums
          </Button>
          <Button onClick={() => onNavigate("load")}>
            Pre-departure load check
          </Button>
          <Button onClick={() => onNavigate("actions")}>
            Buy / repair action list
          </Button>
        </div>
      </Card>
      <form
        className="card field-plan-summary stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save("trailerChecks", draft)) {
            setDraft({
              ...draft,
              id: uid(),
              checks: Array(6).fill(false),
              notes: "",
            });
          }
        }}
      >
        <Text
          label="Trailer check date"
          type="date"
          value={draft.date}
          onChange={(v) => change("date", v)}
          required
        />
        <Select
          label="Check type"
          value={draft.kind}
          onChange={(v) => {
            setDraft((d) => ({ ...d, kind: v, checks: Array(6).fill(false) }));
            setDirty(true);
          }}
        >
          <option value="return">End-of-day return</option>
          <option value="weekly">Weekly audit</option>
        </Select>
        <Text
          label="Checked by"
          value={draft.checkedBy}
          onChange={(v) => change("checkedBy", v)}
          required
          maxLength={200}
        />
        {TRAILER_CHECKS[draft.kind].map((label, i) => (
          <Tick
            key={label}
            label={label}
            checked={draft.checks[i]}
            onChange={(v) =>
              change(
                "checks",
                draft.checks.map((x, n) => (n === i ? v : x)),
              )
            }
          />
        ))}
        <Text
          label="Missing / broken / unresolved notes"
          area
          value={draft.notes}
          onChange={(v) => change("notes", v)}
          maxLength={5000}
        />
        <p>
          Unchecked items remain incomplete. Record purchase or repair follow-up
          in Action list and adjust counted stock in Inventory.
        </p>
        <Button type="submit" kind="primary" disabled={busy}>
          Save trailer check
        </Button>
      </form>
      {[...state.trailerChecks]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20)
        .map((c) => (
          <Card key={c.id} className="field-plan-summary">
            <strong>
              {c.date} · {c.kind} · {c.checkedBy}
            </strong>
            <p>{c.checks.filter(Boolean).length}/6 checked</p>
            {c.checks.some((x) => !x) && (
              <ul>
                {TRAILER_CHECKS[c.kind]
                  .filter((_, i) => !c.checks[i])
                  .map((x) => (
                    <li key={x}>Open: {x}</li>
                  ))}
              </ul>
            )}
            <p>{c.notes}</p>
            <Button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Open this saved check? Unsaved entries will be discarded.",
                  )
                ) {
                  setDraft(c);
                  setDirty(false);
                }
              }}
            >
              Edit check
            </Button>
          </Card>
        ))}
    </>
  );
}
function History({ state }) {
  const [worker, setWorker] = useState("");
  const rows = [...state.crewDays]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((d) =>
      d.crew
        .filter((r) => !worker || r.workerId === worker)
        .flatMap((r) =>
          r.tasks.map((t) => ({
            day: d.date,
            worker: state.workers.find((w) => w.id === r.workerId)?.name,
            ...t,
          })),
        ),
    );
  return (
    <>
      <Select label="Worker history" value={worker} onChange={setWorker}>
        <option value="">All workers</option>
        {state.workers.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
      <p>
        History uses saved assignments directly. Open the original date in Day
        plan to correct results. Coaching notes remain in Workers.
      </p>
      {!rows.length && <p>No saved assignments yet.</p>}
      {rows.map((t) => (
        <Card
          key={`${t.day}-${t.worker}-${t.id}`}
          className="field-plan-summary"
        >
          <strong>
            {t.day} · {t.worker} · {t.cardId}
          </strong>
          <p>
            {state.jobs.find((j) => j.id === t.jobId)?.title} · {t.result}
          </p>
          <p>{t.note || "No result note"}</p>
        </Card>
      ))}
    </>
  );
}
function Guide({ onNavigate }) {
  return (
    <Card className="field-plan-summary crew-guide">
      <h2>Your daily and weekly routine</h2>
      <h3>Set up once</h3>
      <ol>
        <li>
          Load source cards in Task cards. Review the cards you actually use,
          save corrections, then approve each saved revision with your name.
          Other cards stay drafts.
        </li>
        <li>
          Label the real trailer locations. In Inventory, record those
          locations, usable counts and minimum stock.
        </li>
        <li>
          Add workers with actual contacts, transport and assessed task
          clearances. No blanket SOLO defaults.
        </li>
        <li>
          Check Jobs for the address, arrival time, system and material
          requirements.
        </li>
      </ol>
      <h3>Every evening — plan tomorrow</h3>
      <ol>
        <li>Read the last Daily Sheet and unresolved Action list items.</li>
        <li>
          In Day plan, choose tomorrow, enter the lead contact, add workers and
          check their availability and transport.
        </li>
        <li>
          Add job-specific presets or individual tasks. Adjust the sequence,
          area and timing. Confirm named supervisor coverage for ASSIST tasks.
        </li>
        <li>
          Save. Resolve each warning. Review and copy each personal brief into
          your usual messaging app; mark it sent only after sending.
        </li>
        <li>
          Record confirmation only after the worker replies. Changed plans need
          new briefs and confirmations.
        </li>
        <li>
          Use Load checks to physically check the next load against actual job
          requirements.
        </li>
      </ol>
      <h3>Every morning</h3>
      <ol>
        <li>
          Open Overview. Resolve unconfirmed workers, missing plans, changed
          briefs and clearance problems.
        </li>
        <li>
          Verify the physical load, transport and job readiness. Resolve safety
          or access issues before departure.
        </li>
        <li>
          At the job, confirm site conditions, task instructions and
          supervision. Use Field plan checks; the lead releases the next phase.
        </li>
      </ol>
      <h3>During work and before leaving</h3>
      <ol>
        <li>
          Record changed conditions, defects and holds in Field plan / Daily
          sheets. Follow the approved task cards and stop-and-ask instructions.
        </li>
        <li>
          In Day plan, mark each assignment Done, Partial or Not done. Explain
          unfinished work. Save results.
        </li>
        <li>
          Complete the job’s Daily Sheet: actual hours, materials used, issues
          and tomorrow’s needs. Review once to apply material consumption; do
          not subtract the same usage manually.
        </li>
        <li>
          Complete Trailer checks → End-of-day return. Isolate damaged gear,
          label partial kits, and return items to their spots.
        </li>
        <li>
          Update actual stock counts when needed; create shortage / repair
          actions with an owner and due date.
        </li>
      </ol>
      <h3>Every week</h3>
      <ol>
        <li>
          Complete Trailer checks → Weekly audit. Count stock, inspect equipment
          and resolve outstanding purchase / repair actions.
        </li>
        <li>
          Review upcoming jobs, crew availability, transport and required cards.
        </li>
        <li>
          Review History for incomplete work and recurring problems. Coach
          workers and reassess clearances deliberately.
        </li>
        <li>
          Improve the cards that caused questions; edits require approval again.
          Keep manufacturer references current.
        </li>
        <li>
          Use Settings to export a backup. Check that offline changes have
          synced.
        </li>
      </ol>
      <p>
        Success means fewer repeated questions, missing tools, supply runs and
        unfinished tasks discovered the next morning. The app records your
        decisions; messages and on-site checks still require you.
      </p>
      <Button onClick={() => onNavigate("settings")}>Settings / backup</Button>
    </Card>
  );
}
