import { chromium } from "playwright";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { shape, isEventResponse } from "./diagnostics.mjs";
import { createBridgeClient } from "./bridge-client.mjs";
import { protect } from "./windows-key.mjs";
const folder = join(process.env.LOCALAPPDATA || homedir(), "HardbondTimeTree");
await mkdir(folder, { recursive: true });
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const input = createInterface({
  input: process.stdin,
  output,
  terminal: !!process.stdin.isTTY,
});
const keyPath = join(folder, "pairing-key.dpapi");
const calendar = "https://timetreeapp.com/calendars/KuVNdUmWh92w";
let context,
  stopping = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let token;
  try {
    token = protect(await readFile(keyPath, "utf8"), true);
  } catch (error) {
    if (error.code !== "ENOENT")
      console.log(
        "Saved pairing could not be read. Please pair this Windows user again.",
      );
  }
  if (!token) {
    console.log(
      "\nOpen HARDBOND → Calendar → TimeTree via Windows → Pair Windows PC.",
    );
    process.stdout.write(
      "Paste the pairing key here (hidden), then press Enter: ",
    );
    hidden = true;
    try {
      token = (await input.question("")).trim();
    } finally {
      hidden = false;
      process.stdout.write("\n");
    }
    if (!/^[-_A-Za-z0-9]{43}$/.test(token))
      throw new Error("Invalid pairing key");
    await writeFile(keyPath, protect(token));
  }
  const bridge = createBridgeClient(token);
  await bridge.poll(); // Verify pairing before launching a browser or collecting diagnostics.
  context = await chromium.launchPersistentContext(
    join(folder, "browser-profile"),
    { headless: false, viewport: null },
  );
  context.on("close", () => {
    stopping = true;
  });
  const page = await context.newPage();
  let samples = [];
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
        if (
          samples.length >= 12 ||
          Number(response.headers()["content-length"] || 0) > 2_000_000
        )
          return;
        const body = await response.body();
        if (body.length > 2_000_000) return;
        const schema = shape(JSON.parse(body.toString("utf8")));
        if (
          samples.length < 12 &&
          !samples.some((s) => JSON.stringify(s) === JSON.stringify(schema))
        )
          samples.push(schema);
      } catch {
        /* No raw responses or credential values are logged. */
      }
    })();
    pending.add(task);
    task.finally(() => pending.delete(task));
  });
  console.log(
    "\nPairing accepted. Sign into TimeTree in the browser. No calendar events are uploaded by this version.",
  );
  await page.goto(calendar, { waitUntil: "domcontentloaded", timeout: 60000 });
  await input.question(
    "Open your calendar, open an event and move to another month. Then press Enter here. ",
  );
  await Promise.allSettled([...pending]);
  console.log(
    "\nLeave this helper running. iPhone controls: HARDBOND → Calendar → TimeTree via Windows.",
  );
  console.log(
    "Close this window or press Ctrl+C to stop. Event mapping is still awaiting validation.",
  );
  input.close();
  let first = true;
  while (!stopping) {
    try {
      const control = await bridge.poll();
      if (control.request) {
        let observation = "no-events";
        try {
          if (!first) {
            samples = [];
            await page.goto(calendar, {
              waitUntil: "domcontentloaded",
              timeout: 45000,
            });
            await sleep(5000);
          }
          await Promise.allSettled([...pending]);
          observation = samples.length ? "events-observed" : "no-events";
        } catch {
          samples = [];
          observation = "browser-unavailable";
        }
        first = false;
        const report = {
          toolVersion: "0.2.0",
          capturedAt: new Date().toISOString(),
          eventResponseShapes: samples,
          transferEnabled: false,
        };
        await writeFile(
          join(folder, "connection-diagnostics.json"),
          JSON.stringify(report, null, 2),
        );
        await bridge.complete(control.request.id, observation, samples);
        console.log(
          `${new Date().toLocaleTimeString()} — ${observation === "events-observed" ? "Event structures sent for mapping review; no events imported." : observation === "no-events" ? "No event response observed. Check the TimeTree browser; you may need to sign in again." : "Browser check failed. Check the TimeTree window."}`,
        );
      }
    } catch (error) {
      if (error.status === 401) {
        await unlink(keyPath).catch(() => {});
        console.log(
          "Pairing revoked. Generate a new key in HARDBOND and restart this helper.",
        );
        break;
      }
      if (error.status !== 409)
        console.log(
          "HARDBOND is temporarily unreachable or rejected the check. Retrying; no successful sync is claimed.",
        );
    }
    if (!stopping) await sleep(15000);
  }
} catch (error) {
  if (error.status === 401) await unlink(keyPath).catch(() => {});
  console.error(
    error.status === 401
      ? "Pairing revoked. Generate a new key in HARDBOND, then run setup again."
      : "Setup stopped. Check Windows, your pairing key and internet connection. No automatic event transfer has been enabled.",
  );
  console.error(error.name || "Setup error");
  process.exitCode = 1;
} finally {
  input.close();
  await context?.close();
}
