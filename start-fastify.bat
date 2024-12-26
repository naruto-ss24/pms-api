@echo off
cd /d "%~dp0"  :: Change directory to the script's location
echo Building and starting Fastify backend...

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js and try again.
    pause
    exit /b
)

:: Install dependencies if not present
echo Installing dependencies...
npm install

:: Build the application
echo Building application...
npm run build

:: Start the server in production mode
echo Starting server...
npm start

:: Keep the window open
pause
