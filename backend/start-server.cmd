@echo off
REM Start StoryForge2 backend on port 8765
cd /d "%~dp0"
start "StoryForge2 API" /B node server.js
timeout /t 3 >nul
curl -s http://localhost:8765/api/health
echo.
echo Server running. Test: npm run test-crud
