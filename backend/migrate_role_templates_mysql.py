"""
MySQL 数据库迁移脚本
为 role_templates 表添加新字段
"""
import pymysql
from app.core.config import settings

def migrate():
    # 解析数据库连接信息
    db_url = settings.DATABASE_URL.replace('mysql+aiomysql://', '')
    parts = db_url.split('@')
    auth = parts[0].split(':')
    host_db = parts[1].split('/')
    host_port = host_db[0].split(':')

    username = auth[0]
    password = auth[1]
    host = host_port[0]
    port = int(host_port[1]) if len(host_port) > 1 else 3306
    database = host_db[1].split('?')[0]

    print(f"连接数据库: {host}:{port}/{database}")

    conn = pymysql.connect(
        host=host,
        port=port,
        user=username,
        password=password,
        database=database,
        charset='utf8mb4'
    )

    cursor = conn.cursor()

    # 检查现有表结构
    cursor.execute("SHOW COLUMNS FROM role_templates")
    existing_columns = [row[0] for row in cursor.fetchall()]
    print(f"现有字段: {existing_columns}")

    # 需要添加的新字段 (MySQL 语法)
    new_columns = {
        "category": "VARCHAR(50) DEFAULT '其他'",
        "personality": "TEXT",
        "background": "TEXT",
        "skill_tags": "TEXT",
        "dialogue_examples": "TEXT",
        "value_proposition": "TEXT",
        "usage_count": "INT DEFAULT 0",
        "rating": "FLOAT DEFAULT 5.0",
        "rating_count": "INT DEFAULT 0",
        "version": "INT DEFAULT 1",
        "parent_id": "INT",
        "version_note": "TEXT",
        "author": "VARCHAR(100)",
        "author_id": "INT",
        "copyright_notice": "TEXT",
        "license_type": "VARCHAR(50)",
        "created_by": "INT",
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
    cursor.execute("SHOW TABLES LIKE 'role_template_versions'")
    if not cursor.fetchone():
        sql = """
        CREATE TABLE role_template_versions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            template_id INT NOT NULL,
            version INT NOT NULL,
            snapshot_data JSON NOT NULL,
            change_summary TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INT,
            FOREIGN KEY (template_id) REFERENCES role_templates(id) ON DELETE CASCADE
        )
        """
        cursor.execute(sql)
        print("已创建表: role_template_versions")

    conn.commit()
    conn.close()
    print("迁移完成!")

if __name__ == "__main__":
    migrate()
