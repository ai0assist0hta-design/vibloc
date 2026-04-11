# VIBLOC DB 설계 (초안)

건물 지오메트리는 클라이언트 OSM 정적 데이터로 두고, **서버는 사용자·인증·맵에 남기는 "바이브(태그)"**만 영속화하는 전제입니다.

- **MySQL** (쿼리 창 복붙): [`DB_SCHEMA.mysql.sql`](./DB_SCHEMA.mysql.sql) — `ENUM`·`JSON`·`CHAR(36)` UUID, InnoDB / utf8mb4.
- 아래 본문 DDL은 **PostgreSQL** 기준 예시입니다.

---

## 1. 개체 관계 요약

```
users ──< building_vibes
```

- **users**: 이메일/비밀번호 또는 Google 로그인 (`UserRecord`와 대응). 프로필 사진은 **`avatar_url` NULL 허용** — 없으면 프론트 기본 이미지.
- **building_vibes**: 건물 ID(OSM 등) + 층 + 장르 + (선택) 트랙 메타 + `vibe_tags[]` (`Tag` 타입과 대응).

추후 확장 시 예시: `refresh_tokens`, `user_follows`, `reports`, `music_cache`, **`user_media`(업로드 원본 메타)** 등.

---

## 2. ENUM / 도메인

```sql
-- 도시 타일(프론트 CITY_AREAS 키와 맞추면 조회·파티셔닝에 유리)
CREATE TYPE city_area AS ENUM (
  'shinjuku',
  'shibuya',
  'itaewon',
  'gangnam'
  -- 필요 시 추가
);

-- 프론트 GenreKey와 1:1 문자열로 저장 (마이그레이션으로 키 추가)
-- ENUM으로 고정할 수도 있으나, 장르 추가 때마다 DB 마이그레이션 필요 → VARCHAR(32) 권장
```

---

## 3. 테이블 정의

### 3.1 `users`

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `email` | `CITEXT` 또는 `VARCHAR(320)` | `UNIQUE`, `NOT NULL` |
| `password_hash` | `TEXT` | NULL 허용 (Google 전용 계정) |
| `google_sub` | `VARCHAR(255)` | `UNIQUE` WHERE NOT NULL |
| `display_name` | `VARCHAR(100)` | `NOT NULL` |
| `avatar_url` | `TEXT` | NULL — **선택**. Google `picture` 동기화 또는 S3/버킷 공개 URL |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` |

**프로필 이미지 정책 (권장)**

- 회원가입 시 **필수 아님** → `avatar_url` NULL.
- **Google 로그인**: ID 토큰의 `picture`를 최초·재로그인 시 저장(외부 URL, 만료/변경 가능 — 주기적 갱신 또는 마이페이지에서 "Google과 동기화" 버튼).
- **직접 업로드**: 바이너리는 DB에 넣지 않고 객체 스토리지(S3, R2, GCS 등)에 올리고 **`avatar_url`만 저장**. `user_media` 테이블로 `storage_key`, `mime`, `bytes`, `created_at` 추적하면 삭제·감사에 유리.

인덱스:

- `CREATE UNIQUE INDEX users_email_lower ON users (lower(email));` — 이미 CITEXT면 생략 가능.
- `CREATE UNIQUE INDEX users_google_sub_uq ON users (google_sub) WHERE google_sub IS NOT NULL;`

비고:

- JWT만 쓰고 리프레시 토큰을 DB에 안 둘 경우 세션 테이블은 생략.
- `display_name` 변경 시 `updated_at` 트리거 권장.

---

### 3.2 `building_vibes`

사용자가 맵에서 건물·층에 남기는 태그 한 건 = 한 행 (`Tag`).

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `id` | `UUID` | PK |
| `user_id` | `UUID` | FK → `users(id)` ON DELETE CASCADE |
| `building_id` | `VARCHAR(64)` | `NOT NULL` — 프론트/OSM 식별자 (`osm-123` 등) 그대로 |
| `city_area` | `city_area` | `NOT NULL` — 어느 타일에서 찍었는지 |
| `floor` | `SMALLINT` | `NOT NULL`, CHECK `>= 1` |
| `genre` | `VARCHAR(32)` | `NOT NULL` — `GenreKey` |
| `track_name` | `VARCHAR(512)` | NULL |
| `artist_name` | `VARCHAR(512)` | NULL |
| `artwork_url` | `TEXT` | NULL |
| `preview_url` | `TEXT` | NULL |
| `comment` | `VARCHAR(2000)` | NULL |
| `vibe_tags` | `JSONB` | `NOT NULL DEFAULT '[]'` — 문자열 배열 |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` |

