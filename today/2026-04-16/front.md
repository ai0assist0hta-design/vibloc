# Front — 2026-04-16

**이 파일에 적힌 오늘 날짜 기준 수정·추가는 현태 쪽에서 한 거야.**
(윤섭이 4/11에 깔아둔 today 컨벤션 그대로 따라감 — 개발자용 요약 + 비개발자 쉬운 말 + Claude Code 프롬프트 예시.)

---

## 현태한테 전달 사항 (= 윤섭한테 보고용)

### 한 줄 요약
오른쪽/왼쪽 패널 정보 구조와 음악 인터랙션을 전부 다시 짰음. **건물 클릭 → 패널이 그 건물 옆에 자동으로 붙어서 카메라 따라 부드럽게 이동.** 플레이리스트는 **태거(큐레이터)별로 그룹화**되고 좋아요·댓글 다 별개로 굴러감.

### [윤섭이 만든 4/11 구조] 위에 새로 들어간 것

| 영역 | 변경 내용 |
|------|-----------|
| **데이터 (`buildingPlaylist.ts`)** | 핀 트랙에 `taggerId/Name/AvatarUrl/likes/likedBy` 추가. `taggerNotes`(태거별 코멘트) + `playlistLikedBy`(플레이리스트 단위 좋아요) 도입. `MIN_PLAYLIST_TRACKS = 3` (3+개여야 정식 플리). 헬퍼: `getTopTaggers/useTopTaggers/getTopTrack/useTopTrack/togglePlaylistLike/useTaggerPlaylist/subscribePlaylists/reloadFromStorage` 등 추가. |
| **오른쪽 패널 섹션 순서** | 🌃 CITY VIBE → 🔎 SEARCH → 👑 TOP PLAYLISTS → 🔥 TOP PICKS → AI 추천곡 → MY PLAYLIST. **Mood 카테고리 칩 / "TAG A TRACK" 라벨 / "더보기" 전부 제거.** |
| **TOP PLAYLISTS 카드 (신규 `TopTaggerCard.tsx`)** | 좋아요 합계 기준 1~3위. 각 행 = 순위 뱃지(🥇🥈🥉) + 원형 프로필 + 닉네임 + `@가명`(taggerId 해시 → `@midnight.tape` 같은 결정론적 alias) + 트랙 수 + ❤ 합계. **하트 클릭 = 플리 좋아요만 토글, 행 다른 곳 클릭 = 상세 진입** (`stopPropagation`). |
| **TOP PICKS 카드 (신규 `PopularTrackCard.tsx`)** | 가장 많이 핀된 개별 트랙. 우선순위: 이 건물 → 이웃 빌딩 폴백(NEARBY 뱃지로 표시). 빈 상태도 항상 placeholder 노출. |
| **PlaylistDetailView (신규)** | TOP PLAYLISTS 행 클릭 시 우측 패널 본문이 큐레이터 단독 뷰로 전환. 큰 원형 프로필 + 닉네임 + `@가명` + 코멘트(본인이면 인라인 편집, 타인이면 `"…"` 인용 박스) + 그 큐레이터가 핀한 트랙 리스트. ← BACK 누르면 원래 섹션 복원. |
| **MY PLAYLIST DRAFT 뱃지** | 1~2개 핀한 상태면 헤더에 노란 `DRAFT · N/3` 뱃지. 3개 채워야 사라지고 description 입력창도 그때 활성화. |
| **태거 카드 (BuildingPlaylist 내부)** | 각 핀 트랙 아래에 인스타 스타일 원형 아바타 + 태거 이름 + 하트(개별 트랙 좋아요) 라인 추가. |
| **왼쪽 패널 자동 위치** | 빌딩 클릭 → **3D 좌표를 매 프레임 화면 좌표로 투영** (`PlateauScene` 안 `BuildingScreenProjector`) → 패널이 그 건물 좌상단 옆에 붙음. **빌딩 실루엣 자동 회피**(footprint radius 기반 오프셋), 화면 가장자리 닿으면 반대편으로 플립, 카메라 회전 시 **rAF + exponential smoother(half-life 110ms)로 부드럽게 따라감.** CSS transition 안 씀(매 프레임 재이징 stutter 방지). |
| **왼쪽 패널 디자인** | 배경/보더/섀도우 전부 제거 → 맵 위에 떠있는 텍스트 느낌. 다크/라이트 자동 text-shadow로 가독성. 입점 정보 "더보기" 제거 → 전부 노출. |
| **헤더 프로필 핀** | DEV_ADMIN에 기본 아바타(`/avatars/default.svg`) 명시 부여. |
| **데모 시드 (`features/dev/seedAgents.ts`)** | dev 모드에서 빌딩이 로드되면 자동으로 8명의 가짜 큐레이터(Luna Park, Jiro Tanaka 등 — DiceBear 무료 아바타 API)가 픽한 플레이리스트가 채워짐. 결정론적 (같은 buildingId → 같은 데이터). `SEED_VERSION` 도입으로 스키마 바꾸면 시드 자동 갱신, **실제 유저 핀(`agent-` prefix 아닌 것)은 절대 안 건드림.** |
| **MyPage** | 랜딩 디자인 시스템(8px 그리드 / 720px 컨테이너 / inline style)에 맞춰 전면 재작성. 통계, 장르 분포, 플리 카드, 최근 활동, 관심 태그. |

