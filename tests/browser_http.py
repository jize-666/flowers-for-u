"""Test the actual HTTP bootstrap with external CDN requests deliberately blocked.

This validates the real local server and labelled fallback, NOT the Three.js
renderer or GSAP. Run: python tests/browser_http.py
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8765'


def run():
    errors = []
    checks = []
    with (ROOT / 'docs' / 'http-server-test.log').open('w') as log:
        server = subprocess.Popen([sys.executable, 'tools/preview_server.py', '--port', '8765'], cwd=ROOT, stdout=log, stderr=log)
        try:
            for _ in range(50):
                if server.poll() is not None:
                    raise RuntimeError('Preview server exited. Check docs/http-server-test.log.')
                try:
                    with urllib.request.urlopen(BASE, timeout=1) as response:
                        assert response.status == 200
                        assert 'Flowers' in response.read().decode()
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError('Preview server did not start.')
            for path, content_type in [('/static/js/main.js', 'text/javascript'), ('/static/models/hero-flower.glb', 'model/gltf-binary')]:
                with urllib.request.urlopen(BASE + path) as response:
                    assert response.headers['content-type'].startswith(content_type)
            checks.append('Actual local HTTP root, JS MIME type and GLB MIME type are valid.')
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'), headless=True)
                page = browser.new_page(viewport={'width': 1440, 'height': 900})
                page.route('https://**/*', lambda route: route.abort())
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(BASE + '/?debug=1')
                page.wait_for_selector('body.fallback-ready', timeout=15000)
                page.wait_for_function('document.querySelector("#loading-screen").hidden')
                assert page.evaluate('window.__FLOWERS_DEBUG__.getState().fallback') is True
                assert not page.locator('#letter-dialog').evaluate('(dialog) => dialog.open')
                assert 'Lightweight' in page.locator('#view-notice').inner_text()
                checks.append('Blocked CDN falls back visibly; loading ends and the letter stays hidden.')
                page.locator('.fallback-hotspot').first.click()
                page.wait_for_timeout(1800)
                text = page.locator('#typed-message').inner_text()
                assert 0 < len(text) < 200
                page.locator('#skip-typing').click()
                assert len(page.locator('#typed-message').inner_text()) > 200
                page.keyboard.press('Escape')
                page.wait_for_function('!document.querySelector("#letter-dialog").open')
                checks.append('Flower -> smooth native entrance -> typing -> read-at-once -> Escape works over HTTP.')
                assert not errors, errors
                browser.close()
        except Exception as error:
            (ROOT / 'docs/http-test-results.json').write_text(json.dumps({
                'status': 'not_completed', 'checks_completed': checks,
                'error': str(error), 'page_errors': errors,
                'full_renderer_tested': False,
            }, indent=2))
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
    report = {'mode': 'actual HTTP bootstrap, external libraries blocked, lightweight view', 'checks': checks, 'page_errors': errors}
    (ROOT / 'docs/http-test-results.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    run()
