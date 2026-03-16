"""
用户相关的 Pydantic Schema
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime
import json


# ============ Role Schemas ============
import json

class RoleBase(BaseModel):
    """角色基础 Schema"""
    name: str = Field(..., min_length=2, max_length=50, description="角色名称")
    description: Optional[str] = Field(None, max_length=255, description="角色描述")
    permissions: Optional[List[str]] = Field(default=None, description="权限列表")


class RoleCreate(RoleBase):
    """创建角色"""
    pass


class RoleUpdate(BaseModel):
    """更新角色"""
    name: Optional[str] = Field(None, min_length=2, max_length=50)
    description: Optional[str] = Field(None, max_length=255)
    permissions: Optional[List[str]] = None


class RoleResponse(RoleBase):
    """角色响应"""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
    
    @field_validator('permissions', mode='before')
    @classmethod
    def parse_permissions(cls, v):
        """解析 permissions JSON 字符串"""
        if v is None:
            return None
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return None


# ============ User Schemas ============

class UserBase(BaseModel):
    """用户基础 Schema"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr
    nickname: Optional[str] = Field(None, max_length=50, description="昵称")


class UserCreate(UserBase):
    """创建用户（注册）"""
    password: str = Field(..., min_length=6, max_length=128, description="密码")

    @field_validator('username', mode='before')
    @classmethod
    def validate_username(cls, v):
        if not v.isalnum():
            raise ValueError('用户名只能包含字母和数字')
        return v


class UserUpdate(BaseModel):
    """更新用户信息"""
    email: Optional[EmailStr] = None
    nickname: Optional[str] = Field(None, max_length=50)
    avatar: Optional[str] = None
    is_active: Optional[bool] = None


class UserUpdateAdmin(UserUpdate):
    """管理员更新用户"""
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None
    role_ids: Optional[List[int]] = None


class ChangePassword(BaseModel):
    """修改密码"""
    old_password: str = Field(..., description="当前密码")
    new_password: str = Field(..., min_length=6, max_length=128, description="新密码")


class UserResponse(UserBase):
    """用户响应"""
    id: int
    avatar: Optional[str] = None
    is_active: bool
    is_superuser: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    roles: Optional[List[RoleResponse]] = None

    model_config = {"from_attributes": True}


class UserInDB(UserResponse):
    """数据库中的用户（包含密码哈希）"""
    password_hash: str


# ============ Auth Schemas ============

class Token(BaseModel):
    """访问令牌"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """令牌载荷"""
    sub: str  # user id
    exp: datetime  # 过期时间
    type: str  # "access" or "refresh"


class LoginRequest(BaseModel):
    """登录请求"""
    username: str = Field(..., description="用户名或邮箱")
    password: str = Field(..., description="密码")


class RegisterRequest(UserCreate):
    """注册请求"""
    pass


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求"""
    refresh_token: str


class UserListResponse(BaseModel):
    """用户列表响应"""
    total: int
    users: List[UserResponse]


class AdminChangePassword(BaseModel):
    """管理员重置密码"""
    new_password: str = Field(..., min_length=6, max_length=128, description="新密码")
