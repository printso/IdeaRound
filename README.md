<div align="center">
<img src="assets/images/ideaRound_logo_1.png" alt="Logo 描述" width="100%">
</div>
## 项目概述
IdeaRound 是一个"认知增强与多智能体决策支持系统"，旨在通过多视角 AI 智能体协作来打破个体认知壁垒。系统支持多轮对话、智能体共识达成和创意协作。

## 技术栈
- **后端**: FastAPI + SQLAlchemy (Async) + MySQL
- **前端**: React 19 + TypeScript + Vite + Ant Design 6
- **AI**: OpenAI 兼容的 LLM 接口

## 项目结构
```
ChatCycle3/
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── api/         # API 路由
│   │   ├── core/        # 核心配置
│   │   ├── models/      # 数据库模型
│   │   └── schemas/     # Pydantic 模式
│   └── requirements.txt
├── frontend/            # React 前端
│   ├── src/
│   │   ├── api/        # API 客户端
│   │   ├── layouts/    # 布局组件
│   │   └── pages/      # 页面组件
│   └── package.json
├── configs/            # 配置文件
│   ├── config.yaml     # 系统配置
│   └── init.sql        # 初始化 SQL
└── README.md
```

## 前置要求
- Python 3.10+
- Node.js 18+
- MySQL 8.0+

## 设置与运行

### 环境准备

#### 1. 克隆项目
```bash
git clone https://github.com/printso/IdeaRound.git
cd IdeaRound
```

#### 2. 配置 MySQL 数据库
确保 MySQL 服务已启动，并创建数据库：
```sql
CREATE DATABASE IdeaRound CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 3. 配置环境变量
复制示例环境配置文件并修改：

**方式一：使用 .env 文件（推荐）**
```bash
# 创建 .env 文件
cat > .env << EOF
DATABASE_URL=mysql+aiomysql://root:你的密码@127.0.0.1/IdeaRound
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
PROMPTS_BASE_PATH=configs/prompts
EOF
```

**方式二：修改 configs/config.yaml**
```yaml
database:
  url: "mysql+aiomysql://root:你的密码@127.0.0.1/IdeaRound"
  echo: false

server:
  host: "0.0.0.0"
  port: 8000
  reload: true

prompts:
  base_path: "configs/prompts"
```

### 后端设置

#### 1. 进入后端目录
```bash
cd backend
```

#### 2. 创建并激活虚拟环境
```bash
# 创建虚拟环境
python -m venv venv

# Windows 激活
venv\Scripts\activate

# Linux/Mac 激活
source venv/bin/activate
```

#### 3. 安装依赖
```bash
pip install -r requirements.txt
```

#### 4. 启动后端服务器
```bash
# 开发模式（支持热重载）
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# 生产模式
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

后端将运行在 `http://localhost:8000`，API 文档可在 `http://localhost:8000/docs` 查看。

### 前端设置

#### 1. 进入前端目录
```bash
cd frontend
```

#### 2. 安装依赖
```bash
npm install
```

#### 3. 配置 API 地址
确保 `frontend/vite.config.ts` 中的代理配置正确：
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true
    }
  }
}
```

#### 4. 启动开发服务器
```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

前端将运行在 `http://localhost:5173`（默认 Vite 端口）。

## 快速开始

1. 确保后端和前端都已启动
2. 在浏览器中访问前端地址（默认 `http://localhost:5173`）
3. 进入管理控制台 `/admin/models` 配置 LLM 模型
4. 开始使用对话功能

## 配置说明

### LLM 模型配置
系统支持多种 LLM 提供商，可通过以下方式配置：
- **Web 界面**: 访问 `/admin/models` 进行管理
- **数据库**: 在 `llm_configs` 表中直接配置

### 系统提示词
系统提示词支持以下存储方式：
- **数据库存储**: 通过管理界面管理
- **文件存储**: 放在 `configs/prompts/` 目录中的 Markdown 文件

### 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| DATABASE_URL | 数据库连接字符串 | - |
| SERVER_HOST | 服务器监听地址 | 0.0.0.0 |
| SERVER_PORT | 服务器端口 | 8000 |
| PROMPTS_BASE_PATH | 提示词文件基础路径 | configs/prompts |

## 项目维护

### 数据库操作
```sql
-- 查看表结构
SHOW TABLES;

-- 查看表结构
DESC chat_room;
DESC message;
DESC llm_config;
```

### 日志查看
```bash
# 后端日志在终端直接输出
# 如需持久化日志，可重定向输出
uvicorn backend.app.main:app --reload > backend.log 2>&1
```

## 常见问题

**Q: 数据库连接失败？**
A: 检查 DATABASE_URL 格式是否正确，确保 MySQL 服务已启动且用户权限正确。

**Q: 前端无法连接后端？**
A: 检查 CORS 配置，确保后端允许前端域名的请求。开发环境下已默认允许所有来源。

**Q: 端口被占用？**
A: 修改配置文件中的端口号，或使用 `--port` 参数指定其他端口。

## 许可证
MIT License