# Front — 2026-04-28

**HEADZ 폐기 → 음악 중심 UX 대정비** — 4/20 ~ 4/28 사이의 작업. 아바타 기능 전부 드롭, Apple Music 스타일 패널 재설계, 미러 좌/우 플로팅 패널, 로케일·건물형 인지 시드, #1 플레이리스트 QR 공유까지.

---

## 한 줄 요약

3D 옥상 아바타를 전부 걷어내고 **음악 큐레이션**으로 축을 옮김. Apple Music 컴팩트 행 디자인, 좌/우 미러 플로팅 패널(왼쪽=빌딩 정보, 오른쪽=TOP PLAYLISTS + #1 Featured 히어로), 14개 페르소나 × 국가/건물형 가중치 시드, **데이터-인-프래그먼트 + LZString**로 백엔드 0인 상태에서 #1 플레이리스트 QR 공유.

---

## 주요 변경점

| 영역 | 변경 |
|------|-----|
| **아바타 전면 폐기** | `revert: drop HEADZ avatar feature entirely` — `src/features/avatar/*`, `RooftopAvatar`, 베이크 파이프라인, GLB 자산, 마이페이지 편집기까지 일괄 제거. 라이센스/.gitignore 가드는 유지 |
| **이모지 / 컬러 스트라이프 제거** | 장르 컬러 스트라이프, 데코 이모지(🎵 ☀️ 🌧️ 🍔 ⭐ 등) 전부 → Lucide 아이콘 셋(`UtensilsCrossed/ShoppingBag/Hotel/...`)으로 일관화 |
| **라이트모드 대비** | `src/lib/ui/contrastColor.ts` HSL 클램프 (light L≤0.36, dark L≥0.62). 장르/패밀리/태넌트 아이콘 색이 모드별로 가독성 보장 |
| **POI 카테고리 분류** | `osmLoader.ts` `SHOP_LABEL_OVERRIDE`가 베이커리/커피/티를 무조건 `shop`으로 라우팅하던 버그 — `mapped?.category ?? 'shop'`로 수정. 166 POI가 `food`로 재분류 |
| **MY PLAYLIST 단순화** | 댓글/설명/태그/DRAFT 전부 드롭. 사용자가 설정하는 것은 **플레이리스트 이름** 한 가지. 기본 표시 = 모노그램 + 이름 + 장르 + 수록곡 N곡 |
| **Apple Music 컴팩트 행** | `TrackRow`/`PopularTrackCard` — 36×36 아트워크 + 호버 Play/Pause 오버레이, idle ⋯ → hover Plus/Check/X. 그리드 정렬 통일, 카드 프레임/테두리 제거 |
| **랭킹 → "수록 N회"** | TOP PICKS는 좋아요가 아니라 **플레이리스트 수록 횟수**로 정렬. 하트 대신 정직한 metric 표시. 랭크 배지 드롭 |
| **TOP PLAYLISTS 우측 플로팅 패널** | 좌측 빌딩정보 패널과 **완전 미러**. 1~3위 메달 + Featured #1 hero 카드. 왼쪽 시스템 그대로 우측에 적용해 회전/줌 시 흔들림 0 |
| **Featured #1 히어로** | `FeaturedPlaylistHero.tsx` — 160px 원형 커버 (탑트랙 앨범아트), 큐레이터 + 트랙 수 + 추정 총 시간 (`AVG_TRACK_SECONDS=200`). 클릭 → 디테일 |
| **패널 위치 시스템** | `panelMetrics(anchor)` 공유 헬퍼. 좌/우 모두 `centerX` 클램프로 영구 사이드락 (사이드 플리핑 없음). 169→61줄 축소. 모든 ABOVE/BELOW/CORNER fallback 제거 |
| **viewport-scale** | ≥1280px → 1.0, ≤700px → 0.55 floor. 화면 줄여도 비율 자동 유지 |
| **높은 빌딩 패널 위치** | `bbScreenH/vh` 기반 `tallness` 0~1 블렌드. 38–80% 사이를 부드럽게 보간해 top-anchored ↔ center-anchored 전환 |
| **카메라 fly-to** | `PlateauScene` `targetPos.set(cx, height*0.5, cz)` — 옥상 피벗(아바타용 잔재) 제거하고 미드-하이트 줌-핏만 유지 |
| **로케일 인지 시드** (`v9-locale-aware`) | 14 페르소나에 `homeCountry: JP/KR/US` + `vibe: office/cafe/late-night/sunset/hangout`. 70% 로컬 / 30% 외국 믹스. `vibeWeightFor(agent, building)` 매트릭스로 건물 형태별 가중. 영어 플레이리스트 이름 ("rainy 4am alley walk", "Shinjuku 5AM loop", "Itaewon backstreet R&B" 등) |
| **국가별 트랙 풀** | `COUNTRY_TRACK_PREFERENCE` — JP→jpop/soundtrack, KR→kpop/rnb, US→pop/hiphop/latin. 우선순위: (taste ∩ country) > taste > country > all |
| **3-tier 썸네일** | TaggerThumb: `avatarUrl > coverArtworkUrl(탑트랙 앨범) > 모노그램`. onError 단계적 폴백 |
| **태넌트 정보 UX** | "더보기" 토글 → 일정 개수 이상은 **스크롤** 처리. 이중언어 라벨(Locker Rental / 안내소) 제너릭 POI는 번역 라벨을 타이틀로 |
| **#1 플레이리스트 QR 공유** | `src/lib/share/playlistShareUrl.ts` — LZString + URL fragment(`/p#p=…`). `PlaylistQRModal.tsx` — 280px ECL-H 캔버스, Copy link / Done. Featured hero 우상단에 QrCode 버튼 |
| **MIN_PLAYLIST_TRACKS = 1** | 3트랙 게이트 폐지. 첫 트랙부터 큐레이션 인정. 빈 상태 카피 영문화 |

---

## 핵심 패턴

**1. True Mirror 패널 배치**
```ts
// 좌/우 모두 같은 panelMetrics() 사용. 다른 건 x 클램프뿐.
function computeTarget(anchor)      { x = clamp(..., minX, anchor.cx - PANEL_W - gapX/2); }
function computeTargetRight(anchor) { x = clamp(anchor.cx + gapX/2, ..., safeRight - PANEL_W); }
```
사이드 플리핑이 사라져 회전/줌에서 흔들림 0.

**2. 톨니스 블렌드 (높은 빌딩)**
```ts
const tallness = clamp((bbScreenH/vh - 0.38) / 0.42, 0, 1);
const ideal = topAnchored * (1 - tallness)
            + centerAnchored * tallness
            - tenantLift * (1 - tallness * 0.5);
```
짧은 빌딩은 위 모서리에, 긴 빌딩은 중앙에 자동 anchor.

**3. 데이터-인-프래그먼트 + LZString (Excalidraw 패턴)**
```
{v:1, b, t, n, tn, tracks:[{i,n,a,art,p,g}…]}
  → JSON.stringify
  → LZString.compressToEncodedURIComponent
  → https://vibloc.app/p#p=<compressed>
```
- 단일 글자 키로 페이로드 ~40% 절감
- URL 프래그먼트 → 서버 로그/리퍼러 미노출
- ECL-H @ alphanumeric ≈ 1.2KB → 8~10트랙 안전. 2.4KB 캡 초과 시 throw + fallback "Copy link"

**4. 로케일 × 건물형 시드 매트릭스**
- `vibeWeightFor(agent, building)` → 건물 형태(타워/하이라이즈/주거 등) × 페르소나 vibe 가중치
- 70/30 로컬/외국 믹스로 빌딩마다 자연스러운 다양성
- 트랙 선택은 (taste ∩ country) → taste → country → all 4단 폴백

**5. 3-tier 썸네일 폴백**
```
avatarUrl (사용자 PNG) → coverArtworkUrl (탑트랙 앨범) → 이니셜 모노그램
```
TaggerGroup이 가장 좋아요 많은 트랙을 자동 커버로 승격.

---

## 안 건드린 것

- 백엔드 0줄 (오늘도)
- 음악 데이터 모델 자체 (PinnedTrack 그대로)
- iTunes 검색 API (이미 작동 중)

---

## 현태용 — 쉬운 말로만

- 옥상에 있던 3D 캐릭터는 **전부 사라짐**. 너무 잡음이 많아서 음악 쪽에 집중하기로 결정.
- 빌딩 클릭 → **왼쪽**엔 가게/태넌트 정보, **오른쪽**엔 TOP PLAYLISTS + 1등 플레이리스트의 큰 커버. 좌우가 거울처럼 정확히 대칭.
- 화면 회전/줌 해도 패널이 절대 옆으로 안 흔들림.
- 화면 작아져도 비율 자동 조절(데스크탑 1.0 → 모바일 0.55).
- 높은 건물은 패널이 가운데에, 낮은 건물은 위쪽에 자동으로 붙음.
- 1등 플레이리스트 카드 우상단의 **QR 아이콘** 누르면 → 다른 폰 카메라로 스캔하면 그 플레이리스트가 열림. **백엔드 없이** URL 안에 데이터를 다 넣음.
- 가상 큐레이터 14명, 각자 나라/취향이 있어서 도쿄/서울/뉴욕 빌딩마다 자연스럽게 다른 곡들이 올라감.
- 트랙 행은 Apple Music처럼 **딱 한 줄**에 정리. 카드 테두리 다 떼고 호버할 때만 ▶ 나옴.
- 좋아요(♥) 대신 "**수록 N회**" — 이 곡이 몇 명의 플레이리스트에 들어갔는지 정직하게.

---

## 윤섭한 — 기술 디테일

### 신규 파일
- `src/lib/share/playlistShareUrl.ts` — encode/decode/toSharedTracks/isSharedPlaylist
- `src/components/ui/music/PlaylistQRModal.tsx` — QR canvas + Copy link
- `src/components/ui/music/FeaturedPlaylistHero.tsx` — #1 히어로 카드
- `src/lib/ui/contrastColor.ts` — HSL 클램프
- `src/features/dev/seedAgents.ts` (v9) — 14 페르소나 + 매트릭스

### 삭제
- `src/features/avatar/*` (전체 디렉토리)
- `src/components/canvas/RooftopAvatar.tsx`
- 마이페이지 AvatarEditor / Headshot, dicebear 의존, GLB 베이크 산물

### 주요 수정
- `src/App.tsx` — `panelMetrics`, `computeTarget`/`computeTargetRight`, rightPanel JSX
- `src/components/canvas/PlateauScene.tsx` — 카메라 타겟 mid-height
- `src/lib/music/buildingPlaylist.ts` — `MIN_PLAYLIST_TRACKS=1`, `taggerPlaylistNames`, `useTaggerPlaylist({name,setName})`, `coverArtworkUrl`
- `src/lib/geo/osmLoader.ts` — 카테고리 폴스루 버그
- `src/lib/geo/tenantLogo.ts` — `CATEGORY_ICON` (Lucide)
- `TrackRow / PopularTrackCard / TopTaggerCard / BuildingPlaylist / PlaylistDetailView` — 디자인 패스

### 의존성
- `qrcode` 추가 (npm)
- `lz-string` 추가 (npm)
- `@dicebear/*` 제거

### 보안 (CSP / 프라이버시)
- 공유 URL 데이터는 **fragment**(`#`) → 절대 서버 로그/리퍼러로 안 새어나감
- `decodePlaylistFromHash`는 `isSharedPlaylist` 가드로 임의 JSON 차단
- 외부 URL 0 (커버 아트는 iTunes 도메인만, 이미 화이트리스트)
- localStorage 외 트래커 0

---

## 현태가 클로드 코드한테 붙여 넣을 말 (예시)

- 「좌우 미러 패널 위치 로직은 **`src/App.tsx`의 `panelMetrics`** 단일 함수. x 클램프만 좌/우 다름. ABOVE/BELOW fallback 절대 다시 추가 금지.」
- 「QR 공유는 백엔드 없이 **`/p#p=<lz-compressed>`** 프래그먼트 인코딩. 캡 2400 byte, 초과시 throw → "Copy link"로 폴백.」
- 「QR 수신 라우트(`/p`) 핸들러는 **아직 미구현** — `decodePlaylistFromHash` 호출해서 read-only preview 렌더만, 자동 localStorage write 금지.」
- 「로케일 시드는 **`SEED_VERSION='v9-locale-aware'`** — 페르소나 추가/수정 시 SEED_VERSION 올려야 시드가 재실행됨.」
- 「커버 아트는 `TaggerGroup.coverArtworkUrl`이 자동 (가장 좋아요 많은 트랙). 사용자가 명시 설정하면 그게 우선.」
- 「수록 N회 metric은 `getTopTracks`가 **타거 셋**을 트랙ID별로 누적해서 size로 카운트. ♥ 카운트 아님.」

---

## 다음에 할 만한 것

- `/p#p=…` 수신 라우트 핸들러 (decode → read-only 프리뷰 + 명시 Import CTA)
- Apple Music 통합 결정 (백엔드 받을 거면 MusicKit JS, 아니면 per-track "Open in Apple Music" 링크 + #1 트랙용 별도 QR)
- 글로벌 now-playing 바
- 사이드바 숨겨졌을 때 떠 있는 AddTrackComposer CTA
- 태넌트 카테고리 섹션 헤더 그룹핑

---

## 백엔드 쪽

오늘도 백엔드 0줄. `today/2026-04-28/backend.md` 미작성.
