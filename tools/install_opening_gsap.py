from pathlib import Path
from urllib.request import urlopen, Request
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
VERSION = '3.13.0'
URL = f'https://cdn.jsdelivr.net/npm/gsap@{VERSION}/dist/gsap.min.js'


def main():
    destination = ROOT / 'static/vendor/opening-gsap'
    destination.mkdir(parents=True, exist_ok=True)
    for existing in (ROOT / 'static/vendor').rglob('gsap.min.js'):
        if existing.parent == destination:
            continue
        data = existing.read_bytes()
        if b'GSAP 3.13.0' in data[:500] and len(data) > 30000:
            shutil.copy2(existing, destination / 'gsap.min.js')
            print('Copied matching GSAP from: ' + str(existing))
            return
    print('Downloading GSAP ' + VERSION + ' from the pinned npm CDN...')
    try:
        with urlopen(Request(URL, headers={'User-Agent': 'FlowersForYou-Opening-Setup/1.0'}), timeout=30) as response:
            data = response.read(500000)
        if b'GSAP 3.13.0' not in data[:500] or len(data) < 30000:
            raise ValueError('Unexpected response. No files were replaced.')
        pending = destination / 'gsap.min.js.part'
        pending.write_bytes(data)
        pending.replace(destination / 'gsap.min.js')
        manifest = {'version': VERSION, 'source': URL, 'bytes': len(data),
                    'sha256': hashlib.sha256(data).hexdigest(),
                    'license': 'https://gsap.com/standard-license/'}
        (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        print('Installed: static/vendor/opening-gsap/gsap.min.js')
        print('Reload the opening. Its footer should now display GSAP.')
    except Exception as error:
        raise SystemExit(f'Could not install GSAP: {error}\nThe opening will still try its CDN, then use the clearly labelled native animation fallback.')


if __name__ == '__main__':
    main()
