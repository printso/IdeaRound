"""
初始化用户认证系统数据
- 创建默认角色（admin, user, guest）
- 创建初始管理员账号
"""
import asyncio
import os
import sys

# 添加项目根目录到路径
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT_DIR)

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User, Role
from datetime import datetime

# 默认角色配置
DEFAULT_ROLES = [
    {
        "name": "admin",
        "description": "超级管理员，拥有所有权限",
        "permissions": ["*"],  # 所有权限
    },
    {
        "name": "user",
        "description": "普通用户，可以使用基本功能",
        "permissions": [
            "access:workspace",
            "access:chat",
            "access:admin",
            "model:create",
            "model:edit",
        ],
    },
    {
        "name": "guest",
        "description": "访客，只能查看",
        "permissions": [
            "access:workspace",
        ],
    },
]


async def init_auth_data():
    """初始化认证相关数据"""
    # 创建数据库引擎
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            # 1. 创建默认角色
            for role_data in DEFAULT_ROLES:
                # 检查角色是否已存在
                result = await session.execute(
                    select(Role).where(Role.name == role_data["name"])
                )
                existing_role = result.scalar_one_or_none()
                
                if not existing_role:
                    import json
                    role = Role(
                        name=role_data["name"],
                        description=role_data["description"],
                        permissions=json.dumps(role_data["permissions"], ensure_ascii=False),
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    )
                    session.add(role)
                    print(f"✓ 创建角色：{role_data['name']}")
                else:
                    print(f"- 角色已存在：{role_data['name']}")
            
            await session.commit()
            
            # 2. 创建初始管理员
            if settings.AUTH_ENABLED:
                result = await session.execute(
                    select(User).where(User.username == settings.ADMIN_USERNAME)
                )
                existing_admin = result.scalar_one_or_none()
                
                if not existing_admin:
                    # 获取 admin 角色
                    admin_role_result = await session.execute(
                        select(Role).where(Role.name == "admin")
                    )
                    admin_role = admin_role_result.scalar_one_or_none()
                    
                    if admin_role:
                        admin_user = User(
                            username=settings.ADMIN_USERNAME,
                            email=settings.ADMIN_EMAIL,
                            password_hash=get_password_hash(settings.ADMIN_PASSWORD),
                            nickname="超级管理员",
                            is_active=True,
                            is_superuser=True,
                            created_at=datetime.utcnow(),
                            updated_at=datetime.utcnow(),
                        )
                        admin_user.roles.append(admin_role)
                        
                        session.add(admin_user)
                        await session.commit()
                        
                        print(f"\n✅ 创建初始管理员账号:")
                        print(f"   用户名：{settings.ADMIN_USERNAME}")
                        print(f"   密码：{settings.ADMIN_PASSWORD}")
                        print(f"\n⚠️  重要提示：首次登录后请立即修改密码！")
                    else:
                        print("⚠️  警告：未找到 admin 角色，无法创建管理员账号")
                else:
                    print(f"- 管理员账号已存在：{settings.ADMIN_USERNAME}")
            else:
                print("\nℹ️  认证功能未启用，跳过管理员账号创建")
            
            print("\n✅ 认证系统初始化完成！")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ 初始化失败：{e}")
            raise
        finally:
            await engine.dispose()


if __name__ == "__main__":
    print("开始初始化认证系统数据...")
    asyncio.run(init_auth_data())
