# Front — 2026-05-06

**디자인 시스템 통합 + Reactive rails + 랜딩 시네마틱 인트로 + 프로덕션 준비** — 5/5 ~ 5/6 사이의 작업. 우측 패널 전체를 단일 디자인 토큰 시스템 (COLOR / FONT / SPACE) 위에 재정렬, 두 rail 의 width 변화에 따라 NowPlayingBar 가 자동 센터링 + 카메라 frustum 패닝, Manhattan 시네마틱 hero 인트로 + light city backdrop, 가상 캐릭터 시드 데이터 production 제거, 영문 README + 환경변수 문서 정리.

---

## 한 줄 요약

`COLOR.*` 단일 팔레트 + 2-tier 폰트 ladder (16 title / 12 body, 모두 4의 배수) + 4-multiple 박스 그리드로 우측 패널 전체 정규화. CSS 커스텀 프로퍼티 `--vbk-left-rail-w` / `--vbk-right-rail-w` 로 rail 의 width 변화를 broadcast → NowPlayingBar 가 `calc(leftRail + (vw - rails) / 2)` 로 자동 중앙, 3D 캔버스는 viewport 풀사이즈 고정 + `camera.setViewOffset(dx, 0)` 으로 빌딩이 NowPlayingBar 중앙에 자동 정렬 (가장자리 검은/흰 띠 X). Rail 을 넓히면 alpha `0.40 → 0.02` blur-only 까지 투명. Up Next 펼침 시 `position: absolute` 오버레이로 body layout 영향 0. 큐레이터 `@alias` 검색이 트랙 결과 위에 `Playlists` 섹션으로 노출 → 클릭 시 PlaylistDetailView. 랜딩 hero 는 7000 px 상공 → 35° 시네마틱 각도 2.4 s 줌-인 + 0.45 rad yaw 회전, blur + scrim fade-in + 컨텐츠 stagger, 하단 ⌄⌄ 스크롤 큐. STATS + CITIES 가 라이트 Manhattan 캔버스 + 5-stop 화이트 그라디언트로 페이드, FEATURES 는 음악 패널 backdrop (좌·우 컬럼에 7개씩 stylized track row mockup). 240 px 중앙 hairline 으로 모든 섹션 break 통일. Production 모드에서는 가상 캐릭터 (Mei / Rio / Jiro / Jaehyun / Noa…) seed + iTunes 아트워크 enricher 가 `import.meta.env.DEV` 게이트로 번들에서 tree-shake. 맵 진입 시 빌딩 자동 선택 제거 → clean canvas. TypeScript 5 errors 수정 + 영문 README + .env.example 확장.

---

## 주요 변경점

