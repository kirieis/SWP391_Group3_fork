@echo off
title AITA Demo Launcher
color 0A

echo.
echo  =====================================================
echo   AITA-Intelligent - DEMO LAUNCHER
echo  =====================================================
echo.
echo  [1/2] Khoi dong Backend API (port 5000)...
start "AITA Backend API" cmd /k "cd /d %~dp0 && npm run dev --workspace=apps/api"

echo  Doi 3 giay de backend khoi dong truoc...
timeout /t 3 /nobreak >nul

echo  [2/2] Khoi dong Ngrok tunnel...
start "AITA Ngrok Tunnel" cmd /k "ngrok http --url=sentinellike-axel-hugeously.ngrok-free.dev 5000"

echo.
echo  =====================================================
echo   CA HAI DICH VU DA DUOC KHOI DONG!
echo.
echo   Backend : http://localhost:5000/health
echo   Ngrok   : https://sentinellike-axel-hugeously.ngrok-free.dev
echo   Frontend: https://swp-391-group3.vercel.app  (neu da deploy)
echo  =====================================================
echo.
echo  Nhan phim bat ky de dong cua so nay...
pause >nul
