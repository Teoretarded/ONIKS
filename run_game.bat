@echo off
rem ONIKS: starts the local server (port 8771) and opens the game in the default browser.
cd /d "%~dp0"
start "ONIKS server" /min python tools\serve_game.py 8771
timeout /t 1 /nobreak >nul
start "" http://localhost:8771/game/index.html
