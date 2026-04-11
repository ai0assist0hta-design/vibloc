# Backend — 2026-04-11

**이 파일에 적힌 오늘 날짜 기준 수정·추가 정리는 전부 윤섭이 한 거야.**

---

## 현태한테 전달 사항

### [sella45/vibloc](https://github.com/sella45/vibloc) 이랑 관계

- 그 깃 리포는 **프론트 프로젝트만** 보이는 구조야 (`src/`, Vite …). **Node 백엔드 폴더는 루트에 없음.**
- 윤섭이 로컬에 만든 **`vibloc-backend/`** 는 **그 깃허브에는 아직 없을 수 있음** (또는 나중에 **별도 리포**로 올리거나 **모노레포**로 합치면 됨).
- 프론트가 **`POST /auth/login`**, **`/register`**, **`/google`** 같은 걸 친다고 가정해 둔 상태 — **이 서버가 켜져 있어야** 로그인 플로우가 끝까지 감.

### 데이터베이스 — **MySQL 쓸 예정**

- **PostgreSQL 말고 MySQL** 로 갈 거라고 팀에 맞춰 둔 상태야.
- **테이블 생성 SQL**: **`vibloc-backend/docs/DB_SCHEMA.mysql.sql`** → MySQL 쿼리 창에 붙여 넣으면 됨.
- 설명 문서: **`docs/DB_SCHEMA.md`** (Postgres 초안 + MySQL 파일 안내).
- **아직** 런타임이 메모리 Map 유저면 → MySQL **연결·ORM은 다음 작업**.

### 비밀 값

- **`GOOGLE_CLIENT_ID`**, **`JWT_SECRET`**, **`PORT`**, **`CORS_ORIGINS`** 등 → 서버 **`.env`**. **깃에 안 올라감** → **`.env.example` 보고 로컬에서 복사 생성.**

---

## 현태용 — 쉬운 말로만

- 백엔드 = 우리 앱용 **작은 서버**. 가입·로그인·구글 토큰 검사 같은 거 담당.
- **DB는 MySQL** 쓸 예정이고, 표 설계는 **`DB_SCHEMA.mysql.sql`** 에 있어. 붙여 넣으면 `users` 같은 테이블 생김.
- 구글 로그인 쓰려면 **서버에도 `.env`** 있어야 하고, 그건 **깃에 없음** → 클론만으로는 **자동 완성 안 됨**.
- 구글 로그인하면 **프로필 사진 URL** 저장할 수 있게 해 둠. 이메일만 가입이면 비우고 앱에서 **기본 그림** 씀.

---

## 윤섭한 내용 (백엔드 · 기술)

### 인증·유저 (코드, 메모리 스토어)

- **`UserRecord`**: `avatarUrl` optional.
- **`toPublicUser`**: `avatarUrl` 포함 (null 가능).
- **`verifyGoogleIdToken`**: `picture` 추출.
- **`upsertGoogleUser(..., picture?)`**: 프로필 URL 반영.

### 문서·DB 설계

- **`docs/DB_SCHEMA.md`**
- **`docs/DB_SCHEMA.mysql.sql`** — MySQL 8, `users` + `building_vibes`, 인덱스, FK, `avatar_url`, JSON `vibe_tags`.

### 아직 다음 단계

- MySQL **드라이버 연결** / 쿼리로 유저 CRUD 는 **미연결일 수 있음**.

---

## Google 로그인 — 서버에 필요한 것

| 항목 | 설명 |
|------|------|
| `GOOGLE_CLIENT_ID` | `.env` — ID 토큰 검증 (보통 프론트 웹 클라 ID와 동일) |
| `JWT_SECRET` | JWT 서명 — **절대 커밋 금지** |
| `.gitignore` | `.env` 제외 → 팀은 **`.env.example`** 참고 |

프론트가 **ID 토큰**을 **`POST /auth/google`** 으로내면 → 검증 후 **`accessToken` + `user`** 반환.

---

## 현태가 클로드 코드한테 붙여 넣을 말 (예시)

- 「백엔드는 `vibloc-backend`, Express. 유저는 `src/auth/users.ts` 메모리 Map. 공개는 `toPublicUser`. 구글은 `auth/google.ts`에서 `picture` 파싱해서 `upsertGoogleUser`에 넘김.」
- 「DB는 MySQL. `docs/DB_SCHEMA.mysql.sql` 먼저 실행하고, 그다음 이 스키마에 맞게 `users` 읽기/쓰기 연결해 줘.」
- 「비밀 값은 다 `.env`. 레포엔 `.env.example`만.」

---

## 프론트 쪽은

- **`today/2026-04-11/front.md`** — 깃허브랑 다른 점은 거기 표가 더 자세함.

---

## 예전에 이미 정리돼 있던 것 (참고)

- Express, `GET /health`, CORS, `PORT`, ESM TS, `npm run dev` / `build` / `start`
