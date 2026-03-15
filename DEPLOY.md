# IdeaRound 部署指南

## 环境要求

- Docker
- Docker Compose

## 快速部署

### 1. 首次部署

```bash
# 构建并启动服务
docker-compose up -d --build

# 查看日志
docker-compose logs -f
```

### 2. 访问服务

- 前端: http://localhost:13001
- 后端 API: http://localhost:15001

## 后续更新

### 方法一：重新构建镜像（推荐）

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建镜像（使用 --no-cache 确保完全重新构建）
docker-compose build --no-cache

# 3. 重新启动服务
docker-compose up -d
```

### 方法二：只更新前端

```bash
# 只重新构建前端
docker-compose build --no-cache --build-arg SKIP_BACKEND=true

# 或者手动构建前端后复制到容器
```

### 方法三：使用 Docker 多阶段构建缓存加速

```bash
# 只重新构建变更的部分
docker-compose build
docker-compose up -d
```

## 数据持久化

部署时已配置以下数据卷：

- `idearound-data`: 存储 SQLite 数据库文件
- `idearound-logs`: 存储日志文件

数据卷位置：`/app/data` 和 `/app/backend/logs`

## 常用命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 完全删除（包括数据卷）
docker-compose down -v

# 重启服务
docker-compose restart

# 进入容器（调试用）
docker-compose exec idearound /bin/bash
```

## 配置说明

### 端口映射

| 容器端口 | 主机端口 | 说明 |
|---------|---------|------|
| 13001   | 13001   | 前端静态服务 |
| 15001   | 15001   | 后端 API 服务 |

### 环境变量

可在 `docker-compose.yml` 中修改：

```yaml
environment:
  - DATABASE_URL=sqlite:////app/data/idearound.db
  - CORS_ORIGINS=http://localhost:13001
  - LOG_LEVEL=info
```

## 故障排查

### 1. 服务启动失败

```bash
# 查看详细日志
docker-compose logs
```

### 2. 数据库问题

```bash
# 进入容器检查数据库
docker-compose exec idearound ls -la /app/data/

# 重新初始化数据库
docker-compose exec idearound python /app/backend/init_db.py
```

### 3. 端口被占用

```bash
# 检查端口占用
netstat -tlnp | grep 13001
netstat -tlnp | grep 15001
```
