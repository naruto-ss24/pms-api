@echo off
cd /d "%~dp0"  :: Change to the script's directory
echo Starting Fastify backend...

:: Enable detailed logging
set LOGFILE=error.log
echo Logging to %LOGFILE%...
echo > %LOGFILE%

:: Start the server
echo Starting server...
start cmd /k "npm run start"  :: Opens a new terminal and keeps the server running
if %errorlevel% neq 0 (
    echo Failed to start the server!
    echo Check error.log for details.
    pause
    exit /b
)

:: Wait for server to start before opening ngrok
timeout /t 5

:: Start ngrok in a separate terminal
echo Starting ngrok tunnel...
start cmd /k "ngrok http --domain=moved-mink-briefly.ngrok-free.app 8080"
if %errorlevel% neq 0 (
    echo Failed to start ngrok!
    pause
    exit /b
)

:: Pause to keep the first window open
echo Backend started successfully.
pause
