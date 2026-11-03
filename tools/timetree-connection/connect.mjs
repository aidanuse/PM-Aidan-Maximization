import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { shape, isEventResponse } from "./diagnostics.mjs";
const folder = join(process.env.LOCALAPPDATA || homedir(), "HardbondTimeTree");
await mkdir(folder, { recursive: true });
const input = createInterface({ input: process.stdin, output: process.stdout });
let context;
try {
  context = await chromium.launchPersistentContext(
    join(folder, "browser-profile"),
    { headless: false, viewport: null },
  );
  const page = await context.newPage();
  const samples = [];
  const pending = new Set();
  page.on("response", (response) => {
    const task = (async () => {
      try {
        if (
          !isEventResponse(
            response.url(),
            response.status(),
            response.headers()["content-type"] || "",
          )
        )
          return;
        if (samples.length >= 12) return;
        const length = Number(response.headers()["content-length"] || 0);
        if (length > 2_000_000) return;
        const body = await response.body();
        if (body.length > 2_000_000) return;
        const schema = shape(JSON.parse(body.toString("utf8")));
        if (!samples.some((x) => JSON.stringify(x) === JSON.stringify(schema)))
          samples.push(schema);
      } catch {
        /* Failed/closed responses are not connection success. */
      }
    })();
    pending.add(task);
    task.finally(() => pending.delete(task));
  });
  console.log(
    "\nHARDBOND TimeTree connection setup — no events are uploaded by this setup tool.",
  );
  console.log(
    "Sign into TimeTree in the browser window. Do not paste your password or login cookies into chat.",
  );
  await page.goto("https://timetreeapp.com/calendars/KuVNdUmWh92w", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await input.question(
    "\nOnce you can see your calendar, open an event and move to another month, then press Enter here. ",
  );
  await Promise.allSettled([...pending]);
  const report = {
    toolVersion: "0.1.0",
    capturedAt: new Date().toISOString(),
    eventResponseShapes: samples,
    transferEnabled: false,
  };
  const reportPath = join(folder, "connection-diagnostics.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nSaved private browser session locally in ${folder}.`);
  console.log(
    samples.length
      ? `Observed ${samples.length} event-response structure(s). This does not yet verify complete calendar coverage.`
      : "No event response captured. Authentication or the extraction method still needs checking; no successful sync is claimed.",
  );
  console.log(`Diagnostic report (field names/types only): ${reportPath}`);
  console.log(
    "Share only connection-diagnostics.json for the next integration step. Never share the browser-profile folder.",
  );
  await input.question(
    "\nPress Enter to close the browser. The local session will be reused next time. ",
  );
} catch (error) {
  console.error(
    "Setup could not finish. Check your internet connection and close any other copy of this connector.",
  );
  console.error(error.name || "Setup error");
  process.exitCode = 1;
} finally {
  input.close();
  await context?.close();
}
