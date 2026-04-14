-- 添加主持人总结模式配置
-- 模式说明：disabled=禁用；manual=仅手动；per_round=每轮总结；auto=智能自动（默认）
INSERT INTO `roundtable_configs` (`config_key`, `config_value`, `description`, `min_value`, `max_value`, `is_active`, `created_at`, `updated_at`)
VALUES ('moderator_summary_mode', 'auto', '主持人总结模式：disabled=禁用主持人总结；manual=仅手动点击总结按钮时触发；per_round=每轮对话后自动启用总结；auto=裁判判定收敛或达到最大轮数时自动总结', NULL, NULL, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`), `description` = VALUES(`description`), `updated_at` = NOW();
