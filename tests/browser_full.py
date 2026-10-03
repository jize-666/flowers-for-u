"""Real Three.js + GSAP browser smoke test, to run on a normal local PC.

Start Flask first. Install Playwright and its Chromium browser, then:
    python tests/browser_full.py --url http://127.0.0.1:5000

This test intentionally fails if the lightweight fallback is shown.
It was not executed in the restricted build environment.
"""
from pathlib import Path
import argparse
import json
import os
import shutil
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def run(url, headed=False):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.pop('fallback', None)
    query['debug'] = '1'
    url = urlunsplit(parts._replace(query=urlencode(query)))
    output = ROOT / 'docs' / 'previews'
    output.mkdir(exist_ok=True)
    results = []
    with sync_playwright() as playwright:
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
        browser = playwright.chromium.launch(executable_path=executable, headless=not headed)
        page = browser.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script('window.__audioStarts=0; const original=HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play=function(){window.__audioStarts++;return original.call(this);};')
        page.goto(url)
        page.wait_for_function('window.__FLOWERS_DEBUG__?.getState().phase === "exploring"', timeout=90000)
        state = page.evaluate('window.__FLOWERS_DEBUG__.getState()')
        assert not state.get('fallback'), 'Full 3D was not loaded. Install local vendor dependencies and verify WebGL2 support.'
        assert state['letter'] == 'closed', 'Letter opened without a flower click.'
        assert page.evaluate('window.__audioStarts') == 0
        assert state['drawCalls'] > 0 and state['triangles'] > 0
        results.append('Real Three.js renderer active; GSAP intro completed; letter and audio stay closed.')
        page.mouse.click(80, 300)
        assert not page.locator('#letter-dialog').evaluate('(el) => el.open')
        results.append('Background click leaves the letter closed.')
        page.screenshot(path=str(output / 'desktop-threejs.png'))
        for flower_id in ['moonflower', 'ivory', 'blush']:
            target = next(item for item in page.evaluate('window.__FLOWERS_DEBUG__.getTargets()') if item['id'] == flower_id)
            assert target['visible'], f'{flower_id} is not pickable'
            page.mouse.click(target['x'], target['y'])
            page.wait_for_function('document.querySelector("#letter-dialog").open')
            page.wait_for_timeout(1900)
            text = page.locator('#typed-message').inner_text()
            assert 0 < len(text) < 200, 'Typing did not begin gradually after the paper entrance.'
            page.locator('#skip-typing').click()
            assert len(page.locator('#typed-message').inner_text()) > 200
            page.keyboard.press('Escape')
            page.wait_for_function('!document.querySelector("#letter-dialog").open')
        results.append('All three actual 3D flower raycasts open the letter; typing, skip, and close work.')
        assert page.evaluate('window.__audioStarts') == 0
        assert not errors, errors
        browser.close()
    report = {'mode': 'full Three.js + GSAP smoke test', 'results': results, 'page_errors': errors}
    (ROOT / 'docs' / 'full-test-results.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5000')
    parser.add_argument('--headed', action='store_true')
    args = parser.parse_args()
    run(args.url, args.headed)
