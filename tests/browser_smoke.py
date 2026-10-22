"""Real browser workflow tests; isolated temporary database, fictional records, no real sends."""
import os,secrets,socket,subprocess,tempfile,time,json,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='hardbond-browser-') as data:
    sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
    password=secrets.token_urlsafe(24)
    env={**os.environ,'NODE_ENV':'test','OWNER_PASSWORD':password,'PORT':str(port),'HOST':'127.0.0.1','DATA_DIR':data,'PUBLIC_URL':'https://hardbond.example.test'}
    for key in ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER']:env.pop(key,None)
    log=open(Path(data)/'server.log','w')
    runtime=os.environ.get('HARDBOND_BROWSER_RUNTIME','node')
    entry='tests/cloudflare-browser-server.mjs' if runtime=='cloudflare' else 'server/index.js'
    server=subprocess.Popen(['node',entry],cwd=ROOT,env=env,stdout=log,stderr=log)
    base=f'http://127.0.0.1:{port}'
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(base+'/api/health');break
            except Exception:time.sleep(.1)
        else:
            log.flush()
            raise RuntimeError('Test server did not start: '+(Path(data)/'server.log').read_text())
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='America/Toronto')
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base)
            page.get_by_label('Password',exact=True).fill(password)
            page.get_by_role('button',name='Open my workspace').click()
            expect(page.get_by_role('heading',name="Let's get ahead, Aidan.")).to_be_visible()
            page.screenshot(path=str(ROOT/'test-results'/'desktop-overview.png'),full_page=True,animations='disabled')
            page.locator('.sidebar').get_by_role('button',name='Inventory',exact=True).click()
            page.get_by_role('button',name='Add item',exact=True).click()
            page.get_by_label('Item name',exact=True).fill('TEST MVB kits')
            page.get_by_label('Quantity in stock').fill('5')
            page.get_by_label('Storage location').fill('TEST trailer')
            page.locator('form').get_by_role('button',name='Add item',exact=True).click()
            expect(page.get_by_role('heading',name='TEST MVB kits',exact=True)).to_be_visible()
            page.locator('.sidebar').get_by_role('button',name='Jobs',exact=True).click()
            page.get_by_role('button',name='New job',exact=True).click()
            page.get_by_label('Job name',exact=True).fill('TEST Garage')
            page.get_by_label('Planned date',exact=True).fill('2026-10-20')
            page.get_by_role('button',name='Save job',exact=True).click()
            expect(page.get_by_role('heading',name='TEST Garage',exact=True)).to_be_visible()
            page.locator('.sidebar').get_by_role('button',name='Daily sheets',exact=True).click()
            page.get_by_role('button',name='New daily sheet',exact=True).click()
            page.screenshot(path=str(ROOT/'test-results'/'daily-form-debug.png'),full_page=True,animations='disabled')
            page.get_by_label('2. Job worked',exact=True).select_option(label='TEST Garage')
            page.get_by_label('5. Coats completed',exact=True).fill('TEST coat recorded')
            page.get_by_role('button',name='Add item',exact=True).click()
            page.get_by_label('Quantity',exact=True).fill('2')
            page.get_by_label('8. What tomorrow needs',exact=True).fill('TEST collect rollers')
            page.get_by_label('Remind me about tomorrow’s needs',exact=True).fill('2099-10-20T07:00')
            page.get_by_role('button',name='Review & save',exact=True).click()
            expect(page.get_by_role('heading',name='TEST Garage',exact=True)).to_be_visible()
            data_state=page.request.get(base+'/api/state').json()
            assert data_state['inventory'][0]['quantity']==3,data_state
            assert len(data_state['reminders'])==1 and data_state['reminders'][0]['body']=='TEST collect rollers'
            page.reload();expect(page.get_by_role('heading',name="Let's get ahead, Aidan.")).to_be_visible()
            assert page.request.get(base+'/api/state').json()['inventory'][0]['quantity']==3
            for route in ['jobs','daily','inventory','load','calendar','followups','actions','analysis','reminders','settings']:
                page.goto(base+'/?view='+route)
                expect(page.locator('main')).to_be_visible()
                assert not page.locator('body').inner_text().startswith('Connection needed')
            page.get_by_label('Your name',exact=True).fill('Aidan')
            page.get_by_role('button',name='Save preferences',exact=True).click()
            expect(page.get_by_role('status')).to_contain_text('Settings saved')
            page.set_viewport_size({'width':390,'height':844})
            page.goto(base)
            expect(page.get_by_role('heading',name="Let's get ahead, Aidan.")).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile overview overflows'
            page.screenshot(path=str(ROOT/'test-results'/'iphone-overview.png'),full_page=True,animations='disabled')
            page.get_by_role('navigation',name='Quick navigation').get_by_role('button',name='Daily sheet',exact=True).click()
            page.get_by_role('button',name='New daily sheet',exact=True).click()
            page.get_by_label('8. What tomorrow needs',exact=True).fill('TEST offline follow-up')
            context.set_offline(True)
            page.get_by_role('button',name='Save draft',exact=True).click()
            expect(page.get_by_text('Pending sync',exact=True)).to_be_visible()
            context.set_offline(False)
            page.wait_for_function("JSON.parse(localStorage.getItem('hardbond:v1:outbox')||'[]').length === 0")
            records=page.request.get(base+'/api/state').json()['dailySheets']
            assert len(records)==2 and any(r['tomorrowNeeds']=='TEST offline follow-up' for r in records)
            context.set_offline(True)
            page.reload()
            expect(page.get_by_role('heading',name="Let's get ahead, Aidan.")).to_be_visible()
            expect(page.get_by_text('Viewing your last saved records.',exact=False)).to_be_visible()
            context.set_offline(False)
            page.goto(base+'/?view=settings')
            page.get_by_role('button',name='Sign out',exact=True).last.click()
            expect(page.get_by_label('Password',exact=True)).to_be_visible()
            assert page.request.get(base+'/api/state').status==401
            assert not errors,errors
            print('PASS browser: private login, inventory, job, reviewed daily consumption, contextual reminder, persistence, all routes, settings, mobile layout, offline save/sync/reopen and logout')
            browser.close()
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill();server.wait()
        log.close()
