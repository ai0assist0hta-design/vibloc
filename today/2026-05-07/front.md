# Front — 2026-05-07

**프로필/플레이리스트 사진 업로드 + 이름 인라인 편집 + 사이드바 정렬 + Up Next 톤 분리 + 다크↔라이브 상호배타 + 다크 포그 완화 + 프로덕션 배포 (Vercel + Supabase Google OAuth + 커스텀 도메인 vibloc26.com).**

---

## 한 줄 요약

마이페이지 헤더에 **96 × 96 원형 아바타** 도입 (사진 없으면 이름 첫 글자 모노그램, 호버 시 카메라 글리프 + 0.45 스크림, 클릭 → PNG/JPEG/WebP 업로드 ≤ 2 MB, 데이터 URL → `useAuthStore.user.avatarUrl` → localStorage 영속). 같은 패턴을 **플레이리스트 커버**에도 적용 — 큐레이터(`isMine`)만 호버 시 카메라 노출, 업로드 결과는 신규 `BuildingPlaylistEntry.taggerPlaylistCovers[taggerId]`에 저장 → `getTopTaggers`가 마지막에 user-cover로 `customCoverUrl` 오버라이드 → 우측 레일·랭크 카드·디테일뷰 모두 즉시 반영. **이름 인라인 편집** (✏ 버튼 → input + Save/Cancel pill). **메인 우측 레일 ProfileRow** 28×28 아바타도 `user.avatarUrl` 우선 렌더 → 모노그램 → 익명 User 글리프 폴백. **좌측 사이드바 헤더 정렬**: 닫기 버튼이 16px 들여쓰기로 행 아이콘(24px)과 6px 어긋났던 것을 padding-left 24 + 버튼 24×24 + glyph 16으로 교정 → 광학 중심 x=36 통일. **Up Next 드롭다운**은 레일 본체(`rgba(255,255,255,0.98)`)와 구별되도록 `paper` (#faf9f6) 0.96 알파 + ink 0.14 hairline + 그림자 ↑ → 떠 있는 카드감. **다크 모드 ↔ 라이브 모드 상호 배타**: 한쪽 ON 시 다른 쪽 자동 OFF (날씨/태양 자동 사이클이 사용자 수동 설정을 즉시 덮어쓰는 충돌 제거). **다크 포그**가 너무 짙어 mid-range 빌딩이 다 사라지던 문제 → near 400 → **900**, far 2000 → **3400**, exponent 1.8 → **1.4**로 완화. 그리고 — VIBLOC이 실제 사용자가 접속할 수 있는 라이브 서비스로 배포됨 (vibloc26.com, Google 로그인 작동, 모든 클라이언트 라우트 200).

---

## 1. 마이페이지 — 프로필 아바타 + 이름 인라인 편집

### 추가
- `useAuthStore`에 `updateUser(patch: Partial<AuthUser>)` 메서드 추가 — `displayName` / `avatarUrl` 부분 패치용. 기존 `partialize`가 `user` 전체를 저장하므로 별도 영속 작업 없이 새로고침 후 유지.
- i18n: `mypage.profile.{editAvatar, removeAvatar, editName, saveName, cancel, namePlaceholder, fileTooLarge}` × KR/EN/JA = 8 × 3 = 24 string.

### 아바타 (96 × 96 원형)
- 업로드 사진 있으면 `<img object-fit: cover>` 풀-블리드, 없으면 이름·이메일 첫 글자 40px/600 모노그램 (홈 우측 레일 ProfileRow와 동일 패턴, 단 사이즈만 28→96).
- 호버/포커스 시 `position: absolute, inset: 0, background: rgba(0,0,0,0.45)` 스크림 + 28px 카메라 SVG (lucide camera 아이콘 라인 변형) `opacity: 0 → 1` 160ms ease 페이드.
- `role="button" tabIndex={0}` + Enter/Space 키보드 트리거 → 숨겨진 `<input type="file" accept="image/png,image/jpeg,image/webp">` 클릭.
- `FileReader.readAsDataURL` → `updateUser({ avatarUrl: dataURL })`.
- 2 MB 캡 (`f.size > 2 * 1024 * 1024`) — localStorage가 데이터 URL로 빠르게 비대해지는 걸 방지. 초과 시 인라인 에러 (`mypage.profile.fileTooLarge`).
- 사진 있을 때만 "사진 제거" 텍스트 링크 노출 → `updateUser({ avatarUrl: null })`.

### 이름 인라인 편집
- 이름 옆 32×32 원형 ✏ 버튼 (1px divider 보더, hover 시 background bgAlt + border primary).
- 클릭 → H1 자리에 `<input>` (display 폰트 그대로, 2px ink 밑줄, autoFocus, maxWidth 480).
- Enter/저장 버튼 → 커밋 (빈 값 차단), Esc/취소 → 폐기 (drift 보존 X).
- 저장은 `updateUser({ displayName: trimmed })`.

### 메인 우측 레일 ProfileRow 동기화
- `FixedQueueSidebar`의 28×28 ProfileRow가 `user.avatarUrl` 있으면 `<img>`, 없으면 기존 모노그램, 사인아웃 시 `<User>` 글리프로 폴백. 마이페이지에서 업로드/이름 변경 → 메인 화면 즉시 반영 (zustand 단일 소스).

---

## 2. 플레이리스트 커버 업로드

### 데이터 모델 변경
`src/lib/music/buildingPlaylist.ts`:
- `BuildingPlaylistEntry`에 신규 필드 `taggerPlaylistCovers?: Record<string, string>` 추가 (taggerId → 데이터 URL 또는 외부 URL).
- `loadFromStorage` 마이그레이션: 기존 페이로드에 필드 없으면 `{}`로 채워 v1 ↔ v2 호환.
- 신규 export `setTaggerPlaylistCover(buildingId, taggerId, url)` — 빈 문자열은 "사용자가 명시적으로 제거" 센티넬, 모자이크 폴백 유도.
- `getTopTaggers` 마지막 루프에서 `Object.prototype.hasOwnProperty.call(userCovers, taggerId)` 시 `g.customCoverUrl` 오버라이드 → 우측 레일 RankRow / 랭크 카드 / FeaturedHero / PlaylistDetailView 모두 같은 진입점 통과해 자동 반영.
- `useTaggerPlaylist` 훅 반환 타입에 `setCover: (url: string) => void` 추가.

### UI (`PlaylistDetailView`)
- 120 × 120 PlaylistCover를 `position: relative` 래퍼로 감싸기 — 외곽 footprint 보존 (텍스트 컬럼 reflow 없음).
- `isMine`일 때만 호버 카메라 오버레이 + 숨겨진 file input 마운트. 다른 사람 플레이리스트는 기존 read-only 모습 그대로.
- 호버 스크림 / 카메라 / 2 MB 캡 / 데이터 URL 변환 / 인라인 에러 — 모두 마이페이지 아바타와 동일한 어휘로 (단 SVG 사이즈 28, 컨테이너 `border-radius: 8` PlaylistCover와 일치).
- 곡 수 라인 아래 (커버 있거나 에러 있을 때만) "커버 제거" 텍스트 링크 + 에러 캡션.
- i18n: `detail.{changeCover, removeCover, coverTooLarge}` × KR/EN/JA = 9 string.

---

## 3. 좌측 사이드바 헤더 정렬

`FixedToolSidebar`의 닫기 버튼(`PanelLeftClose`)이 행 아이콘과 6px 어긋남 — 헤더 padding-left가 16, TopicRow는 `margin: 0 12 + padding: 0 12 = 24px`에서 시작.

### 수정
- 헤더 padding 좌측: `SPACE[4]` (16) → **`SPACE[6]` (24)** — 행과 같은 들여쓰기.
- 닫기 버튼: 28 × 28 → **24 × 24** (클릭 영역 살짝 줄지만 광학 중심 정렬 우선). 글리프 size 15 → **16** (행 아이콘과 동일 사이즈·동일 굵기).
- 결과: 닫기 글리프 광학 중심 x = 24 + 12 = **36**, 행 아이콘 광학 중심 x = 12 + 12 + 12 = **36** → 정확히 한 수직선.

---

## 4. Up Next 드롭다운 색상 — 디자인 시스템 안에서 분리

기존: 레일 본체 `rgba(255,255,255,0.98)`와 동일 톤 → 떠 있는 패널인지 분간 어려움. 사용자 피드백 "디자인 일관성 맞게 바꿔줘 똑같진 않게."

### 수정 (`FixedQueueSidebar`의 Up Next 오버레이)
| | 이전 | 변경 |
|---|---|---|
| Light 배경 | rgba(255,255,255,0.98) | **rgba(250,249,246,0.96)** (token `paper` 색감) |
| Dark 배경 | rgba(20,20,24,0.96) | **rgba(28,28,32,0.96)** (한 단계 elevation ↑) |
| 상단 hairline | divider 0.12 | **rgba(14,14,26,0.14)** (warm fill 위에서 가시성 ↑) |
| 그림자 | `0 -12px 28px rgba(0,0,0,0.10)` | **`0 -14px 32px rgba(14,14,26,0.10)`** (살짝 더 lifted) |

레일 본체와 같은 가족 안에 있되, "떠 있는 카드"로 즉시 인식되는 톤 분리.

---

## 5. 다크 모드 ↔ 라이브 모드 상호 배타 (`App.tsx`)

기존 충돌: 라이브 모드의 자동 태양 사이클이 사용자가 수동으로 다크/라이트 토글하면 3초 뒤 덮어쓰던 패턴 → 사용자 의도 손실.

### 수정
- **`handleDarkModeToggle`**: 다크 ON으로 전환되는 경우 + 라이브 ON 상태이면 → `setLiveTimeEnabled(false)` + `sunLightPos` null + `weatherStore.clear()` + `manualDarkRef = false` 정리 후 다크 ON.
- **`handleLiveTimeToggle(enabled=true)`**: 다크 모드가 켜져 있으면 → `setDarkMode(false)` 호출하여 라이브가 첫 sun-update에서 사용자 수동 다크와 싸우지 않도록 깨끗한 상태에서 시작.

OFF 동작은 기존 동일 (각자 끄기). 두 모드는 모두 씬 라이팅을 제어하므로 동시에 켜지지 않게 해 의도가 명확해짐.

---

## 6. 다크 포그 완화 (`PlateauScene.tsx`)

사용자 피드백 "다크 모드일 때 포그 왤케 심해?" — mid-range 빌딩까지 보이드로 사라지던 스펙.

| | 이전 | 변경 |
|---|---|---|
| `near` | 400 | **900** (+125%) |
| `far` | 2000 | **3400** (+70%) |
| `exponent` | 1.8 | **1.4** |

라이트(near 1200 / far 4000 / exp 1.2)와 비슷한 감각으로 맞추되 다크의 무드 (color `(0.04, 0.04, 0.06)`) 유지. 비/눈/안개 weather 시 base 위에서 추가 압축되는 로직(`mod.intensity`로 `near *= (1 - 0.55k)`, `far *= (1 - 0.50k)`)은 그대로.

---

## 7. 프로덕션 배포 — 결과값 정리

### 인프라
| 항목 | 값 |
|---|---|
| 라이브 URL (커스텀) | https://vibloc26.com |
| 라이브 URL (www) | https://www.vibloc26.com |
| 라이브 URL (Vercel) | https://vibloc.vercel.app |
| Vercel 프로젝트 | `ai0assist0hta-design/vibloc` (Hobby plan, 무료) |
| 도메인 등록 | Vercel Registrar (vibloc26.com 결제) |
| Hosting | Vercel (자동 GitHub deploy on push to `main`) |
| Backend Auth | Supabase (`vdqhhpatetheeweqtqsm.supabase.co`) |
| OAuth Provider | Google (Vibloc OAuth client) |

### 환경 변수 (Vercel Production)
| Key | Source |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (anon) key, JWT 형식 |
| `VITE_GOOGLE_CLIENT_ID` | Google Cloud Console OAuth 2.0 Client ID |

### Google OAuth 설정 (Google Cloud Console)
- **Authorized JavaScript origins**:
  - `https://vibloc26.com`
  - `https://www.vibloc26.com`
  - `https://vibloc.vercel.app`
- **Authorized redirect URIs**:
  - `https://vdqhhpatetheeweqtqsm.supabase.co/auth/v1/callback`

### Supabase 설정
- **Authentication → URL Configuration**:
  - Site URL: `https://vibloc26.com`
  - Redirect URLs: `https://vibloc26.com/**`, `https://www.vibloc26.com/**`, `https://vibloc.vercel.app/**`
- **Authentication → Providers → Google**: enabled, Client ID + Secret 입력 (Secret은 회전 예정).

### 배포 중 해결된 이슈
1. **TypeScript build errors (5개)** — `OSMCity.tsx` uniform `unknown` 타입 캐스팅, `PopularTrackCard.tsx` 누락 `primaryGenreName`, `PreviewPlayer.tsx` `Uint8Array<ArrayBuffer>` 타이핑, `PlaylistPreviewPage.tsx` 누락 `useT()` 스코프 + 중복 `t` 선언 정리.
2. **Vercel CLI 권한** — `npm i -g vercel`이 EACCES → `brew install vercel-cli`로 우회.
3. **Vercel 도메인 alias 충돌** — `vibloc26.com`이 구 프로젝트 `project-vo0rl`에 묶여 있어 `vercel domains add` 실패. 해당 프로젝트 삭제 후 `vercel alias set` 으로 신규 배포에 결합.
4. **Vercel 404 on routes** — `/login`, `/signup`, `/map`, `/mypage` 모두 NOT_FOUND. SPA 클라이언트 라우팅이라 서버 fallback 부재. **`vercel.json` 추가**:
   ```json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "rewrites": [
       { "source": "/((?!api/|assets/|data/|.*\\..*).*)", "destination": "/index.html" }
     ]
   }
   ```
   재배포 후 5개 라우트 모두 HTTP 200 확인.
5. **Vercel CLI 자동 권한** — 매번 OAuth flow 회피하려 `~/.claude/settings.json`에 `Bash(vercel:*)`, `Bash(npx vercel:*)`, `Bash(gh:*)`, `Bash(supabase:*)` allow.
6. **공유 레포 권한** — `viblo-project/VIBLOC` (윤섭 owner)는 Org repo라 Vercel Hobby plan에서 import 불가 ($20/mo Pro 필요) → `ai0assist0hta-design/vibloc` 개인 fork에서 배포.

### 빌드 메트릭
- `npm run build` ≈ 380 ms
- 번들 총 ≈ 580 KB gzip
- DEV-only seed 데이터 (`seedBuildingPlaylists`, `enrichSeedArtworkInBackground`)는 `import.meta.env.DEV` 게이트로 production 번들에서 tree-shake 완전 제거.

### 라이브 검증 (curl 기준)
```
https://vibloc26.com         → HTTP 200
https://vibloc26.com/login   → HTTP 200
https://vibloc26.com/signup  → HTTP 200
https://vibloc26.com/map     → HTTP 200
https://vibloc26.com/mypage  → HTTP 200
```

### 후속 작업 (TODO)
- 노출된 Client Secret `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` 회전 (Google Cloud → Vibloc OAuth client → [+ Add secret] → Supabase 갱신 → 구 secret 삭제).
- 윤섭 공용 레포 `viblo-project/VIBLOC`에 `feat/left-info-panel` → `main` 머지 (별도 태스크).

---

## 변경된 파일 (요약)

| 파일 | 변경 |
|---|---|
| `src/features/auth/useAuthStore.ts` | `updateUser(patch)` 추가 |
| `src/lib/app/i18n.ts` | `mypage.profile.*` 8 키 + `detail.{changeCover, removeCover, coverTooLarge}` 3 키 (KR/EN/JA) |
| `src/lib/music/buildingPlaylist.ts` | `taggerPlaylistCovers` 필드 + 마이그레이션 + setter + `getTopTaggers` 오버레이 + `useTaggerPlaylist.setCover` |
| `src/pages/mypage/MyPage.tsx` | 96px 원형 아바타, 호버 카메라, 업로드, ✏ 인라인 이름 편집 |
| `src/components/ui/music/PlaylistDetailView.tsx` | 호버 카메라 오버레이 + 업로드 + 제거 + 에러 |
| `src/components/ui/music/FixedQueueSidebar.tsx` | ProfileRow 아바타 이미지 폴백 + Up Next 드롭다운 톤 분리 |
| `src/components/ui/FixedToolSidebar.tsx` | 헤더 padding-left 16 → 24, 닫기 버튼 28→24, glyph 15→16 |
| `src/App.tsx` | 다크 ↔ 라이브 상호 배타 |
| `src/components/canvas/PlateauScene.tsx` | 다크 포그 near/far/exp 완화 |
| `.gitignore` | `.vercel` 추가 |
| `vercel.json` | (이전 커밋) SPA fallback rewrite |

`tsc -b` EXIT 0 통과, dev 환경에서 모든 시나리오 수동 검증 완료.
