import React, { useEffect, useState } from "react";
import { request } from "./api.js";
import { Button, Card } from "./ui.jsx";

export default function CalendarSync({ reload }) {
  const [status, setStatus] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    request("/api/integrations/calendar/sync")
      .then((s) => {
        if (live) setStatus(s);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function change(method, body) {
    setBusy(true);
    setError("");
    try {
      setStatus(
        await request("/api/integrations/calendar/sync", { method, body }),
      );
      if (method === "POST") await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const time = (value) =>
    value ? new Date(value).toLocaleString() : "Not yet";
  return (
    <Card className="field-plan-summary">
      <h2>Automatic calendar feed</h2>
      <p>
        A supported private HTTPS iCalendar subscription can bring new and
        changed events into HARDBOND every five minutes. This is one-way
        polling, not an instant TimeTree API connection.
      </p>
      {!status && !error && <p>Checking sync status…</p>}
      {status && (
        <>
          <p>
            <strong>
              {!status.configured
                ? "Feed not configured"
                : status.paused
                  ? "Automatic checks paused"
                  : "Automatic checks enabled"}
            </strong>
          </p>
          {!status.configured && (
            <details>
              <summary>How to connect a supported feed</summary>
              <p>
                First confirm that your calendar provider offers a private HTTPS
                iCalendar subscription. A shared invitation or calendar webpage
                is not a feed. In the existing Cloudflare Worker, add a runtime
                secret named <code>TIMETREE_FEED_URL</code> containing that
                subscription URL, then deploy/apply the secret change. Keep the
                URL private. Return here, run Sync now, review the result, then
                enable automatic checks.
              </p>
              <p>
                If TimeTree does not provide a feed or supported integration,
                this cannot read TimeTree directly. File import remains
                available; no connection has been established by installing this
                feature.
              </p>
            </details>
          )}
          <div className="field-plan-buttons">
            <Button
              disabled={busy || !status.configured}
              onClick={() => change("POST", {})}
            >
              {busy ? "Working…" : "Sync now"}
            </Button>
            <Button
              disabled={busy || !status.configured}
              onClick={() => change("PUT", { paused: !status.paused })}
            >
              {status.paused
                ? "Enable automatic checks"
                : "Pause automatic checks"}
            </Button>
          </div>
          <p>
            Last attempt: {time(status.lastAttempt)}
            <br />
            Last successful read: {time(status.lastSuccess)}
            {!status.paused && status.nextCheck && (
              <>
                <br />
                Next check due: {time(status.nextCheck)}
              </>
            )}
          </p>
          {status.lastError && (
            <p role="alert">
              {status.lastError} The last successful-read time is retained.
              Review records if an import was interrupted.
            </p>
          )}
          {status.lastReport && (
            <>
              <p>
                Last successful read: {status.lastReport.jobsCreated} jobs
                created · {status.lastReport.jobsUpdated} jobs updated ·{" "}
                {status.lastReport.conflicts.length} conflicts ·{" "}
                {status.lastReport.warnings.length} warnings.
              </p>
              {(status.lastReport.conflicts.length > 0 ||
                status.lastReport.warnings.length > 0) && (
                <details>
                  <summary>Review sync issues</summary>
                  <ul>
                    {status.lastReport.conflicts.map((c, i) => (
                      <li key={`c${i}`}>
                        {c.title}: {c.reason}
                      </li>
                    ))}
                    {status.lastReport.warnings.map((w, i) => (
                      <li key={`w${i}`}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          <small>
            Local crew assignments, materials and field plans are kept.
            Conflicting edits need review. Missing feed events are not deleted;
            explicit cancellations are flagged. Repeating events need individual
            occurrences. No changes are written back to TimeTree.
          </small>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </Card>
  );
}
