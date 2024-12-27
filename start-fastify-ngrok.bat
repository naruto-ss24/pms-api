@echo off
cd /d "%~dp0"  :: Change to the script's directory
echo Starting Fastify backend...

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js and try again.
    pause
    exit /b
)

:: Install dependencies
echo Installing dependencies...
npm install || (
    echo Failed to install dependencies!
    pause
    exit /b
)

:: Build the application
echo Building application...
npm run build || (
    echo Build failed!
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