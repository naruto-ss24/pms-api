@echo off
cd /d "%~dp0"  :: Change to the script's directory
echo Starting Fastify backend...

:: Enable detailed logging
set LOGFILE=error.log
echo Logging to %LOGFILE%...
echo > %LOGFILE%

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js and try again.
    echo Node.js is not installed. >> %LOGFILE%
    pause
    exit /b
)

:: Install dependencies
echo Installing dependencies...
npm install >> %LOGFILE% 2>&1
if %errorlevel% neq 0 (
    echo Failed to install dependencies!
    echo Check error.log for details.
    pause
    exit /b
)

:: Build the application
echo Building application...
npm run build >> %LOGFILE% 2>&1
if %errorlevel% neq 0 (
    echo Build failed! Check error.log for details.
    pause
    exit /b
)

:: Start the server
echo Starting server...
start cmd /k "npm start"  :: Opens a new terminal and keeps the server running
if %errorlevel% neq 0 (
    echo Failed to start the server!
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
