-- 淮海战役存档服务：建表脚本（Spring Boot 启动时按 spring.sql.init 自动执行，可重复执行）
-- 说明：本脚本只建表，不建库。库需事先创建，见 server/sql/00_create_database.sql。

CREATE TABLE IF NOT EXISTS save_slot (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  slot         VARCHAR(64)  NOT NULL,              -- 槽位标识：manual / auto / 自定义
  slot_name    VARCHAR(128) NOT NULL,              -- 槽位显示名
  version      INT          NOT NULL,              -- 版本号，每次覆盖 +1，用于防覆盖
  campaign_t   DOUBLE       NOT NULL,              -- 战役时间（小时）
  phase        INT          NOT NULL,              -- 阶段（1..3）
  state_json   LONGTEXT     NOT NULL,              -- 完整 state：S.serialize 产出的 {v,sim} JSON
  state_bytes  INT          NOT NULL,              -- state_json 的 UTF-8 字节数
  state_hash   CHAR(64)     NOT NULL,              -- state_json 的 SHA-256，用于幂等判重
  created_at   DATETIME(3)  NOT NULL,
  updated_at   DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_save_slot (slot),
  KEY idx_save_updated (updated_at)
);

CREATE TABLE IF NOT EXISTS after_action (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  record_key        CHAR(64)     NOT NULL,         -- 结局+时间+歼敌+伤亡 的 SHA-256，重复上报去重
  ending_type       VARCHAR(32)  NOT NULL,         -- historical / early / pyrrhic / stalemate / defeat / transfer
  ending_title      VARCHAR(128) NOT NULL,
  ending_date       VARCHAR(24)  NOT NULL,         -- 战役内日期文本，如 1948.11.22 08:00
  campaign_t        DOUBLE       NOT NULL,
  enemies_destroyed INT          NOT NULL,         -- 歼敌数
  own_casualties    INT          NOT NULL,         -- 我方伤亡
  key_divergence    VARCHAR(512) NOT NULL,         -- 关键分歧（D1..D7 逗号分隔）
  note              VARCHAR(1024) NOT NULL,
  created_at        DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_after_action (record_key),
  KEY idx_after_created (created_at)
);
