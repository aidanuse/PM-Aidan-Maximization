import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  BriefcaseBusiness,
  Package,
  Truck,
  CalendarDays,
  MessageSquareText,
  ChartNoAxesCombined,
  Bell,
  Settings,
  ArrowUpRight,
  Plus,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Menu,
  X,
  LogOut,
  CloudOff,
  RefreshCw,
  ShieldCheck,
  Download,
  Smartphone,
  TriangleAlert,
  Clock,
  MapPin,
  Trash2,
  Save,
  Wifi,
  NotebookPen,
  Search,
  ListChecks,
  LockKeyhole,
  HardHat,
} from "lucide-react";
import {
  Button,
  Card,
  Field,
  Badge,
  Empty,
  Metric,
  Modal,
  SectionHead,
  ArrowLink,
} from "./ui.jsx";
import {
  InventoryView,
  LoadCheckView,
  ActionsView,
  AnalysisView,
  CalendarView,
  FollowupsView,
  RemindersView,
} from "./Operations.jsx";
import {
  request,
  loadState,
  saveRecord,
  deleteRecord,
  getQueue,
  flushQueue,
  clearLocalData,
  discardQueued,
} from "./api.js";

const NAV = [
  ["today", "Overview", LayoutDashboard],
  ["daily", "Daily sheets", NotebookPen],
  ["jobs", "Jobs", BriefcaseBusiness],
  ["inventory", "Inventory", Package],
  ["load", "Load checks", Truck],
  ["calendar", "Calendar", CalendarDays],
  ["followups", "Follow-ups", MessageSquareText],
  ["actions", "Action list", ListChecks],
  ["analysis", "Analysis", ChartNoAxesCombined],
  ["reminders", "Reminders", Bell],
  ["settings", "Settings", Settings],
];
const blankState = {
  jobs: [],
  inventory: [],
  dailySheets: [],
  loadChecks: [],
  actions: [],
  reminders: [],
  calendarEvents: [],
  settings: {},
  integrations: {},
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const fieldNames = {
  address: "Address",
  areaSqft: "Area",
  system: "Coating system",
  product: "Exact product",
  arrivalTime: "Arrival time",
  access: "Site access",
  scope: "Scope",
  crew: "Crew",
  clientName: "Client name",
  phone: "Client phone",
};
function gaps(job, settings = {}) {
  return (
    settings.followupRequiredFields || [
      "address",
      "areaSqft",
      "system",
      "arrivalTime",
      "access",
      "scope",
      "crew",
    ]
  )
    .filter(
      (k) =>
        job[k] === null ||
        job[k] === undefined ||
        String(job[k]).trim() === "" ||
        (k === "areaSqft" && Number(job[k]) <= 0),
    )
    .map((k) => fieldNames[k] || k);
}
const formatDate = (value) =>
  value
    ? new Date(
        value.length === 10 ? value + "T12:00:00" : value,
      ).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : "Not scheduled";
const jobName = (state, id) =>
  state.jobs.find((j) => j.id === id)?.title || "Job not selected";
const errText = (e) =>
  e.message || "Something went wrong. Your input is still here.";
function localDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function App() {
  const [auth, setAuth] = useState(null),
    [state, setState] = useState(blankState),
    [route, setRoute] = useState(
      () => new URLSearchParams(location.search).get("view") || "today",
    ),
    [menu, setMenu] = useState(false),
    [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(""),
    [toastValue, setToast] = useState(null),
    [queue, setQueue] = useState(getQueue()),
    [syncing, setSyncing] = useState(false);
  const toast = useCallback((message, tone = "success") => {
    setToast({ message, tone });
  }, []);
  useEffect(() => {
    if (!toastValue) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toastValue]);
  const reload = useCallback(async () => {
    try {
      const next = await loadState();
      setState({ ...blankState, ...next });
      setFatal("");
      return next;
    } catch (e) {
      if (e.status === 401) setAuth((a) => ({ ...a, authenticated: false }));
      throw e;
    }
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const a = await request("/api/auth/status");
        setAuth(a);
        if (a.authenticated) await reload();
      } catch (e) {
        try {
          const cached = await loadState();
          if (cached._offline) {
            setState({ ...blankState, ...cached });
            setAuth({ configured: true, authenticated: true });
          } else setFatal(errText(e));
        } catch {
          setFatal(
            "The app server could not be reached. Check your connection and try again.",
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [reload]);
  useEffect(() => {
    const changed = () => setQueue(getQueue());
    window.addEventListener("hardbond:queue", changed);
    return () => window.removeEventListener("hardbond:queue", changed);
  }, []);
  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await flushQueue();
      await reload();
      setQueue(getQueue());
      if (result.conflicts?.length)
        toast(
          "Some edits need review before they can sync. Open Settings.",
          "warning",
        );
      else
        toast(
          result.remaining
            ? "Some changes are still pending."
            : "Your records are up to date.",
        );
    } catch (e) {
      toast(errText(e), "warning");
    } finally {
      setSyncing(false);
    }
  }, [reload, toast]);
  useEffect(() => {
    const online = () => {
      if (auth?.authenticated) sync();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [auth?.authenticated, sync]);
  const navigate = (id) => {
    setRoute(id);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onSave = async (collection, record) => {
    const saved = await saveRecord(collection, record);
    if (saved._queued) {
      setState((s) => ({
        ...s,
        [collection]: [
          ...s[collection].filter((x) => x.id !== saved.id),
          saved,
        ],
        _offline: true,
      }));
      toast("Saved on this device. Waiting to sync.", "warning");
    } else {
      await reload();
      toast("Saved.");
    }
    return saved;
  };
  const onDelete = async (collection, id, version) => {
    const result = await deleteRecord(collection, id, version);
    await reload();
    toast(
      result._queued
        ? "Deletion queued on this device. Waiting to sync."
        : "Removed.",
      result._queued ? "warning" : "success",
    );
    return result;
  };
  const logout = async () => {
    if (
      getQueue().length &&
      !window.confirm(
        "There are changes saved only on this device. Signing out clears them. Sign out anyway?",
      )
    )
      return;
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch (error) {
      toast(`Could not sign out: ${error.message}`, "error");
      return;
    }
    clearLocalData();
    setState(blankState);
    setAuth({ configured: true, authenticated: false });
    setQueue([]);
  };
  const props = {
    state,
    onSave,
    onDelete,
    reload,
    toast,
    onNavigate: navigate,
  };
  if (loading)
    return (
      <div className="splash">
        <Brand />
        <div className="spinner" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (fatal && !auth?.authenticated)
    return (
      <div className="login-page">
        <Card>
          <CloudOff size={32} />
          <h1>Connection needed</h1>
          <p>{fatal}</p>
          <Button kind="primary" onClick={() => location.reload()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  if (!auth?.authenticated)
    return (
      <Login
        auth={auth}
        onLogin={async () => {
          setAuth({ ...auth, authenticated: true });
          setLoading(true);
          try {
            await reload();
          } catch (e) {
            setFatal(errText(e));
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  let view;
  switch (route) {
    case "jobs":
      view = <JobsView {...props} />;
      break;
    case "daily":
      view = <DailyView {...props} />;
      break;
    case "inventory":
      view = <InventoryView {...props} />;
      break;
    case "load":
      view = <LoadCheckView {...props} />;
      break;
    case "calendar":
      view = <CalendarView {...props} />;
      break;
    case "actions":
      view = <ActionsView {...props} />;
      break;
    case "analysis":
      view = <AnalysisView {...props} />;
      break;
    case "followups":
      view = <FollowupsView {...props} />;
      break;
    case "reminders":
      view = <RemindersView {...props} />;
      break;
    case "settings":
      view = (
        <SettingsView
          {...props}
          queue={queue}
          sync={sync}
          syncing={syncing}
          logout={logout}
        />
      );
      break;
    default:
      view = <TodayView {...props} />;
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
        <Brand />
        <div className="workspace-label">
          <span className="status-dot" /> PERSONAL WORKSPACE
        </div>
        <nav aria-label="Main navigation">
          {NAV.map(([id, label, Icon], i) => (
            <React.Fragment key={id}>
              {i === 3 && <div className="nav-divider">OPERATIONS</div>}
              {i === 8 && <div className="nav-divider">REVIEW & CONTROL</div>}
              <button
                className={`nav-item ${route === id ? "active" : ""}`}
                onClick={() => navigate(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "actions" &&
                  state.actions.filter((a) => a.status === "open").length >
                    0 && (
                    <small>
                      {state.actions.filter((a) => a.status === "open").length}
                    </small>
                  )}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">A</div>
          <div>
            <strong>{state.settings.ownerName || "Aidan"}</strong>
            <small>HARDBOND · Private</small>
          </div>
          <button className="icon-btn" aria-label="Sign out" onClick={logout}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menu && <div className="nav-scrim" onClick={() => setMenu(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Your workspace <ChevronRight size={13} />{" "}
            <strong>
              {NAV.find((n) => n[0] === route)?.[1] || "Overview"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="today-date">
              {new Date().toLocaleDateString("en-CA", {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: "America/Toronto",
              })}
            </span>
            <button
              className="sync-indicator"
              onClick={sync}
              disabled={syncing}
              title="Sync records"
            >
              {state._offline ? (
                <CloudOff size={15} />
              ) : (
                <span className="status-dot" />
              )}
              {syncing
                ? "Syncing"
                : queue.length
                  ? `${queue.length} pending`
                  : state._offline
                    ? "Offline"
                    : "Connected"}
            </button>
            <button
              className="icon-btn"
              aria-label="Open reminders"
              onClick={() => navigate("reminders")}
            >
              <Bell size={20} />
            </button>
          </div>
        </header>
        {(state._offline || queue.length > 0) && (
          <div className="offline-banner">
            <CloudOff size={17} />
            <span>
              {queue.length
                ? `${queue.length} change${queue.length === 1 ? "" : "s"} saved on this device.`
                : "Viewing your last saved records."}{" "}
              Server reminders and texts need a connected server.
            </span>
            <button onClick={sync} disabled={syncing}>
              Retry sync
            </button>
          </div>
        )}
        <main className="main-content">{view}</main>
        <footer className="app-footer">
          <span>HARDBOND COMMAND</span>
          <span>Your work. One place.</span>
        </footer>
      </div>
      <nav className="mobile-bottom" aria-label="Quick navigation">
        {[
          ["today", "Today", LayoutDashboard],
          ["daily", "Daily sheet", NotebookPen],
          ["jobs", "Jobs", BriefcaseBusiness],
          ["inventory", "Stock", Package],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            className={route === id ? "active" : ""}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
        <button onClick={() => setMenu(true)}>
          <Menu size={21} />
          <span>More</span>
        </button>
      </nav>
      {toastValue && (
        <div className={`toast toast-${toastValue.tone}`} role="status">
          {toastValue.tone === "warning" ? (
            <TriangleAlert size={18} />
          ) : (
            <Check size={18} />
          )}
          <span>{toastValue.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <HardHat size={25} />
      </span>
      <div>
        <strong>HARDBOND</strong>
        <span>COMMAND</span>
      </div>
    </div>
  );
}
function Login({ auth, onLogin }) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await onLogin();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <div className="login-intro">
        <Brand />
        <p className="eyebrow">BUILT FOR THE FIELD</p>
        <h1>
          A clear head.
          <br />A prepared job.
          <br />
          <span>A better day.</span>
        </h1>
        <p>
          Your jobs, materials, daily records and follow-through. In one private
          workspace.
        </p>
        <div className="login-feature">
          <ShieldCheck />
          Private to you <span>·</span>
          <Smartphone />
          Made for your phone
        </div>
      </div>
      <Card className="login-card">
        <div className="login-icon">
          <LockKeyhole />
        </div>
        <h2>Your command centre</h2>
        {auth?.configured === false ? (
          <>
            <p>
              The app is installed. Set the owner password on the hosting server
              to activate this private workspace.
            </p>
            <div className="notice">
              Your hosting setup must be completed before phone access and
              notifications can work.
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted">Sign in to pick up where you left off.</p>
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button kind="primary" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Open my workspace"}
              <ArrowRight size={17} />
            </Button>
          </form>
        )}
        <small>Standalone HARDBOND app · No ChatGPT required</small>
      </Card>
    </div>
  );
}
function TodayView({ state, onNavigate }) {
  const date = today(),
    jobs = state.jobs.filter(
      (j) => j.date === date && j.bookingStatus !== "cancelled",
    ),
    gappy = state.jobs.filter(
      (j) => j.bookingStatus !== "cancelled" && gaps(j, state.settings).length,
    ),
    low = state.inventory.filter(
      (i) =>
        i.quantity !== null &&
        i.minimum !== null &&
        Number(i.quantity) <= Number(i.minimum),
    ),
    unknown = state.inventory.filter((i) => i.quantity === null),
    open = state.actions.filter(
      (a) => !["done", "cancelled"].includes(a.status),
    ),
    daily = state.dailySheets.filter((d) => d.date === date),
    nextJobs = [...state.jobs]
      .filter((j) => j.date >= date && j.bookingStatus !== "cancelled")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
  return (
    <div className="stack page-enter">
      <SectionHead
        eyebrow="YOUR DAILY COMMAND"
        title={`Let's get ahead, ${state.settings.ownerName || "Aidan"}.`}
        description="Know the plan. Check the load. Close the loop."
        action={
          <Button kind="primary" onClick={() => onNavigate("daily")}>
            <Plus size={18} />
            Daily sheet
          </Button>
        }
      />
      <div className="hero-card">
        <div>
          <Badge tone="light">THE DAILY LOOP</Badge>
          <h2>
            Today's work.
            <br /> Tomorrow's head start.
          </h2>
          <p>
            Your end-of-day record turns materials used, delays and unfinished
            work into your next steps.
          </p>
          <Button kind="light" onClick={() => onNavigate("daily")}>
            {daily.length ? "Review today’s sheet" : "Start today’s sheet"}
            <ArrowUpRight size={18} />
          </Button>
        </div>
        <div className="hero-loop">
          <div>
            <span>01</span>
            <strong>Prepare</strong>
            <small>Job details + materials</small>
          </div>
          <div>
            <span>02</span>
            <strong>Record</strong>
            <small>Your day in the field</small>
          </div>
          <div>
            <span>03</span>
            <strong>Follow through</strong>
            <small>Tomorrow’s actions</small>
          </div>
        </div>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Jobs today"
          value={jobs.length}
          detail={
            jobs.length
              ? "On your current schedule"
              : "Add or import your schedule"
          }
          icon={BriefcaseBusiness}
        />
        <Metric
          label="Need job details"
          value={gappy.length}
          detail="Follow-ups from missing fields"
          icon={MessageSquareText}
        />
        <Metric
          label="Stock to check"
          value={low.length + unknown.length}
          detail={`${low.length} low · ${unknown.length} uncounted`}
          icon={Package}
        />
        <Metric
          label="Open actions"
          value={open.length}
          detail="A clear owner for the next step"
          icon={ListChecks}
        />
      </div>
      <div className="dashboard-grid">
        <Card>
          <div className="card-heading">
            <div>
              <p className="eyebrow">LOOKING AHEAD</p>
              <h2>Your next jobs</h2>
            </div>
            <ArrowLink onClick={() => onNavigate("jobs")}>All jobs</ArrowLink>
          </div>
          {nextJobs.length ? (
            nextJobs.map((job) => (
              <button
                key={job.id}
                className="job-row"
                onClick={() => onNavigate("jobs")}
              >
                <div className="date-tile">
                  <strong>{new Date(job.date + "T12:00:00").getDate()}</strong>
                  <span>
                    {new Date(job.date + "T12:00:00").toLocaleString("en", {
                      month: "short",
                    })}
                  </span>
                </div>
                <div className="job-row-info">
                  <strong>{job.title}</strong>
                  <span>{job.address || "Address needed"}</span>
                </div>
                <Badge
                  tone={
                    job.bookingStatus === "confirmed" ? "success" : "warning"
                  }
                >
                  {job.bookingStatus}
                </Badge>
                <ChevronRight size={18} />
              </button>
            ))
          ) : (
            <Empty
              title="Your next job starts here"
              action={
                <Button onClick={() => onNavigate("jobs")}>
                  <Plus size={16} />
                  Add a job
                </Button>
              }
            >
              Add the job once. Use its details across your day plan, load check
              and follow-ups.
            </Empty>
          )}
        </Card>
        <Card>
          <div className="card-heading">
            <div>
              <p className="eyebrow">BEFORE THE NEXT JOB</p>
              <h2>Keep the small things covered.</h2>
            </div>
          </div>
          <div
            className="action-tile"
            onClick={() => onNavigate("load")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onNavigate("load")}
          >
            <span className="tile-icon">
              <Truck />
            </span>
            <div>
              <strong>Check what’s actually there</strong>
              <p>
                Required quantity, physical count, correct location. Final
                check: you.
              </p>
            </div>
            <ArrowRight size={18} />
          </div>
          <div
            className="action-tile"
            onClick={() => onNavigate("followups")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onNavigate("followups")}
          >
            <span className="tile-icon teal">
              <MessageSquareText />
            </span>
            <div>
              <strong>Get missing details settled</strong>
              <p>
                {gappy.length
                  ? `${gappy.length} job${gappy.length === 1 ? "" : "s"} need more information.`
                  : "Follow-up drafts appear when job details are incomplete."}
              </p>
            </div>
            <ArrowRight size={18} />
          </div>
          <div
            className="action-tile"
            onClick={() => onNavigate("settings")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onNavigate("settings")}
          >
            <span className="tile-icon blue">
              <Smartphone />
            </span>
            <div>
              <strong>Make this your phone app</strong>
              <p>Install on your home screen and connect notifications.</p>
            </div>
            <ArrowRight size={18} />
          </div>
        </Card>
      </div>
      <Card className="daily-strip">
        <div className="strip-icon">
          <NotebookPen size={26} />
        </div>
        <div>
          <h3>
            {daily.length
              ? "Your daily record is taking shape."
              : "A few minutes now. A more prepared tomorrow."}
          </h3>
          <p>
            {daily.length
              ? `${daily.length} record${daily.length === 1 ? "" : "s"} today · ${daily.filter((d) => d.status === "reviewed").length} reviewed`
              : "Crew, conditions, coats, materials, delays and what tomorrow needs."}
          </p>
        </div>
        <Button onClick={() => onNavigate("daily")}>
          Open Daily Sheet
          <ArrowRight size={16} />
        </Button>
      </Card>
    </div>
  );
}
function JobsView({ state, onSave, onDelete, onNavigate }) {
  const [editing, setEditing] = useState(null),
    [search, setSearch] = useState("");
  const jobs = state.jobs
    .filter((j) =>
      `${j.title} ${j.address} ${j.clientName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  return (
    <div className="stack page-enter">
      <SectionHead
        eyebrow="ONE JOB RECORD"
        title="Know the job before you go."
        description="The details here feed your load plan and automatic follow-up rules."
        action={
          <Button kind="primary" onClick={() => setEditing({})}>
            <Plus size={18} />
            New job
          </Button>
        }
      />
      <div className="toolbar">
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="Search jobs"
            placeholder="Search jobs, clients or addresses"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Badge>{jobs.length} jobs</Badge>
        <Button onClick={() => onNavigate("calendar")}>
          Import calendar
          <CalendarDays size={16} />
        </Button>
      </div>
      {!jobs.length ? (
        <Card>
          <Empty
            title={search ? "No matching jobs" : "Start with your next job"}
            action={
              !search && (
                <Button kind="primary" onClick={() => setEditing({})}>
                  Add your first job
                  <Plus size={16} />
                </Button>
              )
            }
          >
            Unfilled fields stay visible and become follow-ups. You can save
            what you know now.
          </Empty>
        </Card>
      ) : (
        <div className="job-grid">
          {jobs.map((job) => (
            <Card key={job.id} className="job-card">
              <div className="row-between">
                <Badge
                  tone={
                    job.bookingStatus === "confirmed"
                      ? "success"
                      : job.bookingStatus === "cancelled"
                        ? "neutral"
                        : "warning"
                  }
                >
                  {job.bookingStatus}
                </Badge>
                <span className="muted small">{formatDate(job.date)}</span>
              </div>
              <h2>{job.title}</h2>
              <p className="icon-line">
                <MapPin size={15} />
                {job.address || "Address needed"}
              </p>
              <div className="job-facts">
                <div>
                  <small>System</small>
                  <strong>{job.system || "Not confirmed"}</strong>
                </div>
                <div>
                  <small>Floor area</small>
                  <strong>
                    {job.areaSqft === null || job.areaSqft === undefined
                      ? "Unknown"
                      : `${job.areaSqft} sq ft`}
                  </strong>
                </div>
                <div>
                  <small>Crew</small>
                  <strong>{job.crew || "Not confirmed"}</strong>
                </div>
                <div>
                  <small>Arrival</small>
                  <strong>{job.arrivalTime || "Not confirmed"}</strong>
                </div>
              </div>
              {gaps(job, state.settings).length > 0 ? (
                <p className="gap-note">
                  <TriangleAlert size={15} />
                  {gaps(job, state.settings).length} details to follow up
                </p>
              ) : (
                <p className="complete-note">
                  <Check size={15} />
                  Selected job-detail fields filled
                </p>
              )}
              <Button onClick={() => setEditing(job)}>
                Open job
                <ArrowRight size={16} />
              </Button>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <JobForm
          job={editing}
          inventory={state.inventory}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            await onSave("jobs", r);
            setEditing(null);
          }}
          onDelete={
            editing.id
              ? async () => {
                  if (
                    window.confirm(
                      "Delete this job? Linked records may prevent deletion.",
                    )
                  ) {
                    await onDelete("jobs", editing.id, editing.version);
                    setEditing(null);
                  }
                }
              : null
          }
        />
      )}
    </div>
  );
}
function JobForm({ job, inventory, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
      title: "",
      clientName: "",
      phone: "",
      address: "",
      date: "",
      bookingStatus: "tentative",
      areaSqft: "",
      system: "",
      product: "",
      crew: "",
      arrivalTime: "",
      access: "",
      scope: "",
      materials: [],
      source: "manual",
      notes: "",
      ...job,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = (k, label, type = "text") => (
    <Field label={label}>
      <input
        type={type}
        value={form[k] ?? ""}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...form,
        areaSqft: form.areaSqft === "" ? null : Number(form.areaSqft),
        materials: form.materials.map((m) => ({
          ...m,
          quantity: Number(m.quantity),
        })),
      });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={job.id ? "Job details" : "Add a job"} onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        <div className="notice">
          Save known details now. Missing information stays visible; no product
          or quantity is guessed.
        </div>
        <Field label="Job name">
          <input
            autoFocus
            required
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Client / site / work"
          />
        </Field>
        <div className="form-grid">
          {input("clientName", "Client name")}
          {input("phone", "Client phone", "tel")}
          {input("date", "Planned date", "date")}
          <Field label="Booking">
            <select
              value={form.bookingStatus}
              onChange={(e) => set("bookingStatus", e.target.value)}
            >
              <option value="tentative">Tentative</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
        </div>
        {input("address", "Job address")}
        <div className="form-grid">
          {input("areaSqft", "Floor area (sq ft)", "number")}
          {input("system", "Coating system")}
          {input("product", "Exact product(s)")}
          {input("crew", "Crew")}
          {input("arrivalTime", "Arrival time", "time")}
          {input("access", "Site access arrangement")}
        </div>
        <Field label="Agreed scope">
          <textarea
            rows={3}
            value={form.scope}
            onChange={(e) => set("scope", e.target.value)}
            placeholder="Areas, coat sequence, repairs, walls/steps and exclusions"
          />
        </Field>
        <MaterialEditor
          label="Planned materials"
          value={form.materials}
          inventory={inventory}
          onChange={(v) => set("materials", v)}
        />
        {form.source !== "manual" && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={
                !!form.sourceVerifiedAt &&
                Date.now() - Date.parse(form.sourceVerifiedAt) < 86400000
              }
              onChange={(e) =>
                set(
                  "sourceVerifiedAt",
                  e.target.checked ? new Date().toISOString() : "",
                )
              }
            />
            I checked these details against the latest team calendar
          </label>
        )}
        <Field label="Notes">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          {onDelete && (
            <Button
              type="button"
              kind="danger"
              onClick={async () => {
                try {
                  await onDelete();
                } catch (e) {
                  setError(errText(e));
                }
              }}
            >
              <Trash2 size={16} />
              Delete
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save job"}
            <Save size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function MaterialEditor({ label, value, inventory, onChange }) {
  const update = (i, key, v) =>
    onChange(value.map((m, n) => (n === i ? { ...m, [key]: v } : m)));
  return (
    <div className="material-editor">
      <div className="row-between">
        <h3>{label}</h3>
        <Button
          type="button"
          disabled={!inventory.length}
          onClick={() =>
            onChange([
              ...value,
              { inventoryId: inventory[0]?.id || "", quantity: "" },
            ])
          }
        >
          <Plus size={15} />
          Add item
        </Button>
      </div>
      {!inventory.length && (
        <p className="muted small">
          Add products to Inventory to connect material quantities.
        </p>
      )}
      {value.map((m, i) => (
        <div className="material-line" key={i}>
          <Field label="Inventory item">
            <select
              value={m.inventoryId}
              onChange={(e) => update(i, "inventoryId", e.target.value)}
            >
              {inventory.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} ({it.unit})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input
              type="number"
              min="0"
              step="any"
              required
              value={m.quantity ?? ""}
              onChange={(e) => update(i, "quantity", e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="icon-btn danger"
            aria-label={`Remove material ${i + 1}`}
            onClick={() => onChange(value.filter((_, n) => n !== i))}
          >
            <Trash2 size={17} />
          </button>
        </div>
      ))}
    </div>
  );
}
function DailyView({ state, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  const sheets = [...state.dailySheets].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  return (
    <div className="stack page-enter">
      <SectionHead
        eyebrow="YOUR MAIN ENTRY POINT"
        title="Close today. Prepare tomorrow."
        description="Eight familiar fields, with materials and reminders connected behind them."
        action={
          <Button kind="primary" onClick={() => setEditing({})}>
            <Plus size={18} />
            New daily sheet
          </Button>
        }
      />
      <div className="notice">
        <NotebookPen size={19} />
        <span>
          Save a draft at any point. Reviewing a sheet applies recorded material
          use to inventory. Set a reminder to carry tomorrow’s needs forward.
        </span>
      </div>
      {!sheets.length ? (
        <Card>
          <Empty
            title="Your first day starts the learning loop"
            icon={NotebookPen}
            action={
              <Button kind="primary" onClick={() => setEditing({})}>
                Start today’s sheet
                <ArrowRight size={16} />
              </Button>
            }
          >
            Capture what actually happened. Unrecorded time, conditions and
            costs stay unknown.
          </Empty>
        </Card>
      ) : (
        <div className="records-list">
          {sheets.map((s) => (
            <Card key={s.id}>
              <div className="row-between">
                <div>
                  <p className="eyebrow">{formatDate(s.date)}</p>
                  <h2>{jobName(state, s.jobId)}</h2>
                </div>
                <Badge
                  tone={
                    s._queued
                      ? "warning"
                      : s.status === "reviewed"
                        ? "success"
                        : "neutral"
                  }
                >
                  {s._queued ? "Pending sync" : s.status}
                </Badge>
              </div>
              <div className="daily-summary">
                <div>
                  <small>Completed</small>
                  <p>{s.coatsCompleted || "Not recorded yet"}</p>
                </div>
                <div>
                  <small>Tomorrow needs</small>
                  <p>{s.tomorrowNeeds || "Not recorded yet"}</p>
                </div>
              </div>
              {s.inventoryEffect && (
                <p className="muted small">
                  {typeof s.inventoryEffect === "string"
                    ? s.inventoryEffect
                    : `${s.inventoryEffect.applied?.length || 0} inventory quantities updated · ${s.inventoryEffect.unknown?.length || 0} stock baselines still unknown`}
                </p>
              )}
              <Button onClick={() => setEditing(s)}>
                Review entry
                <ArrowRight size={16} />
              </Button>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <DailyForm
          record={editing}
          state={state}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            await onSave("dailySheets", r);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
function DailyForm({ record, state, onClose, onSave }) {
  const [form, setForm] = useState({
      date: today(),
      jobId: "",
      crew: [],
      conditions: "",
      coatsCompleted: "",
      materials: [],
      issues: "",
      delayMinutes: "",
      delayCause: "",
      deliveryCost: "",
      tomorrowNeeds: "",
      status: "draft",
      remindAt: "",
      ...record,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const crewChange = (i, k, v) =>
    set(
      "crew",
      form.crew.map((c, n) => (n === i ? { ...c, [k]: v } : c)),
    );
  const submit = async (e, status) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (status === "reviewed" && !form.jobId)
        throw new Error(
          "Choose a job before reviewing this sheet. You can save a draft without one.",
        );
      if (
        status === "reviewed" &&
        form.crew.some((c) => !c.person.trim() || !c.role.trim())
      )
        throw new Error(
          "Each recorded crew member needs a name and responsibility before review.",
        );
      await onSave({
        ...form,
        status,
        materials: form.materials.map((m) => ({
          ...m,
          quantity: Number(m.quantity),
        })),
        crew: form.crew.map((c) => ({
          ...c,
          driveMinutes: c.driveMinutes === "" ? 0 : Number(c.driveMinutes || 0),
          breakMinutes: c.breakMinutes === "" ? 0 : Number(c.breakMinutes || 0),
        })),
        delayMinutes:
          form.delayMinutes === "" ? null : Number(form.delayMinutes),
        deliveryCost:
          form.deliveryCost === "" ? null : Number(form.deliveryCost),
      });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={record.id ? "Review daily sheet" : "Your daily sheet"}
      onClose={onClose}
      wide
    >
      <form className="stack" onSubmit={(e) => submit(e, "reviewed")}>
        <div className="form-grid">
          <Field label="1. Date">
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>
          <Field label="2. Job worked">
            <select
              value={form.jobId}
              onChange={(e) => set("jobId", e.target.value)}
            >
              <option value="">Choose a job</option>
              {state.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row-between">
          <h3>3. Crew + clock times</h3>
          <Button
            type="button"
            onClick={() =>
              set("crew", [
                ...form.crew,
                {
                  person: "",
                  role: "",
                  start: "",
                  end: "",
                  driveMinutes: "",
                  breakMinutes: "",
                },
              ])
            }
          >
            <Plus size={15} />
            Crew interval
          </Button>
        </div>
        <p className="muted small">
          Add separate intervals for someone who leaves and returns. Site and
          drive time stay separate. Incomplete clocks stay flagged.
        </p>
        {form.crew.map((c, i) => (
          <div className="crew-entry" key={i}>
            <div className="form-grid">
              <Field label="Person">
                <input
                  list="crew-names"
                  value={c.person}
                  onChange={(e) => crewChange(i, "person", e.target.value)}
                />
              </Field>
              <Field label="Responsibility">
                <input
                  value={c.role}
                  onChange={(e) => crewChange(i, "role", e.target.value)}
                  placeholder="e.g. Edges and patching"
                />
              </Field>
              <Field label="On site">
                <input
                  type="time"
                  value={c.start}
                  onChange={(e) => crewChange(i, "start", e.target.value)}
                />
              </Field>
              <Field label="Left site">
                <input
                  type="time"
                  value={c.end}
                  onChange={(e) => crewChange(i, "end", e.target.value)}
                />
              </Field>
              <Field label="Break minutes">
                <input
                  type="number"
                  min="0"
                  value={c.breakMinutes ?? ""}
                  onChange={(e) =>
                    crewChange(i, "breakMinutes", e.target.value)
                  }
                />
              </Field>
              <Field label="Drive minutes">
                <input
                  type="number"
                  min="0"
                  value={c.driveMinutes ?? ""}
                  onChange={(e) =>
                    crewChange(i, "driveMinutes", e.target.value)
                  }
                />
              </Field>
            </div>
            <Button
              type="button"
              kind="danger"
              onClick={() =>
                set(
                  "crew",
                  form.crew.filter((_, n) => n !== i),
                )
              }
            >
              <Trash2 size={14} />
              Remove interval
            </Button>
          </div>
        ))}
        <datalist id="crew-names">
          <option value="Aidan" />
          <option value="Max" />
          <option value="Daniel" />
        </datalist>
        <Field label="4. Conditions">
          <textarea
            rows={3}
            value={form.conditions}
            onChange={(e) => set("conditions", e.target.value)}
            placeholder="Actual air/slab readings with units, time, test method and product requirements. Leave unmeasured values unknown."
          />
        </Field>
        <Field label="5. Coats completed">
          <textarea
            rows={3}
            value={form.coatsCompleted}
            onChange={(e) => set("coatsCompleted", e.target.value)}
            placeholder="Zone, coat, exact product, area, finish time and remaining work"
          />
        </Field>
        <MaterialEditor
          label="6. Materials used"
          value={form.materials}
          inventory={state.inventory}
          onChange={(v) => set("materials", v)}
        />
        <p className="muted small">
          Record actual consumption in the inventory unit. Opening a kit does
          not mean the full kit was used.
        </p>
        <Field label="7. Issues or delays">
          <textarea
            rows={3}
            value={form.issues}
            onChange={(e) => set("issues", e.target.value)}
            placeholder="What happened, who was affected, and what work continued?"
          />
        </Field>
        <div className="form-grid">
          <Field label="Elapsed delay (minutes)">
            <input
              type="number"
              min="0"
              value={form.delayMinutes ?? ""}
              onChange={(e) => set("delayMinutes", e.target.value)}
              placeholder="Unknown"
            />
          </Field>
          <Field label="Delay cause">
            <select
              value={form.delayCause}
              onChange={(e) => set("delayCause", e.target.value)}
            >
              <option value="">Not classified</option>
              <option value="materials">Materials / supply run</option>
              <option value="job-details">Missing job details</option>
              <option value="access">Access</option>
              <option value="equipment">Equipment</option>
              <option value="weather">Conditions</option>
              <option value="rework">Rework</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Rescue delivery / pickup cost ($)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.deliveryCost ?? ""}
              onChange={(e) => set("deliveryCost", e.target.value)}
              placeholder="Unknown"
            />
          </Field>
        </div>
        <Field label="8. What tomorrow needs">
          <textarea
            rows={4}
            value={form.tomorrowNeeds}
            onChange={(e) => set("tomorrowNeeds", e.target.value)}
            placeholder="Materials, unresolved decisions, carryover work and the next action"
          />
        </Field>
        <Field label="Remind me about tomorrow’s needs">
          <input
            type="datetime-local"
            value={localDateTime(form.remindAt)}
            onChange={(e) =>
              set(
                "remindAt",
                e.target.value ? new Date(e.target.value).toISOString() : "",
              )
            }
          />
        </Field>
        <p className="muted small">
          A scheduled reminder uses the information above. Phone delivery
          requires notifications connected in Settings.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Button
            type="button"
            onClick={(e) => submit(e, "draft")}
            disabled={busy}
          >
            Save draft
          </Button>
          <Button kind="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Review & save"}
            <CheckCheck size={17} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function SettingsView({
  state,
  reload,
  toast,
  onNavigate,
  queue,
  sync,
  syncing,
  logout,
}) {
  const [form, setForm] = useState({
      ownerName: "Aidan",
      timezone: "America/Toronto",
      maxPhone: "",
      danielPhone: "",
      followupRecipient: "Max",
      smsAutomationEnabled: false,
      smsAutomationPaused: false,
      followupTime: "19:08",
      followupDaysAhead: 2,
      followupRequiredFields: [
        "address",
        "areaSqft",
        "system",
        "arrivalTime",
        "access",
        "scope",
        "crew",
      ],
      ...state.settings,
    }),
    [status, setStatus] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pushBusy, setPushBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    request("/api/integrations/status")
      .then(setStatus)
      .catch(() => setStatus({ unavailable: true }));
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          followupDaysAhead: Number(form.followupDaysAhead),
        }),
      });
      await reload();
      toast("Settings saved.");
      setStatus(await request("/api/integrations/status"));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const enablePush = async () => {
    setPushBusy(true);
    setError("");
    try {
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      )
        throw new Error(
          "Install this app on your iPhone Home Screen, open it there, and try again. Push needs iOS 16.4 or later and HTTPS.",
        );
      if (!window.isSecureContext)
        throw new Error(
          "Notifications need this app to be hosted at its own HTTPS address.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Notifications are not allowed. You can change this in your phone settings.",
        );
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const data = await request("/api/push/public-key");
      if (!data.configured)
        throw new Error(
          data.error || "The push service is not configured on the server.",
        );
      const key = data.publicKey || data.key;
      const padding = "=".repeat((4 - (key.length % 4)) % 4);
      const raw = atob((key + padding).replace(/-/g, "+").replace(/_/g, "/"));
      const applicationServerKey = Uint8Array.from(
        [...raw].map((c) => c.charCodeAt(0)),
      );
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription)
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      await request("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ subscription }),
      });
      toast("This device is registered for notifications.");
      setStatus(await request("/api/integrations/status"));
    } catch (e) {
      setError(errText(e));
    } finally {
      setPushBusy(false);
    }
  };
  const download = async () => {
    try {
      const backup = await request("/api/backup");
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hardbond-backup-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast("Backup downloaded. Keep it private.");
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <div className="stack page-enter">
      <SectionHead
        eyebrow="MAKE IT WORK YOUR WAY"
        title="Your app. Your rules."
        description="Adjust daily preferences here. Service connections are configured securely on your host."
      />
      <div className="settings-grid">
        <div className="stack">
          <Card>
            <div className="card-heading">
              <div>
                <p className="eyebrow">STANDALONE ON IPHONE</p>
                <h2>Add HARDBOND to your Home Screen</h2>
              </div>
              <Smartphone size={27} />
            </div>
            <ol className="install-steps">
              <li>Open this app’s HTTPS address in Safari.</li>
              <li>
                Tap <strong>Share → Add to Home Screen → Add.</strong>
              </li>
              <li>
                Open HARDBOND from its icon, sign in, then enable notifications
                here.
              </li>
            </ol>
            <p className="muted small">
              Works separately from ChatGPT. App Store distribution is a
              separate release; this version installs from Safari.
            </p>
            <Button kind="primary" onClick={enablePush} disabled={pushBusy}>
              <Bell size={17} />
              {pushBusy ? "Connecting…" : "Enable this device’s notifications"}
            </Button>
          </Card>
          <form onSubmit={submit} className="stack">
            <Card>
              <h2>Personal preferences</h2>
              <div className="form-grid">
                <Field label="Your name">
                  <input
                    value={form.ownerName}
                    onChange={(e) => set("ownerName", e.target.value)}
                    required
                  />
                </Field>
                <Field
                  label="Evening Daily Sheet reminder"
                  hint="Only prompts for scheduled jobs or drafts still needing review. Clear to disable."
                >
                  <input
                    type="time"
                    value={form.notificationTime ?? "20:00"}
                    onChange={(e) => set("notificationTime", e.target.value)}
                  />
                </Field>
                <Field label="Time zone">
                  <select
                    value={form.timezone}
                    onChange={(e) => set("timezone", e.target.value)}
                  >
                    <option value="America/Toronto">Toronto / Eastern</option>
                  </select>
                </Field>
              </div>
            </Card>
            <Card>
              <div className="card-heading">
                <div>
                  <p className="eyebrow">MISSING JOB DETAILS</p>
                  <h2>Automatic follow-up texts</h2>
                </div>
                <MessageSquareText />
              </div>
              <p className="muted">
                One scheduled digest asks for the missing fields on upcoming
                jobs. The connected SMS service sends it independently of your
                phone.
              </p>
              <div className="form-grid">
                <Field label="Max’s confirmed mobile number">
                  <input
                    type="tel"
                    value={form.maxPhone}
                    onChange={(e) => set("maxPhone", e.target.value)}
                    placeholder="+1…"
                  />
                </Field>
                <Field label="Daniel’s confirmed mobile number">
                  <input
                    type="tel"
                    value={form.danielPhone}
                    onChange={(e) => set("danielPhone", e.target.value)}
                    placeholder="+1…"
                  />
                </Field>
                <Field label="Send follow-ups to">
                  <select
                    value={form.followupRecipient}
                    onChange={(e) => set("followupRecipient", e.target.value)}
                  >
                    <option value="Max">Max</option>
                    <option value="Daniel">Daniel</option>
                  </select>
                </Field>
                <Field label="Daily send time (Toronto)">
                  <input
                    type="time"
                    required
                    value={form.followupTime}
                    onChange={(e) => set("followupTime", e.target.value)}
                  />
                </Field>
                <Field label="Look ahead (days)">
                  <input
                    type="number"
                    min="1"
                    max="14"
                    value={form.followupDaysAhead}
                    onChange={(e) => set("followupDaysAhead", e.target.value)}
                  />
                </Field>
              </div>
              <h3>Ask when these details are missing</h3>
              <div className="checkbox-grid">
                {Object.entries(fieldNames).map(([k, label]) => (
                  <label className="checkbox" key={k}>
                    <input
                      type="checkbox"
                      checked={form.followupRequiredFields.includes(k)}
                      onChange={(e) =>
                        set(
                          "followupRequiredFields",
                          e.target.checked
                            ? [...form.followupRequiredFields, k]
                            : form.followupRequiredFields.filter(
                                (x) => x !== k,
                              ),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="toggle-row">
                <div>
                  <strong>Enable automatic texts</strong>
                  <span>
                    Sends only after your provider and recipient are configured.
                  </span>
                </div>
                <input
                  type="checkbox"
                  role="switch"
                  checked={form.smsAutomationEnabled}
                  onChange={(e) =>
                    set("smsAutomationEnabled", e.target.checked)
                  }
                />
              </label>
              <label className="toggle-row">
                <div>
                  <strong>Pause automatic texts</strong>
                  <span>Keep the rules and drafts; stop scheduled sends.</span>
                </div>
                <input
                  type="checkbox"
                  role="switch"
                  checked={form.smsAutomationPaused}
                  onChange={(e) => set("smsAutomationPaused", e.target.checked)}
                />
              </label>
              <ArrowLink onClick={() => onNavigate("followups")}>
                Inspect planned messages and delivery history
              </ArrowLink>
            </Card>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button kind="primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save preferences"}
              <Save size={16} />
            </Button>
          </form>
        </div>
        <div className="stack">
          <Card>
            <p className="eyebrow">CONNECTIONS</p>
            <h2>What’s connected</h2>
            <ConnectionStatus status={status} />
            <CalendarSubscription toast={toast} />
            <p className="muted small">
              TimeTree remains your team schedule. Imports are explicit; this
              app does not claim a live TimeTree connection.
            </p>
            <Button onClick={() => onNavigate("calendar")}>
              Calendar import / export
              <CalendarDays size={16} />
            </Button>
          </Card>
          <Card>
            <p className="eyebrow">YOUR RECORDS</p>
            <h2>Backup and sync</h2>
            <p className="muted">
              Download your jobs, records and preferences. Your server keeps the
              shared copy; offline changes remain on this device until synced.
            </p>
            <Button onClick={download}>
              <Download size={16} />
              Download backup
            </Button>
            <div className="divider" />
            <div className="row-between">
              <strong>
                {queue.length} pending change{queue.length === 1 ? "" : "s"}
              </strong>
              <Button onClick={sync} disabled={syncing}>
                <RefreshCw size={15} />
                Sync
              </Button>
            </div>
            {queue.map((q, i) => (
              <div className="queue-item" key={q.id || i}>
                <strong>
                  {q.collection || "Record"} ·{" "}
                  {q.operation || q.method || "edit"}
                </strong>
                <small>
                  {q.error ||
                    q.conflict ||
                    q.status ||
                    "Waiting for connection"}
                </small>
                {q.status !== "pending" && (
                  <>
                    <details>
                      <summary>View retained edit</summary>
                      <pre className="conflict-json">
                        {JSON.stringify(q.record, null, 2)}
                      </pre>
                    </details>
                    <Button
                      kind="danger"
                      onClick={async () => {
                        if (
                          window.confirm(
                            "Discard this retained device edit and use the server record? This cannot be undone.",
                          )
                        ) {
                          discardQueued(q.id);
                          await reload();
                          toast("Local edit discarded. Server record kept.");
                        }
                      }}
                    >
                      Discard local edit
                    </Button>
                  </>
                )}
              </div>
            ))}
            {queue.some(
              (q) => q.error || q.conflict || q.status === "conflict",
            ) && (
              <p className="notice">
                A conflicting edit has been kept on this device. Compare it with
                the server record before resolving; retrying will not overwrite
                newer work.
              </p>
            )}
            <div className="divider" />
            <Button onClick={logout}>
              <LogOut size={16} />
              Sign out
            </Button>
          </Card>
          <Card className="soft-card">
            <ShieldCheck size={24} />
            <h3>Private by design</h3>
            <p className="muted">
              Your app requires a password. Customer details, material records
              and notes remain in your private workspace. Backup files contain
              private data too.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
function ConnectionStatus({ status }) {
  if (!status) return <p className="muted">Checking connections…</p>;
  if (status.unavailable)
    return (
      <p className="notice">
        Connection status is unavailable while the server is unreachable.
      </p>
    );
  const push = status.push || {},
    sms = status.sms || {};
  return (
    <div className="connection-list">
      <div>
        <span>Phone notifications</span>
        <Badge
          tone={
            (push.subscriptionCount || status.pushSubscriptions) > 0
              ? "success"
              : "warning"
          }
        >
          {(push.subscriptionCount || status.pushSubscriptions) > 0
            ? "Device registered"
            : "Connect this device"}
        </Badge>
      </div>
      <div>
        <span>Automatic SMS</span>
        <Badge
          tone={
            sms.credentialsConfigured || status.smsConfigured
              ? "success"
              : "warning"
          }
        >
          {sms.credentialsConfigured || status.smsConfigured
            ? "Provider connected"
            : "Provider needed"}
        </Badge>
      </div>
      <div>
        <span>TimeTree live sync</span>
        <Badge>Not connected</Badge>
      </div>
      <div>
        <span>Calendar files</span>
        <Badge tone="success">Import / export</Badge>
      </div>
    </div>
  );
}

function CalendarSubscription({ toast }) {
  const [link, setLink] = useState(null),
    [active, setActive] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request("/api/integrations/calendar/subscription")
      .then((s) => setActive(s.active))
      .catch(() => {});
  }, []);
  async function create() {
    if (
      active &&
      !window.confirm(
        "Create a replacement calendar link? Your old subscription link will stop working.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await request("/api/integrations/calendar/subscription", {
        method: "POST",
      });
      setLink(result);
      setActive(true);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (
      !window.confirm(
        "Disable the calendar feed? Your phone calendar will no longer receive these updates.",
      )
    )
      return;
    try {
      await request("/api/integrations/calendar/subscription", {
        method: "DELETE",
      });
      setLink(null);
      setActive(false);
      toast("Calendar subscription disabled.");
    } catch (e) {
      setError(errText(e));
    }
  }
  return (
    <div className="calendar-subscription">
      <h3>Keep your iPhone calendar updated</h3>
      <p className="muted small">
        Subscribe to HARDBOND’s private feed. Job dates and local events update
        when your calendar refreshes. This does not write back to TimeTree.
      </p>
      <Button onClick={create} disabled={busy}>
        {busy
          ? "Creating…"
          : active
            ? "Create replacement link"
            : "Create calendar subscription"}
      </Button>
      {link && (
        <>
          <p className="notice">
            Keep this link private. Anyone with it can read your job calendar.
          </p>
          <a className="btn btn-primary" href={link.subscribeUrl}>
            Add to iPhone Calendar
          </a>
          <label className="field">
            <span>Private subscription URL</span>
            <input
              readOnly
              value={link.url}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </>
      )}
      {active && (
        <Button kind="danger" onClick={revoke}>
          Disable subscription
        </Button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