인덱스 (조회 패턴 기준):

```sql
CREATE INDEX building_vibes_building_created_idx
  ON building_vibes (building_id, created_at DESC);

CREATE INDEX building_vibes_area_building_idx
  ON building_vibes (city_area, building_id);

CREATE INDEX building_vibes_user_created_idx
  ON building_vibes (user_id, created_at DESC);
```

비고:

- 건물 마스터 테이블은 두지 않음(정적 OSM). `building_id`는 **문자열 외부 키**로만 취급.
- `vibe_tags`를 정규화하려면 나중에 `vibe_tag_dictionary` + M:N 분리 가능.

---

## 4. DDL 일괄 (복붙용)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TYPE city_area AS ENUM (
  'shinjuku', 'shibuya', 'itaewon', 'gangnam'
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT,
  google_sub      VARCHAR(255),
  display_name    VARCHAR(100) NOT NULL,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_google_sub_unique UNIQUE (google_sub),
  CONSTRAINT users_has_login CHECK (
    password_hash IS NOT NULL OR google_sub IS NOT NULL
  )
);

CREATE TABLE building_vibes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  building_id   VARCHAR(64) NOT NULL,
  city_area     city_area NOT NULL,
  floor         SMALLINT NOT NULL CHECK (floor >= 1),
  genre         VARCHAR(32) NOT NULL,
  track_name    VARCHAR(512),
  artist_name   VARCHAR(512),
  artwork_url   TEXT,
  preview_url   TEXT,
  comment       VARCHAR(2000),
  vibe_tags     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX building_vibes_building_created_idx
  ON building_vibes (building_id, created_at DESC);
CREATE INDEX building_vibes_area_building_idx
  ON building_vibes (city_area, building_id);
CREATE INDEX building_vibes_user_created_idx
  ON building_vibes (user_id, created_at DESC);
```

`users_has_login`은 "이메일만 넣고 둘 다 NULL" 같은 깨진 행 방지용. 정책에 맞게 조정 가능.

---

## 5. API 매핑 (현재 코드 기준)

| 백엔드 메모리 | DB 테이블 |
|----------------|-----------|
| `UserRecord` (+ `avatarUrl`) | `users.avatar_url` |
| (없음, 프론트 `useBuildingStore` 로컬) | `building_vibes` |

추가 API 예시:

- `GET /auth/me` — JWT로 `users` 한 건 조회, `avatar_url`·`display_name` 갱신 반영(프론트는 로그인 직후뿐 아니라 주기적/포커스 시 호출 권장).
- `PATCH /users/me` — 닉네임, (업로드 후) `avatar_url` 갱신.
- `POST /vibes` — 인증 필요, 본문에 `buildingId`, `cityArea`, `floor`, `genre`, 선택적 트랙 필드.
- `GET /buildings/:buildingId/vibes` — 공개 피드 또는 페이지네이션.

---

## 6. 이후 단계 (선택)

| 테이블 | 용도 |
|--------|------|
| `refresh_tokens` | 해시 저장, 로테이션, 기기별 로그아웃 |
| `music_query_cache` | Wikidata/iTunes 응답 키드 캐시 (TTL) |
| `user_blocks` / `reports` | UGC 신고·차단 |

---

## 7. 로컬 개발 대안

- **MySQL 8.0+**: `docs/DB_SCHEMA.mysql.sql` 사용. `CHECK`는 8.0.16+부터 강제. `users.id` 기본 `UUID()`는 8.0.13+ 주석 참고.
- **SQLite**: `ENUM` → `TEXT` + CHECK, `JSONB` → `TEXT` JSON, `CITEXT` → `TEXT COLLATE NOCASE`.
- **Prisma / Drizzle**: 위 스키마를 그대로 옮기면 마이그레이션 자동화에 유리합니다.

이 문서는 초안입니다. 실제 배포 전에 RLS(멀티테넌트)·보존 기간·GDPR 삭제 정책만 팀 규칙에 맞게 보완하면 됩니다.
