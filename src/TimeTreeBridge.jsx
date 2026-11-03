import React, { useEffect, useState } from "react";
import { request } from "./api.js";
import { Button, Card } from "./ui.jsx";
const root = "/api/integrations/timetree-bridge";
const time = (v) => (v ? new Date(v).toLocaleString() : "Not yet");
export default function TimeTreeBridge() {
  const [status, setStatus] = useState(null),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        const s = await request(root);
        if (active) {
          setStatus(s);
          setError("");
        }
      } catch (e) {
        if (active) setError(e.message);
      }
    }
    read();
    const timer = setInterval(read, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function act(path, body = {}) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await request(root + path, { method: "POST", body });
      setStatus(next.status || next);
      if (next.token) setToken(next.token);
      if (path === "/disconnect") setToken("");
      if (body.action === "refresh")
        setMessage(
          "Connection check requested. The Windows helper must be running. This does not import events.",
        );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const blob = new Blob([JSON.stringify(status.diagnostics, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "connection-diagnostics.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Card className="field-plan-summary stack">
      <h2>TimeTree via Windows</h2>
      <p>
        Sign into TimeTree once on your Windows PC, then manage its connection
        here from your iPhone. Keep the PC awake and the helper running.
      </p>
      <p>
        <strong>Event transfer is not enabled yet.</strong> This stage pairs the
        PC and checks the signed-in calendar. Event mapping and complete date
        coverage still need validation before automatic imports.
      </p>
      {status && (
        <>
          <p>
            <strong>
              {!status.paired
                ? "Windows PC not paired"
                : status.online
                  ? "Windows helper online"
                  : "Windows helper offline / not started"}
            </strong>
            <br />
            Last PC contact: {time(status.lastSeen)}
            <br />
            Last calendar connection check: {time(status.lastCheck)}
          </p>
          {status.paired && (
            <p>
              {status.requestId
                ? "Connection check queued — waiting for the PC"
                : status.observation === "events-observed"
                  ? "Event response structures received — mapping review needed"
                  : status.observation === "no-events"
                    ? "No event response observed — sign in or inspect the calendar on Windows"
                    : status.observation === "browser-unavailable"
                      ? "Windows could not open the calendar — check its browser window"
                      : "Calendar connection not checked"}
            </p>
          )}
          <div className="field-plan-buttons">
            <Button
              kind="primary"
              disabled={busy}
              onClick={() => {
                if (
                  !status.paired ||
                  window.confirm(
                    "Replace the current pairing key? The old Windows connection will be disconnected.",
                  )
                )
                  act("/pair");
              }}
            >
              {status.paired ? "Replace Windows pairing" : "Pair Windows PC"}
            </Button>
            {status.paired && (
              <>
                <Button
                  disabled={busy || !!status.requestId}
                  onClick={() => act("/control", { action: "refresh" })}
                >
                  Check TimeTree connection
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    act("/control", {
                      action: status.paused ? "resume" : "pause",
                    })
                  }
                >
                  {status.paused
                    ? "Enable connection checks"
                    : "Pause connection checks"}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Revoke this PC’s HARDBOND pairing? Its local TimeTree login remains on that PC.",
                      )
                    )
                      act("/disconnect");
                  }}
                >
                  Disconnect Windows PC
                </Button>
              </>
            )}
          </div>
          {status.paired && (
            <small>
              {status.paused
                ? "Periodic checks paused. Manual checks can still be requested."
                : "Connection checks every five minutes while Windows is running."}{" "}
              No calendar events are uploaded by this version.
            </small>
          )}
          {status.diagnostics && (
            <Button onClick={download}>Download connection diagnostics</Button>
          )}
        </>
      )}
      {token && (
        <div className="stack">
          <strong>Pairing key — shown only now</strong>
          <p>
            Open this HARDBOND page on your Windows PC and paste this key into
            its setup window. It grants access only to this connector’s checks,
            not your owner account. Do not send it in chat.
          </p>
          <input aria-label="Windows pairing key" readOnly value={token} />
          <div className="field-plan-buttons">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(token);
                  setMessage(
                    "Pairing key copied. Paste it only into the Windows setup.",
                  );
                } catch {
                  setMessage("Select and copy the pairing key manually.");
                }
              }}
            >
              Copy pairing key
            </Button>
            <Button onClick={() => setToken("")}>Hide key</Button>
          </div>
        </div>
      )}
      <details>
        <summary>Windows setup steps</summary>
        <ol>
          <li>
            Download and extract the Windows setup ZIP supplied in chat. Install
            Node.js LTS if needed.
          </li>
          <li>
            Open HARDBOND on Windows. Click Pair Windows PC here and copy the
            pairing key.
          </li>
          <li>
            Run Start-Windows.cmd and paste the key when prompted. Sign into
            TimeTree in the opened browser.
          </li>
          <li>
            Open an event and move to another month, then press Enter in the
            setup window.
          </li>
          <li>
            Leave the helper running. Return here on iPhone to check its status.
            Download the diagnostics and attach that file in our chat to finish
            validating event mapping.
          </li>
        </ol>
      </details>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </Card>
  );
}
