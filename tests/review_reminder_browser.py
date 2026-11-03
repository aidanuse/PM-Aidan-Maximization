"""Field-plan persistence, measurement and mobile checks with fictional, isolated data."""
import json, os, secrets, socket, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="hardbond-plan-") as data:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]
    password = secrets.token_urlsafe(24)
    env = {**os.environ, "NODE_ENV": "test", "OWNER_PASSWORD": password, "HOST": "127.0.0.1", "PORT": str(port), "DATA_DIR": data}
    for name in ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]: env.pop(name, None)
    with open(Path(data) / "server.log", "w") as log:
        entry = "tests/cloudflare-browser-server.mjs" if os.environ.get("HARDBOND_BROWSER_RUNTIME") == "cloudflare" else "server/index.js"
        server = subprocess.Popen(["node", entry], cwd=ROOT, env=env, stdout=log, stderr=log)
        base = f"http://127.0.0.1:{port}"
        try:
            for _ in range(200):
                try:
                    urllib.request.urlopen(base + "/api/health"); break
                except Exception: time.sleep(.1)
            else: raise RuntimeError("Server failed to start")
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), headless=True, args=["--no-sandbox"])
                page = browser.new_page(viewport={"width": 390, "height": 844})
                errors = []; page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(base)
                page.get_by_label("Password", exact=True).fill(password)
                page.get_by_role("button", name="Open my workspace").click()
                expect(page.get_by_role("heading", name="Let's get ahead, Aidan.")).to_be_visible()
                expect(page.get_by_text("Saved for later: operations approval review",exact=True)).to_be_visible()
                reminder_id="hardbond-operations-review-2026-11-03"
                records=page.request.get(base + "/api/state").json()["actions"]
                matches=[r for r in records if r["id"]==reminder_id]
                assert len(matches)==1
                assert "B2 needs Aidan" in matches[0]["notes"]
                page.reload()
                expect(page.get_by_text("Saved for later: operations approval review",exact=True)).to_be_visible()
                records=page.request.get(base + "/api/state").json()["actions"]
                assert len([r for r in records if r["id"]==reminder_id])==1
                record=matches[0];record["status"]="done"
                result=page.request.put(base + "/api/records/actions/"+reminder_id,data=record)
                assert result.ok,result.text()
                page.reload()
                expect(page.get_by_role("heading",name="Let's get ahead, Aidan.")).to_be_visible()
                expect(page.get_by_text("Saved for later: operations approval review",exact=True)).to_have_count(0)
                assert page.request.get(base + "/api/state").json()["actions"][0]["status"]=="done"
                assert not errors,errors
                browser.close()
                print("PASS deferred review reminder: creates once, full checklist stored, completion preserved")
        finally:
            server.terminate()
            try: server.wait(timeout=5)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
