-- 迁移：为 llm_configs 表添加 auxiliary_model_id 列
-- 用于辅助模型路由：裁判/书记员/摘要等非创意任务使用独立模型

ALTER TABLE llm_configs
ADD COLUMN IF NOT EXISTS auxiliary_model_id INT DEFAULT NULL
COMMENT '辅助模型ID，用于裁判/书记员/摘要等非创意任务的路由';

-- 迁移：为 roundtable_configs 表添加 context_params 列（如已存在则跳过）
-- 用于存储结构化记忆配置、压缩参数等

-- 注意：此迁移脚本为参考，实际执行以 main.py 中的 _auto_migrate 为准
