-- 迁移脚本：为 llm_configs 表添加上下文参数字段
-- 执行时间：2026-04-11
-- 说明：添加 max_tokens, top_p, context_length, frequency_penalty, presence_penalty 五个字段

ALTER TABLE `llm_configs`
  ADD COLUMN `max_tokens` int NULL DEFAULT NULL AFTER `temperature`,
  ADD COLUMN `top_p` float NULL DEFAULT NULL AFTER `max_tokens`,
  ADD COLUMN `context_length` int NULL DEFAULT NULL AFTER `top_p`,
  ADD COLUMN `frequency_penalty` float NULL DEFAULT NULL AFTER `context_length`,
  ADD COLUMN `presence_penalty` float NULL DEFAULT NULL AFTER `frequency_penalty`;
