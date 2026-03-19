-- Multi-type Material Processing Module SQL
-- This script creates the materials table for storing user-uploaded documents and images

-- ----------------------------
-- Table structure for materials
-- ----------------------------
DROP TABLE IF EXISTS `materials`;
CREATE TABLE `materials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `material_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `room_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `filename` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `material_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'document, image, audio, video',
  `file_format` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'pdf, doc, docx, txt, jpg, png, gif, etc.',
  `file_size` int NOT NULL COMMENT 'File size in bytes',
  `file_hash` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'SHA256 hash for deduplication',
  `file_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Storage path on server',
  `processing_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT 'pending, uploaded, processing, completed, failed',
  `extracted_content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Extracted text content from document/image',
  `key_info` json NULL COMMENT 'Extracted key information (keywords, entities, summary)',
  `intent_indicators` json NULL COMMENT 'Detected intent indicators from content analysis',
  `summary` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'AI-generated summary of the material',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Soft delete flag',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ix_materials_material_id` (`material_id`),
  INDEX `ix_materials_user_id` (`user_id`),
  INDEX `ix_materials_room_id` (`room_id`),
  INDEX `ix_materials_created_at` (`created_at`),
  CONSTRAINT `materials_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User uploaded materials for roundtable analysis';

-- ----------------------------
-- Records of materials (empty initially)
-- ----------------------------
