# Front — 2026-04-11

**이 파일에 적힌 오늘 날짜 기준 수정·추가 정리는 전부 윤섭이 한 거야.**

---

## 현태한테 전달 사항

### [sella45/vibloc](https://github.com/sella45/vibloc) 이랑 달라진 점 · 우리 쪽에만 있는 것

GitHub에 올라가 있는 [sella45/vibloc](https://github.com/sella45/vibloc) 은 **프론트 한 리포**처럼 보여. (`src/`, Vite, `public/` … 루트에 백엔드 폴더 없음.)

윤섭이 로컬에서 작업한 건 대략 이런 식으로 **더 나가 있어**:

| 구분 | 예전 GitHub 상태 (참고) | 지금 (로컬 = 깃 동일 구조) |
|------|-------------------------|---------------------------|
| 폴더 | 리포 루트가 곧 프론트만 있던 시절이 있었음 | **[sella45/vibloc](https://github.com/sella45/vibloc) 루트 = 모노레포** — **`vibloc-front/`** (예전 vibloc-main), **`vibloc-backend/`**, **`today/`** |
| 라우트 | (옛 구조 기준이면) 맵 위주 | **`/`** 랜딩, **`/login` `/signup`**, **`/map`**, **`/mypage`** + 레이아웃 나눔 |
| 인증 UI | 리포 README만 보면 Street View 키 위주 안내 | **이메일 가입/로그인 + 구글 로그인** UI, 헤더에 **로그인 시 마이페이지·프로필 사진** |
| 상태 저장 | — | 로그인 정보 **브라우저에 유지** (`localStorage`, 새로고침해도 유지) |
| 카피/디자인 | — | 문구 한곳 모음 **`src/content/placeholders.ts`** (`PH`), 디자이너가 나중에 갈아끼우기 쉽게 |
| 헤더 | — | **`MarketingHeader` / `AuthHeader`** 파일로 분리, 여백은 **`index.css`의 `.vibloc-header-inner`** |
| 랜딩 | — | 화면 **가운데 정렬** 쪽으로 레이아웃 조정, 데스크톱에서 장식 타워는 우측 레이어 |
| 맵 화면 | 핵심 앱 | 그대로인데 **로그인하면 우측 상단에 마이페이지 링크+아바타** |
| 기본 프로필 | — | **`public/avatars/default.svg`** (나중에 예쁜 걸로 교체 가능) |
| 작업 로그 | — | **`today/2026-04-11/`** 에 front / backend 로 나눠 적어둠 |

**정리:** 깃에 푸시하면 **일부는 겹치고**, **백엔드 폴더·MySQL DDL·today 노트** 같은 건 리포 구조에 따라 **아직 GitHub 루트랑 1:1로 같지 않을 수 있음.** 팀에서 "프론트만 이 리포에 넣는다"로 정하면 `vibloc-front` 내용만 올리면 됨.

### 데이터베이스

- **DB는 MySQL 쓸 예정**이야.  
- 테이블 만드는 SQL은 백엔드 쪽 **`vibloc-backend/docs/DB_SCHEMA.mysql.sql`** 에 있고, 설명은 **`DB_SCHEMA.md`** 도 봐줘.  
- 지금 서버 코드는 아직 **메모리에 유저 저장**일 수 있어서, MySQL **연결은 다음 단계**야.

### 비밀 값 (.env)

- 구글 로그인·API 주소·JWT 비밀키 같은 건 **`.env` / `.env.local`** 이고 **깃에는 안 올라가** (`.gitignore`).  
- 그래서 **리포만 클론한다고 구글 로그인이 바로 되진 않을 수 있음** → **`.env.example` 보고 로컬 파일 만들어서 채워야 함.**

---

## 현태용 — 쉬운 말로만

- 폴더 이름 정리해서 프론트는 **`vibloc-front`** (말로는 **front**) 쪽에 모아둔 거라고 보면 됨. 깃 [sella45/vibloc](https://github.com/sella45/vibloc) 은 프론트 한 덩어리로 보이고, 우리는 **프론트+백** 나눠 둔 상태일 수 있음.
- 첫 화면이랑 로그인/가입 화면 손봤고, 문구는 **`~설명 들어가는 곳`** 처럼 **`placeholders.ts`** 한 파일에 모아뒀어. 나중에 디자인에서 갈아끼우기 좋게.
- 맨 위 헤더는 파일 둘로 쪼갰어. 로그인하면 **마이페이지**랑 **프로필 자리** 보이고, 사진 없으면 **기본 아이콘**.
- 로그인 상태는 **브라우저가 기억**해 줘서 새로고침해도 안 풀림. 완전 끄거나 로그아웃하면 풀림.
- 구글 로그인은 **니가 `.env` 채워야** 돌아가. 깃에 비번/키 안 올라가는 건 **정상**이야.

---

## 윤섭한 내용 (프론트 · 기술)

### 라우팅·페이지

- **`/mypage`** — 마이페이지(프로필 요약, 맵, 로그아웃). 비로그인 시 안내 + 로그인 링크.
- **`/`**, **`/login`**, **`/signup`**, **`/map`** 유지.

### 인증 UI·상태

- **`useAuthStore`**: `zustand` + **`persist`** → `localStorage` `vibloc-auth`.
- **`AuthUser`**: `avatarUrl` optional → 없으면 **`resolveAvatarUrl`** → 기본 SVG.
- **`UserAvatar`**, **`features/auth/avatar.ts`**, **`public/avatars/default.svg`**.

### 헤더

- **`MarketingHeader`**: 로그인 시 맵 · 아바타+마이페이지 · 로그아웃 / 비로그인 시 맵·로그인·회원가입.
- **`AuthHeader`**: 로그인 시 마이페이지(아바타)·맵 둘러보기.
- **`index.css`**: **`.vibloc-header-inner`**, 전역 `* { padding: 0 }` 제거.

### 랜딩·카피

- **`LandingPage`**: 히어로 뷰포트 중앙, 시티스케이프 데스크톱 우측 `absolute`.
- **`content/placeholders.ts`** (`PH`): 랜딩·인증 aside·로그인/가입·폼·푸터·`mypage`.

### 맵

- **`MapAppPage`**: 우측 상단 다크모드 옆 — 로그인 시 마이페이지+아바타.

### 환경

- **`VITE_API_URL`**, **`VITE_GOOGLE_CLIENT_ID`** — `.env.example` 참고, 커밋 제외.

---

## Google 로그인 (왜 클론만으론 부족한지)

1. 프론트: **`VITE_GOOGLE_CLIENT_ID`** → `.env.local`
2. 백엔드: **`GOOGLE_CLIENT_ID`** → 서버 `.env`
3. 둘 다 **깃 이그노어** → **로컬에서 직접 채움**
4. Google Cloud 콘솔: 승인된 출처(예: `http://localhost:5173`) 등 설정 필요할 수 있음

---

## 현태가 클로드 코드한테 붙여 넣을 말 (예시)

- 「`vibloc-front`야. 인증은 `useAuthStore`, persist 키 `vibloc-auth`. 헤더는 `MarketingHeader` / `AuthHeader`. 마이페이지는 `/mypage` → `MyPage.tsx`. 카피는 `src/content/placeholders.ts`의 `PH`만 건드려.」
- 「랜딩은 `LandingPage.tsx`, 헤더 여백은 `index.css`의 `.vibloc-header-inner`.」
- 「구글은 `.env.local`에 `VITE_GOOGLE_CLIENT_ID`, 백 `.env`에 `GOOGLE_CLIENT_ID`. 코드만으론 안 됨.」
- 「기본 프로필은 `public/avatars/default.svg` 교체.」

---

## 예전에 이미 정리돼 있던 것 (참고)

- React Router, `@/`, `MapAppPage` 분리, `tsconfig` `noUnusedLocals` 완화 등 — 자세한 건 깃 히스토리.

---

## 백엔드 쪽은

- **`today/2026-04-11/backend.md`** 봐줘 (MySQL DDL, `avatarUrl`, Google `picture`, Express 등).
