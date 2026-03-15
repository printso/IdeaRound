# ideaRound - 圆桌创意·多智能体决策支持系统

<div align="center">

![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-green.svg)
![Node.js](https://img.shields.io/badge/node-16+-green.svg)
![FastAPI](https://img.shields.io/badge/fastapi-0.100+-green.svg)
![React](https://img.shields.io/badge/react-18+-green.svg)

**基于多智能体协作的创意激发与决策支持平台**

[快速开始](#-快速开始) • [功能特性](#-功能特性) • [技术架构](#-技术架构) • [部署指南](#-部署指南)

</div>

---

## 📖 项目简介

ideaRound 是一个创新的**多智能体决策支持系统**，通过模拟专家圆桌讨论，提供深度洞察、多视角分析、创意碰撞与结构化输出。

**适用场景**：产品需求分析、技术方案评审、商业模式设计、风险评估、创意验证等

---

## ✨ 功能特性

### 核心功能

**意图洞察** - 智能问答澄清需求，生成结构化需求卡片

**角色矩阵**
- 产品策略官：目标拆解、需求路径
- 技术架构师：可实施性、复杂度评估
- 增长运营官：转化漏斗、数据指标
- 黑帽风控官：风险识别、压力测试
- 审计官：回答质量评审

**圆桌讨论**
- 简报阶段快速迭代 + 最终阶段深度总结
- 实时流式输出
- 共识与分歧可视化

**模型管理**
- 支持多种 LLM（OpenAI、Claude、Gemini 等）
- 自定义模型配置
- 在线聊天测试

### 认证系统

- JWT Token 认证，支持用户注册登录
- 三级角色权限（admin/user/guest）
- 可配置启用/禁用认证
- Token 自动刷新机制

---

## 🚀 快速开始

### 一键启动

**Windows:** `start.bat` | **Linux/Mac:** `./start.sh`

启动后访问：http://localhost:5173

**默认管理员账号**：`admin` / `admin123` （首次登录后请立即修改密码）

### 手动启动

```bash
# 后端
cd backend
pip install -r requirements.txt
python init_db.py && python init_auth.py
uvicorn app.main:app --reload --port 15001

# 前端
cd frontend
npm install
npm run dev
```

---

## 🏗️ 技术架构

### 技术栈

**后端**：FastAPI + SQLAlchemy (Async) + MySQL/SQLite + JWT + bcrypt

**前端**：React 18 + Ant Design + Vite + React Router v6

### 系统架构

```
用户端 → Nginx → Frontend (React) → Backend (FastAPI) → MySQL/LLM APIs
```

### 项目结构

```
ideaRound/
├── backend/           # FastAPI 后端
│   ├── app/
│   │   ├── api/      # API 路由
│   │   ├── core/     # 核心配置
│   │   ├── models/   # 数据模型
│   │   └── schemas/  # Pydantic Schema
│   ├── configs/      # 配置文件
│   └── init_*.py     # 初始化脚本
├── frontend/         # React 前端
│   └── src/
│       ├── components/  # 组件
│       ├── contexts/    # Context
│       ├── pages/       # 页面
│       └── api/         # API 调用
└── start.sh/bat      # 启动脚本
```

---

## 🔧 配置说明

### 环境变量

复制 `.env.example` 到 `.env`：

```bash
# 数据库
MYSQL_ROOT_PASSWORD=secure-password
MYSQL_USER=idearound
MYSQL_PASSWORD=your-secure-db-password

# 认证
JWT_SECRET_KEY=random-secret-key-min-32-chars
AUTH_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password-immediately
```

### 认证配置

| 角色 | 权限 |
|------|------|
| admin | 所有权限 |
| user | 工作台、聊天、模型管理 |
| guest | 工作台只读 |

**禁用认证**：修改 `.env` 中的 `AUTH_ENABLED=false`，重启后端

---

## 📋 部署指南

### 环境要求

- Python 3.9+、Node.js 20+、MySQL 5.7+

### 生产部署

1. **安全配置**
   ```bash
   # 生成随机密钥
   openssl rand -hex 32  # Linux/Mac
   ```

2. **Nginx 反向代理**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:5173;
       }

       location /api/ {
           proxy_pass http://localhost:15001;
       }
   }
   ```

3. **HTTPS 配置**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| 忘记密码 | 重新运行 `init_auth.py` |
| 禁用认证 | 设置 `AUTH_ENABLED=false` |
| Token 过期 | 前端自动刷新，过期则重新登录 |

---

## 📄 许可证

[AGPL-3.0](LICENSE) - 开源，但通过网络提供修改版本需公开源代码

---

<div align="center">

**如果这个项目对你有帮助，请给一个 ⭐️ Star！**

Made with ❤️ by ideaRound Team

</div>

