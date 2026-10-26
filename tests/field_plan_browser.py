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
                response = page.request.post(base + "/api/records/jobs", data={"id":"plan-job", "title":"TEST field plan", "date":"2099-01-01"})
                assert response.ok, response.text()
                response = page.request.post(base + "/api/records/inventory", data={"id":"plan-product","name":"TEST kit","exactProduct":"TEST fictional product","unit":"kit","quantity":5,"technical":{"source":"TEST source, fictional coverage for arithmetic test","checkedOn":"2026-10-23","coverageSqftPerUnit":400,"coverageConditions":"TEST specified kit and thickness"}})
                assert response.ok, response.text()
                page.goto(base + "/?view=inventory")
                page.get_by_role("button",name="Edit TEST kit",exact=True).click()
                page.get_by_text("Product reference · optional",exact=True).click()
                expect(page.get_by_label("Coverage per counting unit (sq ft / coat)",exact=True)).to_have_value("400")
                page.get_by_label("Storage, mixing and recoat reference notes",exact=True).fill("TEST storage note; confirm current SDS")
                page.get_by_role("button",name="Save item",exact=True).click()
                expect(page.get_by_role("button",name="Save item",exact=True)).to_have_count(0)
                assert page.request.get(base + "/api/state").json()["inventory"][0]["technical"]["handlingNotes"] == "TEST storage note; confirm current SDS"
                page.goto(base + "/?view=calendar")
                expect(page.get_by_role("heading",name="Automatic calendar feed",exact=True)).to_be_visible()
                expect(page.get_by_text("Feed not configured",exact=True)).to_be_visible()
                expect(page.get_by_role("button",name="Sync now",exact=True)).to_be_disabled()
                page.goto(base + "/?view=plan")
                page.get_by_text("Plan material quantities · optional", exact=True).click()
                page.get_by_label("Product for material plan", exact=True).select_option("plan-product")
                for label,value in [("Floor area (sq ft)","1000"),("Wall area (sq ft)","100"),("Number of coats","2"),("Planning allowance (%)","10")]: page.get_by_label(label,exact=True).fill(value)
                expect(page.get_by_text("Planned requirement: 7 kit",exact=True)).to_be_visible()
                expect(page.get_by_role("button",name="Set this product’s job requirement",exact=True)).to_be_disabled()
                page.get_by_label("I checked that this coverage, unit, thickness and conditions apply to this job",exact=True).check()
                page.get_by_role("button",name="Set this product’s job requirement",exact=True).click()
                page.get_by_label("Phase to add").select_option("preparation")
                page.get_by_role("button", name="Add phase", exact=True).click()
                page.get_by_label("Responsible person · phase 1").fill("TEST foreman")
                page.get_by_label("Target and crew assignments · phase 1").fill("North zone; TEST helper on edges")
                page.get_by_label("Status · phase 1").select_option("held")
                page.get_by_label("Handover / hold reason · phase 1").fill("Confirm specified profile")
                page.get_by_role("button", name="Save field plan", exact=True).click()
                expect(page.get_by_text("Field plan saved.", exact=True)).to_be_visible()
                page.reload()
                expect(page.get_by_label("Responsible person · phase 1")).to_have_value("TEST foreman")
                expect(page.get_by_label("Status · phase 1")).to_have_value("held")
                saved = page.request.get(base + "/api/state").json()
                assert saved["jobs"][0]["materials"] == [{"inventoryId":"plan-product","quantity":7}]
                assert saved["jobs"][0]["materialEstimates"][0]["coverage"] == 400
                assert saved["inventory"][0]["quantity"] == 5, "Planning must not consume stock"
                page.get_by_label("Responsible person · phase 1").fill("UNSAVED")
                page.once("dialog", lambda dialog: dialog.dismiss())
                page.get_by_role("button", name="Record today’s work", exact=True).click()
                expect(page.get_by_label("Responsible person · phase 1")).to_have_value("UNSAVED")
                page.get_by_role("button", name="Save field plan", exact=True).click()
                expect(page.get_by_text("Field plan saved.", exact=True)).to_be_visible()
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Plan overflows mobile width"
                Path(ROOT / "test-results").mkdir(exist_ok=True)
                page.screenshot(path=str(ROOT / "test-results" / "field-plan-mobile.png"), full_page=True)
                page.get_by_role("button", name="Record today’s work", exact=True).click()
                expect(page.get_by_label("2. Job worked", exact=True)).to_have_value("plan-job")
                expect(page.get_by_text("Confirm specified profile", exact=False)).to_be_visible()
                page.get_by_text("Production measurement · optional", exact=True).click()
                page.get_by_label("Measured phase", exact=True).select_option("preparation")
                page.get_by_label("Area actually completed (sq ft)", exact=True).fill("800")
                page.get_by_label("Phase elapsed time (minutes)", exact=True).fill("120")
                page.get_by_label("Area, elapsed time and all crew intervals refer to this same phase", exact=True).check()
                page.get_by_role("button", name="Review & save", exact=True).click()
                expect(page.get_by_role("dialog")).to_have_count(0)
                page.goto(base + "/?view=analysis")
                expect(page.get_by_text("400 sq ft / elapsed hour", exact=False)).to_be_visible()
                expect(page.get_by_text("Labor rate: complete crew clocks needed", exact=False)).to_be_visible()
                page.goto(base + "/?view=plan")
                expect(page.get_by_text("Reviewed handover", exact=False)).to_be_visible()
                assert not errors, errors
                browser.close()
                print("PASS field plan: mobile layout, save/reload, hold notes, unsaved-edit guard, measured Daily Sheet, honest analysis and reviewed handover")
        finally:
            server.terminate()
            try: server.wait(timeout=5)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