### 제거한 것
- AddTrackComposer mood 카테고리 칩 6개 / `TAG A TRACK` 라벨
- RecommendedList의 "Show More / Show Less" progressive disclosure → 전체 노출
- 왼쪽 패널 입점 정보 "더보기 (+N)" → 전체 노출
- TENANT_PREVIEW_COUNT 상수
- DJ 데스크 옥상 미니어처 시도 (작업 후 사용자 요청으로 제거)

### 안 건드린 것
- 인증 / 라우터 / placeholders.ts / 헤더 분리 (윤섭 4/11 구조 그대로)
- `vibloc-backend/`, MySQL DDL — 이 작업은 전부 프론트 + localStorage 안에서만

---

## 현태용 — 쉬운 말로만

- 건물 누르면 **그 건물 옆에 패널이 붙어서** 카메라 돌리면 같이 부드럽게 따라옴. 건물 위는 안 가림.
- 오른쪽 패널은 위에서부터: **도시 분위기 → 검색바 → 인기 플레이리스트 1·2·3등 → 인기곡 → AI 추천 → 내 플리** 순서.
- 인기 플레이리스트 카드의 **하트만** 누르면 좋아요만 올라감, **다른 데** 누르면 그 사람 플레이리스트 안으로 들어감.
- 그 안엔 **만든 사람 프로필 + 코멘트 + 노래 리스트**가 보임. 내 플리면 코멘트 바로 편집됨.
- **3곡 이상 모아야 진짜 "플리"**로 인정됨. 1~2곡일 땐 노란 `DRAFT 2/3` 뱃지 떠 있음.
- 사용자가 아직 없으니까 **가짜 큐레이터 8명**이 자동으로 데이터 채움. 실제로 내가 핀해 넣으면 그건 안 지워지고, 가짜 데이터만 갈아치워짐.
- 왼쪽 패널 **입점 정보**는 더보기 없이 **전부 다 보임**. 배경도 없어서 맵이 다 비침.

---

## 윤섭한 내용 (프론트 · 기술 — 새 코드 위치)

### 새 파일
- `src/components/ui/music/TopTaggerCard.tsx` — 1~3위 큐레이터 랭킹
- `src/components/ui/music/PopularTrackCard.tsx` — 인기곡 단일 카드
- `src/components/ui/music/PlaylistDetailView.tsx` — 큐레이터 단독 뷰
- `src/features/auth/devAdmin.ts` — 개발용 어드민 즉시 로그인
- `src/features/dev/seedAgents.ts` — 데모 큐레이터 시드 (dev 전용, 동적 import)
- `src/features/profile/useProfileData.ts` — MyPage용 집계 hook
- `today/2026-04-16/front.md` — 이 파일

