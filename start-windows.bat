@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  set "PY=py -3"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3.10 or newer is required. Install Python, then try again.
    pause
    exit /b 1
  )
  set "PY=python"
)
if not exist .venv\Scripts\python.exe %PY% -m venv .venv
if not exist .venv\Scripts\python.exe (
  echo Could not create the Python environment.
  pause
  exit /b 1
)
.venv\Scripts\python.exe -c "import flask" >nul 2>nul
if errorlevel 1 (
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 (
    echo Flask installation failed. Read START_HERE.md for the local preview alternative.
    pause
    exit /b 1
  )
)
.venv\Scripts\python.exe tools\check_project.py --vendor-only >nul 2>nul
if errorlevel 1 (
  echo Preparing the pinned Three.js and GSAP libraries locally...
  .venv\Scripts\python.exe tools\vendor_dependencies.py
  if errorlevel 1 echo Local library download failed. The website will try CDN, then labelled lightweight view.
)
echo.
echo Open http://127.0.0.1:5000 in your browser.
echo Keep this window open while using the garden. Stop with Ctrl+C.
.venv\Scripts\python.exe app.py
pause