| 영역 | 변경 |
|---|---|
| **단일 색상 팔레트** | `lib/ui/tokens.ts` 의 `COLOR.*` 객체 하나에 모든 색상 응집. ink/paper, hover/accent/tint, shadow, dark theme paired 토큰, 브랜드 액센트 (appleRed, heartRed, liveGreen), 메달 3색. 인라인 `rgba()`/`#hex` 금지. 기존 토큰 (`INK`, `MUTED`, `DIVIDER` …) 은 `@deprecated` alias 로 보존 |
| **2-tier 폰트 ladder** | Hero 16 / 600, Row title 16 (이후 사용자 요청으로 12 까지 축소) / 500-600, Body 12 / 400-500, Eyebrow 12 / 600-700 + uppercase tracking. 모두 4 의 배수. 위계는 size 대신 weight + uppercase + tracking 으로 표현 |
| **4-multiple 박스 그리드** | 모든 padding/margin/gap/width/height/borderRadius 를 4 의 배수 (4·8·12·16·24·32) 토큰 위에 정렬. 기존 `5/6/10/14/22` 등 off-grid 값 일괄 sweep. fontSize 만 Apple HIG ladder 와 충돌해 별도로 처리 |
| **HEART_RED 정책** | monochrome 시스템에서 유일하게 허용된 감정 컬러 (filled-heart liked, heart count meta). Play 빨강 → 뉴트럴 ink 로 통일, 큐레이터 아바타 제거 |
| **우측 rail 대칭 12 px gutter** | body padding 12 + row padding 12 → 컨텐츠 좌측 24, 우측 panel-right−24. 좌·우 rail 거울 대칭 |
| **HIG 터치 타겟** | 모든 trailing 버튼 28→32, gap 2→4. Plus / Check / Ellipsis / Heart icon 모두 32-wide center 슬롯, 카운트 32-wide center 슬롯 |
| **Up Next telescoping panel** | 펼침 시 `position: absolute, bottom: 100%` 오버레이로 떠올라 body layout 영향 0. 토글 행은 같은 자리 고정. backdrop blur + 180 ms fade-in |
| **NowPlayingEQ 인디케이터** | 3-bar CSS 애니메이션 (180 ms 스태거, `prefers-reduced-motion` 지원). PopularRow / TrackRow 의 아트워크 오버레이에서 `isCurrent && !hover` 시 EQ, `hover` 시 Pause 글리프 |
| **CSS 변수 reactive rails** | FixedToolSidebar / FixedQueueSidebar 가 useEffect 로 `:root` 에 `--vbk-left-rail-w` / `--vbk-right-rail-w` 갱신 (resize / 펼침 / 접힘 모두 반영). 28-px tab handle 도 collapse 시 정확한 폭 |
| **NowPlayingBar 자동 센터링** | `left: calc(leftRail + (vw - rails) / 2)`, `width: max(320, min(720, vw - rails - 32))`. CSS calc 라 별도 JS 리렌더 X |
| **Camera frustum 패닝** | `CameraViewOffsetSync` 컴포넌트가 useFrame 으로 매 프레임 CSS var 읽음 → `camera.setViewOffset(dx, 0)` 호출. projection matrix 만 시프트 → OrbitControls / 캔버스 transform 무영향, 가장자리 노출 X. 80 ms exponential smoothing |
| **Rail 투명도 fade** | width 280→560 에 따라 surface alpha `0.40 → 0.02`. 24-px backdrop blur 유지 |
| **Toast 시스템** | `lib/ui/toast.ts` pub/sub + `ToastHost` bottom-center HUD. "이미 플레이리스트에 있는 곡이에요" 등 quiet status. dedup (동일 메시지 연속 push 시 타이머 reset) |
| **큐레이터 검색** | AddTrackComposer 의 `useTopTaggers` snapshot 으로 `@alias` / 큐레이터 이름 / 플레이리스트 이름 substring 매칭. 결과 위에 `Playlists` SECTION_HEADER + PlaylistMatchRow (36-px PlaylistCover + headline + `@alias · N songs`) → 클릭 시 PlaylistDetailView |
| **PlaylistDetailView 통합** | 컬러 정책 통일 (Play 빨강 제거), 큐레이터 아바타 제거, `@alias` 만 메타로 표시. 글자 한도 60 → 30, character counter UI 제거. 트레일링 `OPEN`/`EDIT` 라벨 제거. SECTION_HEADER + ROW_CAPTION + SPACE 토큰만 사용 |
| **하트 트레일링 정렬** | RankRow heart cluster 가 PopularRow `[Ellipsis 32] gap 4 [Plus 32]` 와 동일 기하학으로 재구성. 하트 ♥ 가 ⋯ 컬럼, count 가 +/✓ 컬럼에 정확히 정렬 |
| **240 px hairline divider** | 모든 섹션 break 에 풀-너비 borderTop 대신 `width: 240, height: 1, margin: 0 auto, background: divider` 짧은 가운데 hairline 적용 |
| **랜딩 hero 시네마틱 인트로** | `IntroCameraAnimation` 컴포넌트가 useFrame 으로 매 프레임 보간. y=7000/z=500 → y=600/z=1000 + 0.45 rad yaw, ease-out cubic 2.4 s. blur 0→14 px (1300 ms 지연) + 스크림 0→0.55 (1200 ms 지연) + 컨텐츠 stagger (1700~2300 ms 4 단계). `prefers-reduced-motion` 지원 |
| **하단 스크롤 큐** | 더블 chevron-down `⌄⌄` + `LEARN MORE` 라벨, non-interactive bounce 애니메이션 (1800 ms loop) |
| **공유 light city backdrop** | STATS + CITIES 두 섹션 wrapper 안에 `PlateauScene area="manhattan" darkMode={false}` + 5-stop 화이트 그라디언트 + 2-px backdrop blur. `staticCameraView={ position: [0, 1600, 1300] }` 로 새의 눈 시점, individual 빌딩 디테일 보임 |
| **FEATURES 음악 패널 backdrop** | `FeaturesMusicBackdrop` 컴포넌트 — 좌·우 양쪽 컬럼에 stylized track row 7 개 (album tile 36×36 + skeleton bar 2 줄), 7 가지 hue, 위·아래 vertical mask gradient, opacity 0.55 |
| **Render quality boost** | Canvas `dpr={[1, 3]}` (3× retina), `powerPreference: 'high-performance'`, `logarithmicDepthBuffer: true` (far=20000 z-fighting 완화) |
| **Production 모드 (가상 캐릭터 제거)** | `seedBuildingPlaylists` + `enrichSeedArtworkInBackground` 호출을 `if (!import.meta.env.DEV) return` 게이트. tree-shake 로 번들에서 완전 제거. 맵 진입 시 자동 빌딩 선택 (`getPlayerStateSnapshot().currentBuildingId`) 도 제거 → 깨끗한 캔버스 |
| **i18n 확장** | `track.toast.alreadyAdded` (KR/EN/JA), `music.searchPlaceholder` (`Song, artist, or @user` 등), `music.playlists` / `music.songs` / `music.noResults`, `panel.tenants` (`입점 정보` → `건물 정보`) |
| **빌드/배포 준비** | TypeScript 5 errors 수정 (uniform typing, `primaryGenreName` 누락, `Uint8Array<ArrayBuffer>`, 누락된 `useT` 스코프, 중복 선언). `npm run build` 380 ms 성공, 580 KB gzip total |
| **저장소 정리** | 영문 README 신규 작성 (한국어 요약 포함), `.env.example` 확장 (Supabase / Google OAuth / API URL / Maps Embed 모두 문서화), 비공개 자료 (`CLAUDE.md`, `docs/business/`, `today/`, KR dev notes, `bun.lock`) `.gitignore` + `git rm --cached`, orphan 컴포넌트 3 개 (`Compass.tsx`, `CityVibeBlock.tsx`, `AppleMusicIcon.tsx`) 삭제, stray `console.log` DEV 게이트 |

