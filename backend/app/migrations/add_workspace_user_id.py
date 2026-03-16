"""
数据库迁移脚本：添加 user_id 字段到 workspaces 表

此脚本用于：
1. 为 workspaces 表添加 user_id 字段（如果已存在则跳过）
2. 创建 workspaces 表（如果不存在）

运行方式：
    python -m backend.app.migrations.add_workspace_user_id
"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

try:
    from backend.app.core.database import get_db, engine, Base
    from backend.app.models.workspace import Workspace
    from backend.app.models.chat import ChatRoom
    from backend.app.models.user import User
except ImportError:
    from app.core.database import get_db, engine, Base
    from app.models.workspace import Workspace
    from app.models.chat import ChatRoom
    from app.models.user import User

from sqlalchemy import text


async def add_user_id_to_workspaces():
    """为 workspaces 表添加 user_id 字段"""
    async with engine.begin() as conn:
        # 检查 user_id 列是否已存在
        result = await conn.execute(
            text("""
                SELECT COUNT(*) as count
                FROM pragma_table_info('workspaces')
                WHERE name = 'user_id'
            """)
        )
        column_exists = result.fetchone()[0] > 0

        if column_exists:
            print("✓ user_id 列已存在于 workspaces 表中")
        else:
            # 添加 user_id 列
            await conn.execute(
                text("""
                    ALTER TABLE workspaces
                    ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1
                """)
            )
            print("✓ 成功为 workspaces 表添加 user_id 列")

        # 创建索引
        try:
            await conn.execute(
                text("""
                    CREATE INDEX IF NOT EXISTS ix_workspaces_user_id
                    ON workspaces(user_id)
                """)
            )
            print("✓ 成功创建 ix_workspaces_user_id 索引")
        except Exception as e:
            print(f"索引创建警告: {e}")


async def add_user_id_to_chat_rooms():
    """为 chat_rooms 表添加 user_id 字段"""
    async with engine.begin() as conn:
        # 检查 user_id 列是否已存在
        result = await conn.execute(
            text("""
                SELECT COUNT(*) as count
                FROM pragma_table_info('chat_rooms')
                WHERE name = 'user_id'
            """)
        )
        column_exists = result.fetchone()[0] > 0

        if column_exists:
            print("✓ user_id 列已存在于 chat_rooms 表中")
        else:
            # 添加 user_id 列
            await conn.execute(
                text("""
                    ALTER TABLE chat_rooms
                    ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1
                """)
            )
            print("✓ 成功为 chat_rooms 表添加 user_id 列")


async def create_workspaces_table():
    """创建 workspaces 表（如果不存在）"""
    try:
        async with engine.begin() as conn:
            # 检查表是否存在
            result = await conn.execute(
                text("""
                    SELECT name
                    FROM sqlite_master
                    WHERE type='table' AND name='workspaces'
                """)
            )
            table_exists = result.fetchone() is not None

            if table_exists:
                print("✓ workspaces 表已存在")
            else:
                # 创建表
                await conn.execute(
                    text("""
                        CREATE TABLE workspaces (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            room_id VARCHAR(100) UNIQUE NOT NULL,
                            data TEXT NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users (id)
                        )
                    """)
                )
                print("✓ 成功创建 workspaces 表")

                # 创建索引
                await conn.execute(
                    text("""
                        CREATE INDEX IF NOT EXISTS ix_workspaces_user_id
                        ON workspaces(user_id)
                    """)
                )
                await conn.execute(
                    text("""
                        CREATE INDEX IF NOT EXISTS ix_workspaces_room_id
                        ON workspaces(room_id)
                    """)
                )
                print("✓ 成功创建索引")

    except Exception as e:
        print(f"创建 workspaces 表时出错: {e}")


async def migrate():
    """执行所有迁移"""
    print("=" * 50)
    print("开始数据库迁移")
    print("=" * 50)

    # 创建所有表
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            print("✓ 所有表创建成功")
    except Exception as e:
        print(f"创建表时出错: {e}")

    # 为 workspaces 表添加 user_id 字段
    await add_user_id_to_workspaces()

    # 为 chat_rooms 表添加 user_id 字段
    await add_user_id_to_chat_rooms()

    print("=" * 50)
    print("数据库迁移完成")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(migrate())
