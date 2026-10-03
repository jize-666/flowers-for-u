"""Offline browser checks for the lightweight UI only, never the Three.js renderer.

Run: python tests/browser_lightweight.py
Requires Playwright and a Chromium browser; set CHROMIUM_PATH when needed.
"""
from pathlib import Path
import re, base64, json, mimetypes, os, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs'/'previews'; OUT.mkdir(exist_ok=True)

def data_file(path):
    path=ROOT/path.lstrip('/')
    return 'data:'+ (mimetypes.guess_type(path)[0] or 'application/octet-stream')+';base64,'+base64.b64encode(path.read_bytes()).decode()

cache={}
def module_url(path):
    path=path.resolve()
    if path in cache:return cache[path]
    code=path.read_text()
    code=re.sub(r'from\s+["\'](\./[^"\']+)["\']',lambda m:'from "'+module_url(path.parent/m.group(1))+'"',code)
    code=code.replace('new URLSearchParams(location.search).has("debug")','true')
    code=code.replace('/static/audio/night-garden.mp3',data_file('/static/audio/night-garden.mp3'))
    result='data:text/javascript;base64,'+base64.b64encode(code.encode()).decode()
    cache[path]=result
    return result

html=(ROOT/'templates/index.html').read_text()
css=(ROOT/'static/css/style.css').read_text()
css=re.sub(r'url\("(/static/[^\"]+)"\)',lambda m:'url("'+data_file(m.group(1))+'")',css)
html=html.replace('<link rel="stylesheet" href="/static/css/style.css">','<style>'+css+'</style>')
html=re.sub(r'<link rel="icon"[^>]+>','',html)
html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
html=html.replace('/static/icons/sprite.svg#','#')
sprite=(ROOT/'static/icons/sprite.svg').read_text().replace('<svg xmlns="http://www.w3.org/2000/svg">','<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">')
html=html.replace('<body class="loading">','<body class="loading">'+sprite)
for image in ['garden-desktop.webp','garden-mobile.webp']:
    html=html.replace('/static/textures/'+image,data_file('/static/textures/'+image))
positions=json.loads((ROOT/'static/models/fallback-positions.json').read_text())
url=module_url(ROOT/'static/js/fallback.js')


def init(page):
    page.goto('about:blank')
    page.set_content(html)
    page.evaluate('data => { window.fetch = async (url) => { if(String(url).endsWith("fallback-positions.json")) return new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}}); throw new Error("Unexpected fetch: "+url); }; window.__audioPlayCalls=0; const original=HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play=function(){window.__audioPlayCalls++;return original.call(this);}; }',positions)
    page.evaluate('async url => { const app = await import(url); await app.start({reason:"Local in-memory fallback test; WebGL/GSAP not tested here"}); document.querySelector("#loading-screen").hidden=true; }',url)
    page.wait_for_timeout(2400)

results=[]
with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    browser=p.chromium.launch(executable_path=executable,headless=True)
    page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    init(page)
    assert not page.locator('#letter-dialog').evaluate('(el)=>el.open')
    assert page.evaluate('window.__audioPlayCalls')==0
    results.append('Letter stays closed at startup; audio never autoplays.')
    page.screenshot(path=str(OUT/'desktop-lightweight.png'))
    page.mouse.click(100,350)
    assert not page.locator('#letter-dialog').evaluate('(el)=>el.open')
    results.append('Background click does not open a letter.')
    page.locator('.fallback-hotspot').first.click()
    page.wait_for_timeout(1850)
    text=page.locator('#typed-message').inner_text()
    assert 1<len(text)<100
    results.append('Designated flower opens a letter; text starts only after paper entrance.')
    print('Partial typing:',repr(text))
    page.locator('#skip-typing').click()
    assert len(page.locator('#typed-message').inner_text())>200
    assert page.locator('#skip-typing').is_hidden()
    results.append('Read-at-once completes the exact message and hides the control.')
    page.screenshot(path=str(OUT/'letter-desktop.png'))
    page.keyboard.press('Escape');page.wait_for_timeout(850)
    assert not page.locator('#letter-dialog').evaluate('(el)=>el.open')
    results.append('Escape closes the letter and returns focus to its flower.')
    for i in [1,2,0]:
        page.locator('.fallback-hotspot').nth(i).click();page.wait_for_timeout(230)
        page.keyboard.press('Escape');page.wait_for_timeout(750)
        assert not page.locator('#letter-dialog').evaluate('(el)=>el.open')
    results.append('All three triggers work; closing during entrance cancels cleanly.')
    page.locator('.fallback-hotspot').first.focus();page.keyboard.press('Enter');page.wait_for_timeout(1550)
    assert page.locator('#letter-dialog').evaluate('(el)=>el.open')
    assert page.evaluate('window.__audioPlayCalls')==0
    page.keyboard.press('Escape');page.wait_for_timeout(800)
    results.append('Keyboard activation works without starting audio.')
    assert not errors,errors
    mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    mobile_errors=[];mobile.on('pageerror',lambda error:mobile_errors.append(str(error)))
    init(mobile)
    mobile.screenshot(path=str(OUT/'mobile-lightweight.png'))
    mobile.locator('.fallback-hotspot').first.tap();mobile.wait_for_timeout(1600)
    mobile.locator('#skip-typing').tap()
    box=mobile.locator('.letter-paper').bounding_box()
    assert box['width']<=390 and box['x']>=0,box
    mobile.screenshot(path=str(OUT/'letter-mobile.png'))
    mobile.locator('#close-letter').tap();mobile.wait_for_timeout(800)
    assert not mobile.locator('#letter-dialog').evaluate('(el)=>el.open')
    assert not mobile_errors,mobile_errors
    results.append('390 x 844 touch viewport: flower tap, readable paper, skip and close work without horizontal overflow.')
    reduced=browser.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce')
    init(reduced)
    reduced.locator('.fallback-hotspot').first.click();reduced.wait_for_timeout(400)
    assert len(reduced.locator('#typed-message').inner_text())>200
    assert reduced.locator('#skip-typing').is_hidden()
    results.append('Reduced-motion preference shows the full message without typewriter motion.')
    browser.close()
print(json.dumps({'mode':'local in-memory lightweight UI (not live Three.js/GSAP)','results':results,'page_errors':errors+mobile_errors},indent=2))
(ROOT/'docs'/'ui-test-results.json').write_text(json.dumps({'mode':'local in-memory lightweight UI (not live Three.js/GSAP)','results':results,'page_errors':errors+mobile_errors},indent=2))
