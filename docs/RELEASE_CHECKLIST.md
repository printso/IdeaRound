# GitHub 发布检查清单

## 📋 发布前检查

### 代码检查
- [ ] 所有 Python 文件无语法错误
- [ ] 所有 TypeScript/React 文件无编译错误
- [ ] 后端 API 测试通过
- [ ] 前端页面正常显示
- [ ] 认证系统功能完整
- [ ] 数据库迁移脚本正常

### 配置文件
- [ ] `.env.example` 包含所有必要环境变量
- [ ] `.gitignore` 已配置，排除敏感文件

### 文档
- [ ] README.md 完整且准确
- [ ] 认证系统文档完整
- [ ] API 文档可访问（/docs）

### 安全性
- [ ] JWT_SECRET_KEY 在示例中为占位符
- [ ] 默认密码在文档中明确标注需要修改
- [ ] 敏感信息未提交到 Git
- [ ] HTTPS 配置说明完整

---

## 🚀 发布步骤

### 1. 本地测试

```bash
# 复制环境变量文件
cp .env.example .env

# 后端测试
cd backend
python init_db.py
python init_auth.py
uvicorn app.main:app --reload

# 前端测试
cd frontend
npm run dev
```

### 2. 代码检查

```bash
# Python 代码检查（如果有配置 linter）
flake8 backend/
# 或
pylint backend/

# TypeScript 检查
cd frontend
npm run lint
npm run build
```

### 3. Git 提交

```bash
# 初始化 Git（如果还未初始化）
git init

# 添加所有文件
git add .

# 提交
git commit -m "feat: 实现用户认证系统

- 添加 JWT 认证机制
- 实现用户登录/注册/刷新 Token
- 前端登录页面和路由守卫
- 支持配置是否启用认证
- 使用 .env 环境变量配置
- 完整文档"

# 添加标签
git tag -a v1.0.0 -m "Release v1.0.0 - 认证系统版本"
```

### 4. 创建 GitHub 仓库

```bash
# 创建新仓库（在 GitHub 上）
# https://github.com/your-username/idearound/new

# 推送代码
git remote add origin https://github.com/your-username/idearound.git
git push -u origin main
git push origin v1.0.0
```

### 5. 创建 Release

在 GitHub 上：
1. 进入仓库 → Releases → Create a new release
2. Tag version: `v1.0.0`
3. Release title: `v1.0.0 - 用户认证系统`
4. 描述功能特性
5. 点击 Publish release

---

## 📦 Release 说明模板

```markdown
## 🎉 新功能

### 用户认证系统
- ✅ JWT Token 认证机制
- ✅ 用户登录/注册/登出
- ✅ Token 自动刷新
- ✅ 角色权限管理（RBAC）
- ✅ 前端登录页面
- ✅ 路由守卫
- ✅ 可配置是否启用认证

### 部署优化
- ✅ Docker 完整编排
- ✅ 一键启动脚本
- ✅ 环境变量配置
- ✅ 详细部署文档

## 🔧 配置变更

### 新增配置项
```yaml
auth:
  enabled: true  # 认证开关
  secret_key: "your-secret-key"
  access_token_expire_minutes: 10080
  refresh_token_expire_days: 30
  admin:
    username: "admin"
    password: "admin123"
```

## 📖 使用说明

### 快速开始
```bash
# Windows
start.bat

# Linux/Mac
./start.sh
```

### 默认账号
- 用户名：admin
- 密码：admin123

⚠️ **首次登录后请立即修改密码！**

## 📝 详细文档

- [部署指南](README.md#部署指南)
- [认证系统实现](docs/AUTH_IMPLEMENTATION.md)
- [API 文档](http://localhost:8000/docs)

## ⚠️ 重要提示

1. 生产环境必须修改 JWT_SECRET_KEY
2. 首次启动后修改默认管理员密码
3. 建议使用 MySQL 而非 SQLite
4. 生产环境启用 HTTPS

## 🙏 致谢

感谢所有贡献者！
```

---

## 🌐 公网部署

### 服务器准备

1. **购买服务器**
   - 推荐：2 核 4G 以上
   - 系统：Ubuntu 20.04+ 或 CentOS 7+

2. **域名配置**
   - 解析域名到服务器 IP
   - 配置 DNS 记录

3. **安装 Python 和 Node.js**
   ```bash
   # Ubuntu 示例
   sudo apt update
   sudo apt install python3-pip python3-venv nodejs npm -y
   ```

### 部署步骤

```bash
# 1. 克隆代码
git clone https://github.com/your-username/idearound.git
cd idearound

# 2. 配置环境变量
cp .env.example .env
vim .env  # 修改配置

# 3. 安装后端依赖
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. 初始化数据库
python init_db.py
python init_auth.py

# 5. 启动后端服务（使用 systemd 或 supervisor）
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 6. 安装前端依赖并构建
cd ../frontend
npm install
npm run build

# 7. 使用 Nginx 部署前端
sudo cp -r dist/* /var/www/html/
```

### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /var/www/html;
        try_files $uri $uri/ /index.html;
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

### HTTPS 配置

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx -y

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加：0 3 * * * certbot renew --quiet
```

---

## ✅ 最终检查

### 功能测试
- [ ] 登录功能正常
- [ ] 注册功能正常（如果启用）
- [ ] Token 刷新正常
- [ ] 路由守卫正常
- [ ] 退出登录正常
- [ ] 管理员权限正常

### 性能测试
- [ ] 页面加载速度 < 3 秒
- [ ] API 响应时间 < 500ms
- [ ] 并发测试（可选）

### 安全测试
- [ ] SQL 注入防护
- [ ] XSS 防护
- [ ] CSRF 防护
- [ ] 密码强度验证
- [ ] Token 安全性

### 文档检查
- [ ] README 清晰完整
- [ ] 部署文档可操作
- [ ] API 文档可访问
- [ ] 错误处理说明

---

## 📊 发布后监控

### 日志监控
```bash
# 查看后端日志（如果使用 systemd）
sudo journalctl -u idearound-backend -f

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 性能监控
- 使用工具：Prometheus + Grafana
- 监控指标：CPU、内存、磁盘、网络
- 应用监控：请求数、响应时间、错误率

### 用户反馈
- 收集 Issue
- 回复问题
- 持续优化

---

## 🎉 发布完成！

恭喜！您的 ideaRound 已经发布到 GitHub 并部署到公网！

**下一步：**
1. 分享项目链接
2. 收集用户反馈
3. 持续迭代优化
4. 添加新功能

---

**祝发布顺利！🚀**
