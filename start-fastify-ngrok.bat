@echo off

echo Starting Fastify backend...

:: Start the server
echo Starting server...
start cmd /k "npm run start"
if %errorlevel% neq 0 (
    echo Failed to start the server!
    pause
    exit /b
)

:: Start ngrok in a separate terminal
echo Starting ngrok tunnel...
start cmd /k "ngrok http --domain=moved-mink-briefly.ngrok-free.app 8080"
if %errorlevel% neq 0 (
    echo Failed to start ngrok!
    pause
    exit /b
)

echo Backend started successfully.
pause