### 수정 핵심
- **`src/lib/music/buildingPlaylist.ts`** — 데이터 단일 소스. `MIN_PLAYLIST_TRACKS=3`, `TaggerGroup`, `PopularTrack`, `getTopTaggers/getTopTrack/togglePlaylistLike/useTaggerPlaylist`, `subscribePlaylists`, `reloadFromStorage` export.
- **`src/components/canvas/PlateauScene.tsx`** — `BuildingScreenProjector`(<Canvas> 내부, useThree로 카메라 투영) + `onSelectedAnchor` prop + `BuildingScreenAnchor` 타입 export.
- **`src/App.tsx`** — `bldgAnchor` 상태 + rAF lerp 루프(panelTargetRef / panelCurrentRef → DOM 직접 mutate, React state 안 씀). 왼쪽 패널 ref 부착, CSS transition 제거. 우측 패널 섹션 순서 재배치 + `detailTaggerId` 상태로 본문 swap. dev 모드에서 buildings 로드 시 `seedAgents` 동적 import.
- **`src/main.tsx`** — `seedDevAdmin()` + `setUserIdentityProvider`로 auth ↔ playlist 모듈 사이 순환 의존 회피.
- **`src/components/ui/music/AddTrackComposer.tsx`** — mood 칩/라벨 제거, 검색 입력 강조.
- **`src/components/ui/music/RecommendedList.tsx`** — show-more 제거, 전부 노출.
- **`src/components/ui/music/BuildingPlaylist.tsx`** — DRAFT 뱃지, 태거 인스타 카드, 트랙별 ❤ 토글.
- **`src/lib/app/i18n.ts`** — `panel.tenants`, `music.taggedBy` 추가.
- **`src/pages/mypage/MyPage.tsx`** — 랜딩 디자인 시스템 통일 재작성.

### 데이터 스키마 (localStorage `vibloc.playlists.v1`)
```ts
Record<buildingId, {
  tracks: PinnedTrack[],        // taggerId/Name/AvatarUrl/likes/likedBy
  description: string,           // 레거시, 빌딩 단위
  taggerNotes: Record<taggerId, string>,         // 태거별 코멘트
  playlistLikedBy: Record<taggerId, string[]>,   // 플리 단위 좋아요
}>
```
시드 마커: `vibloc.demo.seedVersion` (현재 `v3-min-3-tracks`).

### 성능 노트
- `BuildingScreenProjector`: `useFrame` 안에서 1px 미만 변화는 emit 안 함 → 카메라 정지 시 0회 setState.
- 패널 위치: rAF가 DOM ref 직접 mutate (React 안 거침) → 매 프레임 재렌더 0.
- 시드: dev 모드 + 동적 import → 프로덕션 번들 0 추가.

---

## 현태가 클로드 코드한테 붙여 넣을 말 (예시)

- 「플레이리스트 데이터는 **`src/lib/music/buildingPlaylist.ts`** 의 `usePlaylist/useTopTaggers/useTaggerPlaylist`에서 다 가져와. 직접 localStorage 만지지 말고 거기 export 함수만 써.」
- 「우측 패널 새 섹션 추가하면 **`src/App.tsx`**의 `<>...</>` 블록 안 (CityVibeBlock 위/아래 등)에 끼워. 디자인 토큰은 `text/text2/text3/divider`만 쓰고 직접 색 적지 마.」
- 「큐레이터 단독 뷰는 `PlaylistDetailView`. `setDetailTaggerId(id)` 호출하면 본문이 거기로 바뀜.」
- 「3D 씬에서 빌딩 스크린 좌표 필요하면 `PlateauScene`의 `onSelectedAnchor` prop 써. `BuildingScreenAnchor = { x, y, radius, inFront }`.」
- 「DEV 모드 가짜 데이터 추가/수정은 **`src/features/dev/seedAgents.ts`** AGENTS·TRACK_POOL 배열만 만지면 됨. `SEED_VERSION` 문자열 바꾸면 다음 새로고침에 자동 재시드.」
- 「플레이리스트 자격 임계값 바꾸려면 `MIN_PLAYLIST_TRACKS` 상수 한 곳만 (`buildingPlaylist.ts`).」

---

## 다음에 할 만한 것 (제안)

- 백엔드 붙으면 localStorage → API 동기화 (현재 store 함수 시그니처가 단순해서 어댑터 갈아끼우기 쉬움)
- 큐레이터 팔로우/팔로워 개념 (현재는 좋아요만)
- TOP PICKS 폴백을 진짜 동/구 단위로 (현재는 글로벌. 빌딩에 `district` 메타 들어오면 한 줄만 추가)
- 모바일 바텀 시트에서 좌측 패널 anchored 동작 변형 (지금은 데스크톱만 anchor, 모바일은 바텀시트 그대로)

---

## 백엔드 쪽

오늘 작업 백엔드 0줄. `today/2026-04-16/backend.md` 안 만들었음 — 필요하면 윤섭이 채우거나 내가 다음에 같이 정리.
