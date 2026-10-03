#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'Python 3.10 or newer is required.'
  exit 1
fi
[ -d .venv ] || python3 -m venv .venv
if ! .venv/bin/python -c 'import flask' >/dev/null 2>&1; then
  .venv/bin/python -m pip install -r requirements.txt
fi
if ! .venv/bin/python tools/check_project.py --vendor-only >/dev/null 2>&1; then
  if ! .venv/bin/python tools/vendor_dependencies.py; then
    printf '%s\n' 'Local library download failed. The website will try CDN, then labelled lightweight view.'
  fi
fi
printf '%s\n' 'Open http://127.0.0.1:5000 in your browser. Stop with Ctrl+C.'
.venv/bin/python app.py
