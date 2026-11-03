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
                response = page.request.post(base + "/api/records/jobs", data={"id":"crew-job", "title":"PRIVATE $4500 job", "address":"123 TEST Street", "bookingStatus":"confirmed"})
                assert response.ok, response.text()
                page.goto(base + "/?view=crew")
                page.get_by_role("button", name="Task cards", exact=True).click()
                page.get_by_role("button", name="Load 35 source cards", exact=True).click()
                expect(page.get_by_role("button",name="Loading cards…")).to_have_count(0, timeout=30000)
                page.get_by_label("Choose task card").select_option("A1")
                expect(page.get_by_label("Complete task instructions")).to_contain_text("YOU NEED")
                page.get_by_label("Reviewed by",exact=True).fill("TEST lead")
                page.get_by_label("I checked this saved revision",exact=False).check()
                page.get_by_role("button",name="Save card",exact=True).click()
                expect(page.get_by_role("button",name="Withdraw approval",exact=True)).to_be_visible()
                page.get_by_role("button",name="Workers",exact=True).click()
                page.get_by_role("button",name="Add worker",exact=True).click()
                page.get_by_label("Worker name",exact=True).fill("TEST helper")
                page.get_by_label("Phone / contact",exact=True).fill("555-0101")
                page.get_by_label("A1 ·",exact=False).select_option("SOLO")
                page.get_by_role("button",name="Save worker",exact=True).click()
                expect(page.get_by_role("button",name="Edit TEST helper",exact=True)).to_be_visible()
                page.get_by_role("button",name="Day plan",exact=True).click()
                page.get_by_label("Crew plan date").fill("2026-11-04")
                page.get_by_label("Lead name and contact number").fill("TEST lead 555-0100")
                worker=page.request.get(base + "/api/state").json()["workers"][0]
                page.get_by_label("Worker to add").select_option(worker["id"])
                page.get_by_role("button",name="Add to day",exact=True).click()
                page.get_by_label("Availability checked for TEST helper",exact=True).check()
                page.get_by_label("Arrival time · TEST helper",exact=True).fill("08:00")
                page.get_by_label("Meet / transport · TEST helper",exact=True).fill("Own vehicle; meet at site")
                page.get_by_label("Job for new assignments",exact=True).select_option("crew-job")
                page.get_by_label("Preset or individual task",exact=True).select_option("A1")
                page.get_by_role("button",name="Add assignments",exact=True).click()
                page.get_by_role("button",name="Save day plan",exact=True).click()
                expect(page.get_by_role("button",name="Review worker brief",exact=True)).to_be_enabled()
                page.get_by_role("button",name="Review worker brief",exact=True).click()
                expect(page.locator(".crew-brief")).to_contain_text("123 TEST Street")
                expect(page.locator(".crew-brief")).not_to_contain_text("PRIVATE")
                page.once("dialog",lambda d:d.accept())
                page.get_by_role("button",name="I reviewed and sent this brief",exact=True).click()
                expect(page.get_by_role("button",name="Record confirmation",exact=True)).to_be_enabled()
                page.once("dialog",lambda d:d.accept())
                page.get_by_role("button",name="Record confirmation",exact=True).click()
                expect(page.get_by_text("Confirmation recorded:",exact=False)).to_be_visible()
                page.get_by_label("Result · assignment 1 · TEST helper",exact=True).select_option("partial")
                page.get_by_label("Result note · assignment 1 · TEST helper",exact=True).fill("TEST remaining equipment needs pickup")
                page.get_by_role("button",name="Save assignments / results",exact=True).click()
                expect(page.get_by_role("button",name="Save assignments / results",exact=True)).to_be_disabled()
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Crew plan overflows mobile"
                page.get_by_role("button",name="History",exact=True).click()
                expect(page.get_by_text("TEST remaining equipment needs pickup",exact=True)).to_be_visible()
                page.get_by_role("button",name="Trailer checks",exact=True).click()
                page.get_by_label("Checked by",exact=True).fill("TEST lead")
                page.get_by_label("Return equipment to labeled locations; secure heavy items",exact=True).check()
                page.get_by_label("Missing / broken / unresolved notes",exact=True).fill("TEST missing hose; action created")
                page.get_by_role("button",name="Save trailer check",exact=True).click()
                expect(page.get_by_text("1/6 checked",exact=True)).to_be_visible()
                page.get_by_role("button",name="How to use",exact=True).click()
                expect(page.get_by_role("heading",name="Your daily and weekly routine",exact=True)).to_be_visible()
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Guide overflows mobile"
                page.reload()
                page.get_by_label("Crew plan date").fill("2026-11-04")
                expect(page.get_by_label("Result · assignment 1 · TEST helper",exact=True)).to_have_value("partial")
                expect(page.get_by_text("Confirmation recorded:",exact=False)).to_be_visible()
                page.get_by_label("Arrival time · TEST helper",exact=True).fill("09:00")
                page.get_by_role("button",name="Save day plan",exact=True).click()
                expect(page.get_by_text("Confirmation recorded:",exact=False)).to_have_count(0)
                expect(page.get_by_role("button",name="Record confirmation",exact=True)).to_be_disabled()
                assert not errors, errors
                browser.close()
                print("PASS crew workflow: source cards, approval, roster, brief privacy, confirmation, results, history, trailer, mobile guide and persistence")
        finally:
            server.terminate()
            try: server.wait(timeout=5)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
