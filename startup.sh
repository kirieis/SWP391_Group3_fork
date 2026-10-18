#!/usr/bin/env bash
# ============================================================
#  AITA-Intelligent - Khoi dong toan bo project tren Linux/macOS
# ============================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"
AST_DIR="$ROOT_DIR/apps/ast-engine"

case "$1" in
  stop)
    echo "Dang dong cac tien trinh AITA..."
    pkill -f "uvicorn ast_engine.main:app" 2>/dev/null || true
    pkill -f "tsx watch src/index.ts" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    echo "Da dung xong."
    exit 0
    ;;
esac

echo "============================================================"
echo " AITA-Intelligent - Khoi dong he thong"
echo "============================================================"

# 1. Kiem tra file .env cua backend
if [ ! -f "$API_DIR/.env" ]; then
    echo "[!] Thieu apps/api/.env - dang tao tu .env.example..."
    cp "$API_DIR/.env.example" "$API_DIR/.env"
fi

# 2. Khoi dong Backend API (Port 5000)
echo "[1/3] Khoi dong Backend API (cong 5000)..."
(cd "$API_DIR" && npm run dev) &

# 3. Khoi dong Frontend (Port 3000)
echo "[2/3] Khoi dong Frontend (cong 3000)..."
(cd "$WEB_DIR" && npm run dev) &

# 4. Khoi dong AST Engine (Port 8000) neu co python
if command -v python3 &>/dev/null && [ -d "$AST_DIR/src" ]; then
    echo "[3/3] Khoi dong AST Engine (cong 8000)..."
    (cd "$AST_DIR" && python3 -m uvicorn ast_engine.main:app --app-dir src --port 8000) &
fi

echo "============================================================"
echo " He thong dang chay tren nen:"
echo " - Frontend   : http://localhost:3000"
echo " - Backend API: http://localhost:5000/health"
echo " - AST Engine : http://localhost:8000/docs"
echo "============================================================"
echo " De tat tat ca, chay: ./startup.sh stop"
wait
