# 圆桌空间数据隔离和持久化修复

## 问题描述

1. **数据丢失问题**：点击"新建圆桌空间"后，之前的圆桌空间内容都丢失了，显示为空
2. **数据隔离问题**：不同用户之间的圆桌空间数据没有隔离，不同用户能够加载其他用户的数据

## 问题根源

- 数据只存储在前端 `localStorage` 中，没有后端持久化
- 数据库表没有关联用户ID，无法实现用户数据隔离

## 解决方案

### 1. 后端改进

#### 1.1 数据库模型更新

**`backend/app/models/chat.py`**
- 为 `ChatRoom` 表添加 `user_id` 字段，关联到 `users` 表

**新增 `backend/app/models/workspace.py`**
- 创建 `Workspace` 模型，用于存储圆桌空间的所有状态
- 包含 `user_id` 字段实现用户数据隔离
- 将工作台数据存储为 JSON 格式

#### 1.2 Schema 定义

**新增 `backend/app/schemas/workspace.py`**
- 定义 `WorkspaceData` 接口，包含所有工作台状态
- 定义 `WorkspaceCreate`、`WorkspaceUpdate`、`WorkspaceResponse` 接口

#### 1.3 API 端点

**新增 `backend/app/api/v1/endpoints/workspaces.py`**
- `POST /api/v1/workspaces/` - 创建新的工作台
- `GET /api/v1/workspaces/` - 获取当前用户的所有工作台
- `GET /api/v1/workspaces/{room_id}` - 获取指定工作台
- `PUT /api/v1/workspaces/{room_id}` - 更新工作台数据
- `DELETE /api/v1/workspaces/{room_id}` - 删除工作台

所有端点都包含用户身份验证和权限检查，确保数据隔离。

### 2. 前端改进

#### 2.1 API 客户端

**新增 `frontend/src/api/workspace.ts`**
- 提供与后端 API 交互的 TypeScript 函数
- 包含类型定义和错误处理

#### 2.2 Home.tsx 更新

**`frontend/src/pages/Home.tsx`**
- 导入 `useAuth` Hook 检查用户登录状态
- 添加 `loadWorkspaces` 函数，从后端加载用户的所有圆桌空间
- 添加 `loadWorkspaceData` 函数，加载单个工作台数据
- 添加 `saveWorkspaceToBackend` 函数，自动保存工作台到后端
- 修改 `selectRoundtableRoom` 函数，切换圆桌空间时从后端加载数据
- 修改 `confirmRoles` 函数，创建新圆桌空间时保存到后端
- 修改 `deleteRoundtableRoom` 函数，删除时调用后端 API
- 修改数据保存逻辑，同步保存到 localStorage 和后端数据库

#### 2.3 数据同步策略

- **localStorage 作为 fallback**：保留 localStorage 支持，确保离线状态下也能正常使用
- **后端数据库为主**：登录用户的数据自动同步到后端
- **自动保存**：工作台状态变化时自动保存到后端
- **加载优先**：登录用户优先从后端加载数据

### 3. 数据迁移

**新增 `backend/app/migrations/add_workspace_user_id.py`**
- 为 `workspaces` 表添加 `user_id` 字段
- 为 `chat_rooms` 表添加 `user_id` 字段
- 创建必要的索引
- 创建外键约束

运行迁移脚本：
```bash
cd z:/IdeaRound
python -m backend.app.migrations.add_workspace_user_id
```

## 使用说明

### 首次部署

1. 运行数据库迁移脚本
2. 重启后端服务
3. 前端会自动使用新的 API

### 用户登录后

- 页面加载时自动从后端加载用户的圆桌空间列表
- 选择圆桌空间时自动加载完整数据
- 任何操作都会自动保存到后端

### 数据隔离

- 每个用户只能看到和操作自己的圆桌空间
- API 端点通过 `get_current_user` 依赖项实现身份验证
- 数据库查询时自动过滤 `user_id`

## 技术细节

### API 认证

所有工作台 API 都需要用户认证：
```python
current_user: User = Depends(get_current_user)
```

### 数据查询

查询工作台时自动过滤用户数据：
```python
select(DBWorkspace).where(
    DBWorkspace.user_id == current_user.id
)
```

### 错误处理

- 404: 工作台不存在或无权访问
- 401: 未登录或 token 过期
- 400: 数据验证失败

### 类型安全

- TypeScript 接口确保前后端类型一致
- 数据转换在 `loadWorkspaceData` 和 `saveWorkspaceToBackend` 中处理
- 支持多种字段命名格式（camelCase 和 snake_case）

## 注意事项

1. **兼容性**：保留了 localStorage 支持，确保向后兼容
2. **性能**：使用索引优化查询性能
3. **安全**：所有 API 都有身份验证和权限检查
4. **数据完整性**：使用数据库外键确保数据一致性

## 测试建议

1. 测试用户登录后能否看到自己的圆桌空间
2. 测试切换圆桌空间时数据是否正确加载
3. 测试新建圆桌空间后数据是否正确保存
4. 测试删除圆桌空间后数据是否正确清除
5. 测试不同用户之间的数据隔离
6. 测试离线状态（localStorage fallback）
