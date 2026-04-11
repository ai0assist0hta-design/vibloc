-- =============================================================================
-- VIBLOC — MySQL 8.0+ 스키마 (쿼리 창 복붙용)
-- =============================================================================
-- 전제: 건물 지오메트리는 클라 OSM 정적 데이터. 서버는 users + building_vibes 만 관리.
-- 이메일은 애플리케이션에서 항상 lower(trim) 후 저장 권장 (PostgreSQL CITEXT 대체).
-- UUID: MySQL 8.0.13+ DEFAULT(UUID()) — 구버전이면 id 는 앱에서 CHAR(36) 생성 후 INSERT.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 기존 재실행 시 (개발용)
-- DROP TABLE IF EXISTS building_vibes;
-- DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id              CHAR(36)     NOT NULL,
  email           VARCHAR(320) NOT NULL,
  password_hash   VARCHAR(255) NULL COMMENT 'bcrypt 등; Google 전용이면 NULL',
  google_sub      VARCHAR(255) NULL COMMENT 'Google sub, UNIQUE (NULL 여러 개 허용)',
  display_name    VARCHAR(100) NOT NULL,
  avatar_url      TEXT         NULL COMMENT 'Google picture 또는 업로드 CDN URL',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google_sub (google_sub),
  CONSTRAINT chk_users_login_method CHECK (
    password_hash IS NOT NULL OR google_sub IS NOT NULL
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- id 기본값: MySQL 8.0.13+ 에서만 아래 한 줄 주석 해제 가능
-- ALTER TABLE users MODIFY id CHAR(36) NOT NULL DEFAULT (UUID());

CREATE TABLE building_vibes (
  id            CHAR(36)     NOT NULL,
  user_id       CHAR(36)     NOT NULL,
  building_id   VARCHAR(64)  NOT NULL COMMENT 'OSM 등 클라와 동일 문자열',
  city_area     ENUM(
                  'shinjuku',
                  'shibuya',
                  'itaewon',
                  'gangnam'
                )            NOT NULL,
  floor         SMALLINT     NOT NULL,
  genre         VARCHAR(32)  NOT NULL COMMENT '프론트 GenreKey',
  track_name    VARCHAR(512) NULL,
  artist_name   VARCHAR(512) NULL,
  artwork_url   TEXT         NULL,
  preview_url   TEXT         NULL,
  comment       VARCHAR(2000) NULL,
  vibe_tags     JSON         NOT NULL DEFAULT (JSON_ARRAY()) COMMENT '문자열 배열 JSON; 구버전이면 DEFAULT 제거 후 앱에서 [] 삽입',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_building_vibes_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_building_vibes_floor CHECK (floor >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_bv_building_created
  ON building_vibes (building_id, created_at DESC);

CREATE INDEX idx_bv_area_building
  ON building_vibes (city_area, building_id);

CREATE INDEX idx_bv_user_created
  ON building_vibes (user_id, created_at DESC);

-- =============================================================================
-- 샘플: 앱에서 UUID 생성 시 (Node crypto.randomUUID() 결과 그대로)
-- =============================================================================
-- INSERT INTO users (id, email, password_hash, display_name)
-- VALUES (UUID(), 'a@b.com', '$2a$10$...', 'nick');
