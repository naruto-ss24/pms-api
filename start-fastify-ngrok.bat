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
npm install
if %errorlevel% neq 0 (
    echo Failed to install dependencies!
    pause
    exit /b
)

:: Build the application
echo Building application...
npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b
)

:: Start the server
echo Starting server...
start cmd /k "npm start"  :: Opens a new terminal and keeps the server running

:: Start ngrok in a separate terminal
echo Starting ngrok tunnel...
start cmd /k "ngrok http --domain=moved-mink-briefly.ngrok-free.app 8080"

:: Pause to keep the first window open
pause
