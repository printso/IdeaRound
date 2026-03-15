@echo off
echo ========================================
echo   ideaRound - 启动脚本
echo ========================================
echo.

REM 检查 Python 虚拟环境
if exist "venv\Scripts\activate.bat" (
    echo [1/4] 激活 Python 虚拟环境...
    call venv\Scripts\activate.bat
) else (
    echo [1/4] 创建 Python 虚拟环境...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo     虚拟环境创建完成!
)

echo.
echo [2/4] 安装后端依赖...
cd backend
pip install -r requirements.txt -q
cd ..

echo.
echo [3/4] 初始化数据库...
cd backend
python init_db.py
if not exist "app.db" (
    echo     数据库文件不存在，将自动创建...
)
cd ..

echo.
echo [4/4] 启动后端服务...
start cmd /k "cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 15001"

echo.
echo 后端服务正在启动中...
echo 等待 5 秒后启动前端...
timeout /t 5 /nobreak >nul

cd frontend
echo.
echo 启动前端开发服务器...
call npm run dev

pause