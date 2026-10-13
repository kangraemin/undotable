"""Browser smoke test: sample teardown end to end in real Chromium.
python3 tests/e2e/smoke.py [--width 390] [--shots DIR]
Serves the repo, loads the sample, checks boxes appear, walks Put it back, runs a lookup.
"""
import argparse, http.server, functools, threading, json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument('--width', type=int, default=1100)
ap.add_argument('--shots', default='')
a = ap.parse_args()
shots = Path(a.shots) if a.shots else None
if shots: shots.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_port}/'
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg, flush=True)
    if not cond: fails.append(msg)
def shot(page, name):
    if shots: page.screenshot(path=str(shots / f'{a.width}-{name}.png'), full_page=False)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': a.width, 'height': 860 if a.width > 600 else 844}, device_scale_factor=1)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(url)
    check(page.locator('h1').inner_text().startswith('Undo for the stuff'), 'home headline')
    shot(page, '1-home')
    t0 = time.time()
    page.get_by_role('button', name='Try the sample').click()
    # 6 photos -> 5 comparisons; first run downloads models
    page.wait_for_function("document.querySelectorAll('.filmstrip .thumb').length === 6 && document.getElementById('busy').hidden", timeout=600000)
    page.wait_for_timeout(500)
    print(f'sample processed in {time.time()-t0:.0f}s')
    counts = page.eval_on_selector_all('.filmstrip .thumb i', 'els => els.map(e => e.textContent)')
    check(len(counts) >= 4, f'parts found on at least 4 of 5 steps (got {len(counts)}: {counts})')
    page.locator('.filmstrip .thumb').nth(2).click()
    check(page.locator('.stage .box').count() >= 1, 'step 3 shows a box')
    check('spinner cap' in page.locator('.parts').inner_text() or page.locator('.parts input').count() > 0, 'step 3 lists a part')
    shot(page, '2-record-step3')
    page.get_by_role('button', name='Put it back →').click()
    check('parts back' in page.locator('.count-line').inner_text(), 'put-it-back counter')
    shot(page, '3-back')
    # look up a sample loose part (spinner cap = part3)
    page.locator('[data-sample="part3.jpg"]').click()
    page.wait_for_selector('#sheet[open] h2', timeout=300000)
    page.wait_for_function("!document.querySelector('#sheet .sheet-in').textContent.includes('Looking for a match')", timeout=300000)
    h = page.locator('#sheet h2').inner_text()
    print('lookup heading:', h)
    check(h.startswith(('It goes here', 'Not sure', 'No close match')), 'lookup answered')
    shot(page, '4-lookup')
    # every sample loose part, as a person would try them (part N came off at step N)
    page.locator('#sheet [data-close]').first.click()
    page.wait_for_function("!document.querySelector('#sheet[open]')")
    got = []
    for k in range(1, 6):
        page.locator(f'[data-sample="part{k}.jpg"]').click()
        page.wait_for_selector('#sheet[open] h2', timeout=300000)
        page.wait_for_function("!document.querySelector('#sheet .sheet-in').textContent.includes('Looking for a match')", timeout=300000)
        head = page.locator('#sheet h2').inner_text()
        steps = [t.split('Step ')[-1] for t in page.locator('#sheet .match p').all_inner_texts()]
        got.append((k, head, steps))
        print(f'lookup part{k}: {head} | shown steps {steps}')
        page.locator('#sheet [data-close]').first.click()
        page.wait_for_function("!document.querySelector('#sheet[open]')")
    sure_ok = sum(1 for k, h, st in got if h.startswith('It goes here') and st[:1] == [str(k)])
    sure_wrong = sum(1 for k, h, st in got if h.startswith('It goes here') and st[:1] != [str(k)])
    shown = sum(1 for k, h, st in got if str(k) in st)
    print(f'lookups: right step shown {shown}/5, confident+right {sure_ok}, confident+wrong {sure_wrong}')
    check(sure_wrong == 0, 'no confident wrong answer on the sample')
    check(shown >= 4, 'right step shown for at least 4 of 5 sample parts')
    page.locator('[data-sample="part3.jpg"]').click()
    page.wait_for_selector('#sheet[open] [data-jump]', timeout=300000)
    page.locator('#sheet [data-jump]').first.click()
    # tick everything
    prv = page.get_by_role('button', name='← Earlier step')
    while prv.is_enabled():
        prv.click(); page.wait_for_timeout(200)
    for _ in range(12):
        btns = page.locator('[data-back][aria-pressed="false"]')
        while btns.count():
            n = btns.count()
            btns.first.click()
            page.wait_for_function("n => document.querySelectorAll('[data-back][aria-pressed=false]').length < n || !!document.querySelector('.done-all')", arg=n, timeout=10000)
        if page.locator('.done-all').count(): break
        nxt = page.get_by_role('button', name='Next step →')
        if nxt.count() and nxt.is_enabled(): nxt.click(); page.wait_for_timeout(200)
        else: break
    check(page.locator('.done-all h2').count() == 1 and 'accounted for' in page.locator('.done-all h2').inner_text(), 'all parts accounted for screen')
    shot(page, '5-done')
    page.reload()
    page.wait_for_selector('h1')
    check('Continue' in page.locator('.hero').inner_text(), 'teardown survives reload')
    sw = page.evaluate('document.documentElement.scrollWidth'); vw = page.evaluate('window.innerWidth')
    check(sw <= vw, f'no horizontal scroll ({sw} <= {vw})')
    check(not errors, f'no page errors {errors[:2]}')
    b.close()
srv.shutdown()
print('FAILED' if fails else 'ALL PASS', len(fails))
sys.exit(1 if fails else 0)
