@echo off
REM ============================================================
REM  AITA-Intelligent - Khoi dong toan bo project (SWP391 Group 3)
REM  Dat file nay o THU MUC GOC repo (cung cap voi thu muc "apps")
REM
REM  Cach dung:
REM    startup.bat          -> khoi dong 3 dich vu (lan dau tu cai thu vien neu thieu)
REM    startup.bat setup    -> cai thu vien + prisma generate + db push, roi khoi dong
REM    startup.bat stop     -> dong 3 cua so dich vu
REM
REM  File chi dung ky tu ASCII de tranh loi ma hoa tren cmd.
REM ============================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
set "API=%ROOT%apps\api"
set "WEB=%ROOT%apps\web"
set "ENGINE=%ROOT%apps\ast-engine"

if /I "%~1"=="stop" goto :stop

echo ============================================================
echo  AITA-Intelligent - startup
echo ============================================================

REM ---- 1. Kiem tra cong cu ----
where node >nul 2>nul || (echo [LOI] Chua cai Node.js 18+ : https://nodejs.org & goto :fail)
where npm  >nul 2>nul || (echo [LOI] Khong tim thay npm & goto :fail)
where python >nul 2>nul || (echo [LOI] Chua cai Python 3.10+ : https://python.org & goto :fail)
echo [OK] node, npm, python da co.

REM ---- 2. Kiem tra file .env cua backend ----
if not exist "%API%\.env" (
    echo [LOI] Thieu %API%\.env  ^(xem README muc "Cau Hinh Database"^)
    goto :fail
)
findstr /B /C:"AST_ENGINE_URL" "%API%\.env" >nul 2>nul
if errorlevel 1 (
    echo [CANH BAO] apps\api\.env chua co AST_ENGINE_URL. Hay them dong:
    echo            AST_ENGINE_URL="http://localhost:8000"
)
findstr /B /C:"INTERNAL_API_KEY" "%API%\.env" >nul 2>nul
if errorlevel 1 (
    echo [CANH BAO] apps\api\.env chua co INTERNAL_API_KEY ^(vi du INTERNAL_API_KEY="dev_internal_key"^)
)

REM ---- 3. Cai thu vien (lan dau hoac khi chay "setup") ----
set "DOSETUP=0"
if /I "%~1"=="setup" set "DOSETUP=1"
if not exist "%ROOT%node_modules" set "DOSETUP=1"

if "%DOSETUP%"=="1" (
    echo.
    echo [SETUP] npm install o thu muc goc ...
    pushd "%ROOT%"
    call npm install || (popd & echo [LOI] npm install that bai & goto :fail)
    popd

    echo [SETUP] Prisma generate + db push ...
    pushd "%API%"
    call npx prisma generate || (popd & echo [LOI] prisma generate that bai & goto :fail)
    call npx prisma db push  || (popd & echo [LOI] prisma db push that bai. Kiem tra SQL Server va DATABASE_URL & goto :fail)
    popd

    if exist "%ENGINE%\requirements.txt" (
        echo [SETUP] pip install -r requirements.txt ...
        pushd "%ENGINE%"
        python -m pip install -r requirements.txt || (popd & echo [LOI] pip install that bai & goto :fail)
        popd
    ) else (
        echo [SETUP] Khong thay requirements.txt - bo qua pip install. Neu engine bao thieu module, chay: pip install -e apps\ast-engine
    )
)

REM ---- 4. Khoi dong 3 dich vu, moi dich vu mot cua so rieng ----
echo.
echo [START] AST Engine  - cong 8000
start "AITA Engine (8000)" /D "%ENGINE%" cmd /k python -m uvicorn ast_engine.main:app --app-dir src --port 8000

echo [START] Backend API - cong 5000
start "AITA Backend (5000)" /D "%API%" cmd /k npm run dev

echo [START] Frontend    - cong 3000
start "AITA Frontend (3000)" /D "%WEB%" cmd /k npm run dev

REM ---- 5. Cho dich vu len roi mo trinh duyet ----
echo.
echo Dang cho dich vu khoi dong (khoang 15 giay) ...
timeout /t 15 /nobreak >nul

echo.
echo ------------------------------------------------------------
echo  Frontend : http://localhost:3000
echo  Backend  : http://localhost:5000/health
echo  Engine   : http://localhost:8000/docs
echo ------------------------------------------------------------
echo  Kiem tra nhanh:
curl.exe -s -o nul -w "  Engine  : HTTP %%{http_code}\n" http://localhost:8000/health
curl.exe -s -o nul -w "  Backend : HTTP %%{http_code}\n" http://localhost:5000/health
curl.exe -s -o nul -w "  Frontend: HTTP %%{http_code}\n" http://localhost:3000
echo.
echo  HTTP 200 la dich vu da san sang. Neu la 000 thi xem cua so dich vu do de biet loi.
echo  Dong cac dich vu: chay "startup.bat stop" hoac dong 3 cua so.
echo.
start "" http://localhost:3000
goto :eof

:stop
echo Dang dong cac cua so dich vu ...
taskkill /FI "WINDOWTITLE eq AITA Engine (8000)*"   /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq AITA Backend (5000)*"  /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq AITA Frontend (3000)*" /T /F >nul 2>nul
echo Xong.
goto :eof

:fail
echo.
echo Khoi dong that bai. Sua loi o tren roi chay lai.
pause
exit /b 1
