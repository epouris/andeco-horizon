@echo off
cd /d "%~dp0"
echo Starting Andeco Horizon Suite server...
start "Andeco Horizon Suite" cmd /k node server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
echo Open http://localhost:3000 in your browser if it did not open automatically.
