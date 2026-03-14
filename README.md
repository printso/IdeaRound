# ideaRound - 圆桌创意·多智能体决策支持系统

<div align="center">

![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-green.svg)
![Node.js](https://img.shields.io/badge/node-16+-green.svg)
![FastAPI](https://img.shields.io/badge/fastapi-0.100+-green.svg)
![React](https://img.shields.io/badge/react-18+-green.svg)

**基于多智能体协作的创意激发与决策支持平台**

[在线演示](#在线演示) • [快速开始](#快速开始) • [功能特性](#功能特性) • [技术架构](#技术架构) • [部署指南](#部署指南)

</div>

---

## 📖 项目简介

ideaRound 是一个创新的**多智能体决策支持系统**，通过模拟专家圆桌讨论的方式，帮助用户：

- 🔍 **深度洞察需求** - 通过智能问答澄清真实意图
- 🎭 **多视角分析** - 不同角色专家从各自立场提供见解
- 💡 **创意碰撞** - 建设性与对抗性观点的充分交流
- 📊 **结构化输出** - 生成可执行的方案与路径

### 适用场景

- ✅ 产品需求分析与评审
- ✅ 技术方案可行性讨论
- ✅ 商业模式头脑风暴
- ✅ 风险评估与压力测试
- ✅ 创意方案多维度验证

---

## ✨ 功能特性

### 核心功能

#### 1. 意图洞察
- 智能问答澄清用户需求
- 结构化需求卡片生成
- 核心目标、约束条件、痛点分析

#### 2. 角色矩阵
- **产品策略官** - 目标拆解、需求路径
- **技术架构师** - 可实施性、复杂度评估
- **增长运营官** - 转化漏斗、数据指标
- **黑帽风控官** - 挑刺、压力测试、风险识别
- **审计官** - 严格评审回答质量

#### 3. 圆桌讨论
- 简报阶段（快速迭代）
- 最终阶段（深度总结）
- 实时流式输出
- 共识与分歧可视化

#### 4. 模型管理
- 支持多种 LLM（OpenAI、Claude、Gemini 等）
- 自定义模型配置
- 在线聊天测试
- 流式响应预览

### 认证系统（新增）

- 🔐 JWT Token 认证
- 👥 用户注册与登录
- 🎫 角色权限管理（RBAC）
- ⚙️ 可配置是否启用认证
- 🔑 密码加密存储
- 🔄 Token 自动刷新

---

## 🚀 快速开始

### 方式一：一键启动（推荐）

**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

启动后自动打开：
- 前端：http://localhost:5173
- 后端 API: http://localhost:8000
- API 文档：http://localhost:8000/docs

**默认管理员账号：**
- 用户名：`admin`
- 密码：`admin123`

⚠️ **首次登录后请立即修改密码！**

### 方式二：手动启动

#### 1. 后端

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 初始化数据库
python init_db.py

# 初始化认证系统
python init_auth.py

# 启动服务
uvicorn app.main:app --reload --port 8000
```

#### 2. 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```



---

## 🏗️ 技术架构

### 后端技术栈

- **框架**: FastAPI
- **数据库**: MySQL / SQLite
- **ORM**: SQLAlchemy (Async)
- **认证**: JWT (python-jose)
- **加密**: bcrypt (passlib)
- **异步**: asyncio + aiohttp

### 前端技术栈

- **框架**: React 18
- **UI 库**: Ant Design
- **路由**: React Router v6
- **状态管理**: Context API
- **构建工具**: Vite
- **Markdown**: react-markdown

### 系统架构

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   用户端    │─────▶│  Nginx 反向  │─────▶│  Frontend   │
│  (浏览器)   │      │    代理      │      │   (React)   │
└─────────────┘      └──────────────┘      └─────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │   Backend    │
                       │  (FastAPI)   │
                       └──────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌────────────┐ ┌──────────── ┌────────────
       │   MySQL    │ │  LLM APIs  │ │  文件系统  │
       │  Database  │ │ (OpenAI 等) │ │ (Prompts)  │
       └──────────── └────────────┘ ────────────┘
```

---

## 🔐 认证系统说明

### 默认角色

| 角色 | 权限 | 说明 |
|------|------|------|
| **admin** | 所有权限 | 超级管理员，可管理用户和配置 |
| **user** | 基本功能 | 普通用户，可使用工作台和聊天 |
| **guest** | 只读权限 | 访客，仅查看工作台 |

### 启用/禁用认证

编辑 `.env` 文件：

```bash
AUTH_ENABLED=false  # 设为 false 禁用认证
```

重启后端服务后，所有用户都可以直接访问系统，无需登录。

### API 接口

```bash
# 登录
POST /api/v1/auth/login
{
  "username": "admin",
  "password": "admin123"
}

# 获取当前用户
GET /api/v1/auth/me
Authorization: Bearer <token>

# 刷新 Token
POST /api/v1/auth/refresh
{
  "refresh_token": "..."
}

# 修改密码
PUT /api/v1/auth/password
{
  "old_password": "...",
  "new_password": "..."
}
```

---

## 📁 项目结构

```
ideaRound/
├── backend/                 # 后端服务
│   ├── app/
│   │   ├── api/            # API 路由
│   │   ├── core/           # 核心配置和工具
│   │   ├── models/         # 数据模型
│   │   ├── schemas/        # Pydantic Schema
│   │   └── main.py         # 应用入口
│   ├── configs/            # 配置文件
│   ├── init_db.py          # 数据库初始化
│   ├── init_auth.py        # 认证系统初始化
│   └── requirements.txt    # Python 依赖
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/     # React 组件
│   │   ├── contexts/       # Context (认证等)
│   │   ├── pages/          # 页面组件
│   │   ├── api/            # API 调用
│   │   └── App.tsx         # 应用入口
│   ├── public/             # 静态资源
│   └── package.json        # Node 依赖
├── .env.example            # 环境变量配置示例
├── start.sh / start.bat    # 快速启动脚本
└── README.md               # 本文件
```

---

## 🌐 在线演示

> 即将发布公网演示环境，敬请期待...

**演示账号：**
- 用户名：`demo`
- 密码：`demo123`

---

## 📖 使用指南

### 1. 配置模型

1. 访问后台管理 → 模型配置管理
2. 添加你的 LLM API 密钥
3. 测试连接确保配置正确

### 2. 开始讨论

1. 在工作台输入你的初始需求
2. 回答意图洞察问题
3. 选择参与讨论的角色
4. 开始圆桌讨论

### 3. 查看结果

- 共识要点
- 分歧点
- 结构化方案

---

## 🔧 配置说明

### 环境变量

复制 `.env.example` 到 `.env` 并修改：

```bash
# 数据库配置
MYSQL_ROOT_PASSWORD=secure-password
MYSQL_USER=idearound
MYSQL_PASSWORD=your-secure-db-password

# 认证配置
JWT_SECRET_KEY=random-secret-key-min-32-chars
AUTH_ENABLED=true

# 管理员配置
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password-immediately
```

**注意**：生产环境必须修改 `JWT_SECRET_KEY` 和管理员密码！

---

## 📋 部署指南

### 环境要求

- Python 3.9+
- Node.js 16+
- MySQL 5.7+ (推荐) 或 SQLite

### 后端安装

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（复制 .env.example 到 .env 并修改）
cp ../.env.example .env

# 初始化数据库
python init_db.py

# 初始化认证系统（创建管理员账号）
python init_auth.py

# 启动后端服务
uvicorn app.main:app --reload --port 8000
```

### 前端安装

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:5175
```

### 认证系统

#### 默认角色

1. **admin** - 超级管理员
   - 所有权限
   - 可以管理用户和角色

2. **user** - 普通用户
   - 访问工作台
   - 使用聊天功能
   - 创建和编辑模型

3. **guest** - 访客
   - 仅访问工作台
   - 只读权限

#### API 接口

```bash
# 登录
POST /api/v1/auth/login
{
  "username": "admin",
  "password": "admin123"
}

# 响应
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}

# 获取当前用户信息
GET /api/v1/auth/me
Authorization: Bearer <access_token>

# 刷新 Token
POST /api/v1/auth/refresh
{
  "refresh_token": "eyJ..."
}

# 修改密码
PUT /api/v1/auth/password
Authorization: Bearer <access_token>
{
  "old_password": "...",
  "new_password": "..."
}
```

#### 禁用认证（开发/测试环境）

编辑 `.env` 文件：

```bash
AUTH_ENABLED=false
```

重启后端服务后，所有用户都可以直接访问系统，无需登录。

### 生产环境部署

#### 1. 安全配置

**必须修改的配置：**

```bash
# .env 文件
JWT_SECRET_KEY=production-random-secret-key-min-32-chars
ADMIN_PASSWORD=strong-password-with-special-chars!@#$
```

生成随机密钥：
```bash
# Linux/Mac
openssl rand -hex 32

# Windows (PowerShell)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

#### 2. Nginx 反向代理

**/etc/nginx/sites-available/idearound**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### 3. HTTPS 配置（推荐）

使用 Let's Encrypt 免费证书：

```bash
sudo certbot --nginx -d your-domain.com
```

### 常见问题

#### Q1: 忘记密码怎么办？

A: 使用 `init_auth.py` 重新初始化，或联系管理员重置密码。

#### Q2: 如何禁用认证？

A: 修改 `.env` 文件：
```bash
AUTH_ENABLED=false
```
重启后端服务即可。

#### Q3: 如何添加新用户？

A: 通过后台管理界面添加：
1. 使用 admin 账号登录
2. 访问后台管理 → 用户管理
3. 点击"新建用户"

#### Q4: Token 过期了怎么办？

A: 前端会自动使用 refresh token 刷新，如果 refresh token 也过期，会跳转到登录页。

#### Q5: 如何修改 Token 过期时间？

A: 编辑 `.env` 文件：
```bash
ACCESS_TOKEN_EXPIRE_MINUTES=10080  # 7 天
REFRESH_TOKEN_EXPIRE_DAYS=30
```

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

GNU Affero General Public License v3.0 (AGPL-3.0) - 详见 [LICENSE](LICENSE) 文件

本程序采用 AGPL-3.0 许可证。这意味着：
- 您可以自由使用、修改和分发本软件
- 如果您通过网络提供本服务的修改版本，必须向用户提供相应的源代码
- 所有衍生作品也必须采用相同的许可证

---

## 📞 联系方式

- **项目主页**: https://github.com/your-org/ideaRound
- **问题反馈**: https://github.com/your-org/ideaRound/issues
- **邮箱**: your-email@example.com

---

## 🙏 致谢

感谢以下开源项目：

- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [Ant Design](https://ant.design/)
- [SQLAlchemy](https://www.sqlalchemy.org/)

---

<div align="center">

**如果这个项目对你有帮助，请给一个 ⭐️ Star！**

Made with ❤️ by ideaRound Team

</div>
