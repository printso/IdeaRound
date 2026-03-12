# IdeaRound - 创意圆桌

## 项目概述
IdeaRound 是一个"认知增强与多智能体决策支持系统"，旨在通过多视角 AI 智能体协作来打破个体认知壁垒。

## 项目结构
- `backend/`: FastAPI 后端（Python）
- `frontend/`: React + TypeScript + Ant Design 前端
- `configs/`: 配置文件（不包含敏感密钥）

## 前置要求
- Python 3.10+
- Node.js 18+
- MySQL 8.0+

## 设置与运行

### 后端
1. 进入 `backend/` 目录
2. 创建虚拟环境：`python -m venv venv`
3. 激活虚拟环境：`source venv/bin/activate`（Windows 系统使用 `venv\Scripts\activate`）
4. 安装依赖：`pip install -r requirements.txt`
5. 在 `.env` 或 `configs/config.yaml` 中配置数据库
6. 启动服务器：`uvicorn app.main:app --reload`

### 前端
1. 进入 `frontend/` 目录
2. 安装依赖：`npm install`
3. 启动开发服务器：`npm run dev`

## 配置
- LLM 模型可通过管理控制台（`/admin/models`）进行管理。
- 系统提示词存储在数据库中，或作为 Markdown 文件存储在 `configs/prompts/` 目录中。