---

## 디자인 의사결정

### 1. 색상 팔레트 단일화 — 왜 `COLOR.*` 한 객체로?

기존 코드베이스에 인라인 `rgba(14,14,26,0.05)`, `rgba(14,14,26,0.07)`, `rgba(0,0,0,0.025)` 등 비슷하지만 미묘하게 다른 alpha 값 30+ 종류가 흩어져 있었음. 하나하나 의미가 살짝 다른지 (hover vs accent vs tint), 단지 오타인지 판별 불가. `COLOR.hover = 0.05`, `COLOR.accent = 0.07`, `COLOR.tint = 0.025` 로 명시적 의미 부여 + 단일 진입점화. 다크 모드 페어 (`hoverDark`, `accentDark`, `dividerDark`…)도 같은 객체 안에 인접 정의 → 페어 누락 알아차리기 쉬움.

### 2. 2-tier 폰트 ladder — 왜 `12 / 16` 두 사이즈만?

처음 `17 / 14 / 13 / 12 / 11 / 10` 6-tier 시스템 → "큰 글씨 줄여줘" 사용자 피드백 → `20 / 16 / 12` 3-tier → 더 줄여서 `16 / 12` 2-tier 까지 평탄화. 위계는 `weight` (400 / 500 / 600 / 700) 와 `letter-spacing` + `uppercase` 로 표현. Apple Music macOS 도 사실상 row title 13 + caption 11 두 사이즈만 쓰니까 분위기 일관됨. 4-multiple 그리드 룰과도 자연스럽게 맞음 (12, 16, 20, 24…).

