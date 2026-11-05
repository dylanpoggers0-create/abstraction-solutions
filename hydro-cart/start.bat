@echo off
REM Double-click to start the Hydro Cart app. Close the Arduino Serial Monitor first.
cd /d "%~dp0app"
set PY=python
where python >NUL 2>NUL || set PY=py
%PY% -m pip install --quiet --disable-pip-version-check pyserial
start "" cmd /c "timeout /t 4 >NUL & start http://localhost:8000"
%PY% hydro_app.py %*
pause
