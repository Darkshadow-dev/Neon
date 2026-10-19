@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 server.py
) else (
    python server.py
)

if errorlevel 1 (
    echo.
    echo GSE API did not start.
    echo Install Python 3.10+ and the project requirements with:
    echo   py -3 -m pip install -r requirements.txt
    echo Then run this file again.
    pause
)

endlocal
