"""
数据库迁移脚本
为 role_templates 表添加新字段
"""
import sqlite3
import os

# 数据库路径 - 优先使用项目根目录下的 configs
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, "configs", "idearound.db")

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"数据库文件不存在: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 检查现有表结构
    cursor.execute("PRAGMA table_info(role_templates)")
    existing_columns = [row[1] for row in cursor.fetchall()]
    print(f"现有字段: {existing_columns}")

    # 需要添加的新字段
    new_columns = {
        "category": "VARCHAR(50) DEFAULT '其他'",
        "personality": "TEXT",
        "background": "TEXT",
        "skill_tags": "TEXT",
        "dialogue_examples": "TEXT",
        "value_proposition": "TEXT",
        "usage_count": "INTEGER DEFAULT 0",
        "rating": "REAL DEFAULT 5.0",
        "rating_count": "INTEGER DEFAULT 0",
        "version": "INTEGER DEFAULT 1",
        "parent_id": "INTEGER",
        "version_note": "TEXT",
        "author": "VARCHAR(100)",
        "author_id": "INTEGER",
        "copyright_notice": "TEXT",
        "license_type": "VARCHAR(50)",
        "created_by": "INTEGER",
        "last_used_at": "DATETIME",
    }

    # 添加缺失的字段
    for column, definition in new_columns.items():
        if column not in existing_columns:
            try:
                sql = f"ALTER TABLE role_templates ADD COLUMN {column} {definition}"
                cursor.execute(sql)
                print(f"已添加字段: {column}")
            except Exception as e:
                print(f"添加字段 {column} 失败: {e}")

    # 创建 role_template_versions 表
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='role_template_versions'")
    if not cursor.fetchone():
        sql = """
        CREATE TABLE role_template_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            version INTEGER NOT NULL,
            snapshot_data TEXT NOT NULL,
            change_summary TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (template_id) REFERENCES role_templates(id)
        )
        """
        cursor.execute(sql)
        print("已创建表: role_template_versions")

    conn.commit()
    conn.close()
    print("迁移完成!")

if __name__ == "__main__":
    migrate()
