@echo off
setlocal
cd /d "%~dp0"

echo Starting AI Blog Generator CRM Tool...
echo.
echo Local URL: http://127.0.0.1:5173
echo.
echo To enable real AI generation:
echo 1. Copy .env.example to .env
echo 2. Add your OPENAI_API_KEY
echo 3. Restart this file
echo.

start "" "http://127.0.0.1:5173"
"C:\Program Files\nodejs\node.exe" server.js

pause
