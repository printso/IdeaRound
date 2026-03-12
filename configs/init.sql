-- IdeaRound 数据库初始化脚本
-- 适用于 MySQL 8.0+

-- 创建数据库
CREATE DATABASE IF NOT EXISTS idearound DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE idearound;

-- 1. 系统提示词表 (sys_prompts)
CREATE TABLE IF NOT EXISTS sys_prompts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    p_key VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    version_hash VARCHAR(64),
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_p_key (p_key),
    INDEX idx_p_key (p_key),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统提示词表';

-- 2. LLM 配置表 (llm_configs)
CREATE TABLE IF NOT EXISTS llm_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    api_key VARCHAR(255),
    api_base VARCHAR(255),
    model_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    temperature FLOAT DEFAULT 0.7,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_name (name),
    INDEX idx_name (name),
    INDEX idx_provider (provider),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='LLM 模型配置表';

-- 3. 聊天室表 (chat_rooms)
CREATE TABLE IF NOT EXISTS chat_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    status VARCHAR(50) DEFAULT 'probing',
    intent_data JSON,
    temperature FLOAT DEFAULT 0.7,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天室表';

-- 4. 消息表 (messages)
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    sender_type VARCHAR(20) NOT NULL,
    sender_name VARCHAR(100),
    sender_id VARCHAR(50),
    content TEXT NOT NULL,
    meta_data JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    INDEX idx_room_id (room_id),
    INDEX idx_sender_type (sender_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息记录表';

-- 5. 共识画布表 (consensus_canvas)
CREATE TABLE IF NOT EXISTS consensus_canvas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    current_goal TEXT,
    agreements JSON,
    disagreements JSON,
    last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    UNIQUE KEY unique_room_id (room_id),
    INDEX idx_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='共识画布表';

-- 6. 智能体表 (bots)
CREATE TABLE IF NOT EXISTS bots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role_type VARCHAR(50) NOT NULL,
    avatar_url VARCHAR(255),
    soul_prompt_id VARCHAR(255),
    style_prompt_id VARCHAR(255),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_role_type (role_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能体配置表';

-- 插入默认系统提示词
INSERT INTO sys_prompts (p_key, content, is_active) VALUES
('intent_probe_system', '你是一个意图探测助手。请帮助用户明确他们的目标、需求和约束条件。', TRUE),
('expert_system', '你是一个领域专家。请基于专业知识和经验，为用户提供建设性的意见和建议。', TRUE),
('blackhat_system', '你是一个批判性思考者。请挑战现有观点，找出潜在的漏洞和风险。', TRUE),
('synthesizer_system', '你是一个综合者。请整合各方观点，寻找共识和最佳解决方案。', TRUE);

-- 插入默认智能体
INSERT INTO bots (name, role_type, description, soul_prompt_id, style_prompt_id) VALUES
('探询者', 'probe', '负责探测用户意图和需求的智能体', 'intent_probe_system', NULL),
('专家', 'expert', '提供专业建议和知识的智能体', 'expert_system', NULL),
('批判者', 'blackhat', '负责挑战观点、发现风险的智能体', 'blackhat_system', NULL),
('综合者', 'synthesizer', '负责整合观点、寻找共识的智能体', 'synthesizer_system', NULL);

-- 插入默认 LLM 配置示例（需根据实际情况修改 API 密钥）
INSERT INTO llm_configs (name, provider, model_name, is_active, temperature) VALUES
('默认 GPT-4', 'openai', 'gpt-4', TRUE, 0.7),
('默认 GPT-3.5', 'openai', 'gpt-3.5-turbo', TRUE, 0.7);