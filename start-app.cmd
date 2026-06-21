@echo off
cd /d "%~dp0"
echo Starting Andeco Horizon server...
start "Andeco Horizon" cmd /k node server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
echo Open http://localhost:3000 in your browser if it did not open automatically.
