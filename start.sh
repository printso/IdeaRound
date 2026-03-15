#!/bin/bash

echo "========================================"
echo "  ideaRound - 启动脚本"
echo "========================================"
echo ""

# 检查 Python 虚拟环境
if [ -d "venv" ]; then
    echo "[1/4] 激活 Python 虚拟环境..."
    source venv/bin/activate
else
    echo "[1/4] 创建 Python 虚拟环境..."
    python3 -m venv venv
    source venv/bin/activate
    echo "    虚拟环境创建完成!"
fi

echo ""
echo "[2/4] 安装后端依赖..."
cd backend
pip install -r requirements.txt -q
cd ..

echo ""
echo "[3/4] 初始化数据库..."
cd backend
python init_db.py
cd ..

echo ""
echo "[4/4] 启动后端服务..."
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 15001 &
cd ..

echo ""
echo "后端服务正在启动中..."
echo "等待 5 秒后启动前端..."
sleep 5

cd frontend
echo ""
echo "启动前端开发服务器..."
npm run dev