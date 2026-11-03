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
                page.goto(base + "/?view=calendar")
                expect(page.get_by_role("heading",name="TimeTree via Windows",exact=True)).to_be_visible()
                expect(page.get_by_text("Windows PC not paired",exact=True)).to_be_visible()
                page.get_by_role("button",name="Pair Windows PC",exact=True).click()
                expect(page.get_by_label("Windows pairing key")).to_be_visible()
                token=page.get_by_label("Windows pairing key").input_value()
                assert len(token)==43
                client=p.request.new_context(base_url=base,extra_http_headers={"Authorization":"Bearer "+token})
                root="/api/integrations/timetree-bridge"
                assert client.get("/api/state").status==401
                assert client.get(root).status==401
                assert client.post(root+"/pair",data={}).status==401
                assert client.post(root+"/control",data={"action":"resume"}).status==401
                response=client.post(root+"/poll",data={"version":"0.2.0"})
                assert response.ok,response.text()
                command=response.json()["request"]
                assert command["kind"]=="inspect-calendar"
                result=client.post(root+"/result",data={"requestId":command["id"],"observation":"events-observed","report":{"eventResponseShapes":[{"events":{"type":"array","count":1,"sample":{"title":"string","start_at":"number"}}}]}})
                assert result.ok,result.text()
                page.reload()
                expect(page.get_by_text("Windows helper online",exact=True)).to_be_visible()
                expect(page.get_by_label("Windows pairing key")).to_have_count(0)
                expect(page.get_by_text("Event response structures received — mapping review needed",exact=True)).to_be_visible()
                expect(page.get_by_role("button",name="Download connection diagnostics",exact=True)).to_be_visible()
                page.get_by_role("button",name="Check TimeTree connection",exact=True).click()
                expect(page.get_by_text("Connection check queued — waiting for the PC",exact=True)).to_be_visible()
                page.get_by_role("button",name="Enable connection checks",exact=True).click()
                page.get_by_role("button",name="Pause connection checks",exact=True).click()
                expect(page.get_by_role("button",name="Enable connection checks",exact=True)).to_be_visible()
                assert client.post(root+"/poll",data={"version":"0.2.0"}).json()["request"] is None
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"),"Calendar bridge overflows mobile"
                page.once("dialog",lambda d:d.accept())
                page.get_by_role("button",name="Disconnect Windows PC",exact=True).click()
                expect(page.get_by_text("Windows PC not paired",exact=True)).to_be_visible()
                assert client.post(root+"/poll",data={"version":"0.2.0"}).status==401
                assert page.request.get(base+"/api/state").json()["calendarEvents"]==[]
                assert not errors,errors
                client.dispose()
                browser.close()
                print("PASS Windows bridge: owner-only pairing/controls, scoped client auth, diagnostic transfer, pause, revocation and mobile layout; no event sync claimed")
        finally:
            server.terminate()
            try: server.wait(timeout=5)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