### 3. CSS 변수 reactive — 왜 prop drilling 안 함?

NowPlayingBar 가 두 rail 의 width 를 알아야 하는데, 둘 다 자식이 아닌 sibling 컴포넌트. zustand 스토어에 push 도 가능하지만, **CSS calc 가 자체 reactive** 라 `:root.style.setProperty('--vbk-left-rail-w', `${w}px`)` 한 번 setter 만으로 모든 cosumer 가 별도 React 리렌더 없이 자동 갱신. `transition: left 160ms` 도 그대로 작동. R3F 의 `CameraViewOffsetSync` 도 useFrame 에서 `getComputedStyle` 로 읽음 — 매 프레임 호출이지만 CSS var 조회는 가벼움. 이 패턴으로 NowPlayingBar / floating panel 폭 / 카메라 frustum 모두 단일 source 에 reactive.

### 4. 카메라 setViewOffset vs 캔버스 transform

처음엔 캔버스 wrapper 에 `transform: translateX((leftRailW - rightRailW) / 2)` 를 시도. 하지만 캔버스가 viewport 풀사이즈인 상태에서 transform 으로 시프트하면 한쪽 가장자리에 검은/흰 body 배경이 노출되는 버그 발생. `setViewOffset(canvasW, canvasH, dx, 0, canvasW, canvasH)` 는 projection matrix 만 패닝해서 캔버스 자체는 viewport 에 단단히 고정 + 빌딩 anchor 의 `BuildingScreenAnchor` 도 새 projection 자동 반영. OrbitControls / shadow follower / fog 모두 무영향.

### 5. Production 모드 (가상 캐릭터 제거) — `import.meta.env.DEV` 게이트

`seedAgents.ts` 가 Mei, Rio, Jiro, Jaehyun, Noa 등 6 도시 × 평균 8 큐레이터 × 5 트랙 = ~240 개 시드 데이터를 마운트마다 localStorage 에 푸시. 디자인 검토용으로는 좋지만 실제 사용자 입장에서는 자기가 만든 것도 아닌 데이터가 채워져 있어 혼란. `if (!import.meta.env.DEV) return` 게이트로 dev 빌드만 시드 → production 사용자는 깨끗한 빈 상태에서 시작. 동적 import 라 tree-shake 도 자연스러움.

---

## 다음 작업 후보

- **PR 생성** — `feat/left-info-panel` → `main` 머지 (윤섭님 리뷰)
- **Vercel 배포** — `viblo-project/VIBLOC` 또는 `ai0assist0hta-design/vibloc` 에서 import, `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 환경변수 입력
- **Supabase URL Configuration** — 배포 도메인을 Site URL + Redirect URLs 에 등록
- **모노레포 main 머지** — 공유 repo 의 `main` (모노레포: `VIBLOC-frontend/` + `VIBLOC-backend/`) 에 frontend 작업 sync 시 `VIBLOC-frontend/` 폴더 안으로 이동 필요
- **번들 사이즈 최적화** — `vendor-three` 318 KB gzip 이 가장 큼. 동적 import 로 routes 별 split 검토
- **Lint 정리** — 116 개의 기존 lint 경고 (`react-hooks/set-state-in-effect` 등) 점진 정리
