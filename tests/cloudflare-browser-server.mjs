// Test-only server launcher: generated credentials/state arrive from the browser
// runner, never from a real Cloudflare account or published Worker.
import { join } from "node:path";
process.env.XDG_CONFIG_HOME ||= join(process.env.DATA_DIR, "config");
process.env.WRANGLER_SEND_METRICS = "false";
const { unstable_dev } = await import("wrangler");
const worker = await unstable_dev("cloudflare/worker.js", {
  config: "wrangler.jsonc",
  ip: "127.0.0.1",
  port: Number(process.env.PORT),
  inspectorPort: 0,
  local: true,
  persistTo: join(process.env.DATA_DIR, "state"),
  logLevel: "error",
  vars: {
    OWNER_PASSWORD: process.env.OWNER_PASSWORD,
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_FROM_NUMBER: "",
  },
  experimental: {
    disableExperimentalWarning: true,
    disableDevRegistry: true,
    watch: false,
  },
});
console.log("HARDBOND Cloudflare browser test server ready");
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await worker.stop();
    process.exit(0);
  });
