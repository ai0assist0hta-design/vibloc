# VIBLOC — Design Portfolio

> 위치 기반 음악 큐레이션 플랫폼.
> 디자인 의사결정·시스템 구축·UX 트레이드오프 정리 보고서.

**Author**: Hyeontae An (디자인·기획·구현)
**Period**: 2026-04 ~ 2026-05
**Repo**: viblo-project/VIBLOC · ai0assist0hta-design/vibloc

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [문제 정의와 가설](#2-문제-정의와-가설)
3. [정보 아키텍처](#3-정보-아키텍처)
4. [비주얼 디자인 시스템](#4-비주얼-디자인-시스템)
5. [레이아웃·정렬 시스템](#5-레이아웃정렬-시스템)
6. [인터랙션 디자인](#6-인터랙션-디자인)
7. [3D 씬·카메라 설계](#7-3d-씬카메라-설계)
8. [모션 디자인](#8-모션-디자인)
9. [접근성 고려](#9-접근성-고려)
10. [프로덕션 폴리싱](#10-프로덕션-폴리싱)
11. [기술 의사결정 트레이드오프](#11-기술-의사결정-트레이드오프)
12. [회고와 다음 단계](#12-회고와-다음-단계)

---

## 1. 프로젝트 개요

### 한 줄 정의

**도시 위에 음악을 쌓다.** — 3D 도시 지도 위 모든 빌딩에 자기만의 플레이리스트가 있는 위치 기반 음악 큐레이션 플랫폼.

### 핵심 가치 제안

기존 스트리밍 서비스는 "장르 → 무드 → 곡" 의 추상적 검색만 지원한다.
VIBLOC 은 **물리 공간 → 빌딩 → 곡** 으로 검색 축을 회전시켜, 사용자가 살거나 일하거나 사랑하는 실제 장소에 음악을 매핑한다.

> 누군가 신주쿠 모 카페에 시티팝을 핀하면, 그 카페에 다른 사용자가 찾아왔을 때 그 음악이 첫 번째 추천이 된다. 도시 자체가 큐레이션 그릇이 된다.

### 주요 기능

| 기능 | 설명 |
|---|---|
| **3D 도시 맵** | 6개 도시 (Manhattan, Shibuya, Shinjuku, Itaewon, Gangnam, LA) 의 실제 OSM 데이터 기반 빌딩 |
| **빌딩 단위 핀** | Apple Music 카탈로그에서 곡을 검색해 특정 주소에 핀 |
| **소셜 큐레이션** | 다른 사용자가 같은 빌딩에 핀한 트랙 탐색 (TOP PLAYLISTS / TOP PICKS) |
| **AI 추천** | 도시 vibe + 입주 업종(테넌트) 컨텍스트 기반 추천 (일식당 → 시티팝, 클럽 → 테크노) |
| **실시간 날씨** | 현재 강수량 → 캔버스 비/눈 입자 + 안개 톤 + 빌딩 라이팅 |
| **30초 프리뷰** | Apple Music DRM-free 프리뷰 + 빌트인 큐 (구독 불필요) |
| **한·영·일 다국어** | 모든 UI / placeholder / 토스트 i18n 화 |

### 기술 스택

```
React 19 + TypeScript + Vite (rolldown 번들러)
├── three.js + @react-three/fiber + drei + postprocessing
├── OpenStreetMap (Overpass API) + Wikipedia/Wikidata enrichment
├── Apple Music / iTunes Search API (auth-free)
├── Supabase (auth + persistence, anon key only on client)
├── Zustand (전역 상태)
└── react-router-dom v7
```

---

## 2. 문제 정의와 가설

### 시작점: "음악과 장소의 단절"

```
스트리밍 앱:    [장르]   →  [무드]      →  [곡]
                추상       추상           구체
                ↓ 사용자는 자신의 맥락을 매번 재구성해야 함

VIBLOC:        [장소]   →  [큐레이터]   →  [곡]
                구체       구체           구체
                ↓ 익숙한 도시·빌딩이 음악 검색의 anchor
```

### 핵심 가설 3가지

1. **"이 카페 음악 뭐였지?"** — 사람들은 음악을 장소와 묶어 기억한다. 장소 어드레스가 발견의 시작점이 될 수 있다.
2. **큐레이션은 사회적이다** — 알고리즘 추천보다 "누군가가 이 장소에 의도적으로 핀했다"는 신호가 강하다.
3. **3D 시각화는 sticky** — 평면 지도가 아닌 시각적으로 인상적인 3D 도시는 머무는 시간을 늘리고 발견의 우연을 만든다.

### 경쟁 vs 차별화

| 기존 서비스 | 어떻게 다른가 |
|---|---|
| Spotify Curated | 큐레이션 주체가 **장소** 가 아닌 **에디터/알고리즘** |
| Apple Music Local | 도시 단위 차트만, **빌딩 단위 큐레이션 X** |
| Yelp/구글맵 | 장소+리뷰는 있지만 **음악 메타 데이터 X** |
| Foursquare | 체크인 메타에 음악 없음 |

---

## 3. 정보 아키텍처

### 3개의 메인 surface

```
┌─────────────────────────────────────────────────────┐
│  LANDING                                            │
│  - Hero: 시네마틱 인트로 (Manhattan 줌-인)          │
│  - Stats: 6 도시 / 50,000+ 빌딩 / 7 장르 패밀리      │
│  - Cities: 도시 선택 chips                          │
│  - Features: 3가지 핵심 기능 카드                   │
│  - CTA: Explore Map                                  │
├─────────────────────────────────────────────────────┤
│  MAP (메인 앱)                                       │
│  - Center: 3D 도시 캔버스                           │
│  - Left rail: Search / Cities / My Blocks / Footer   │
│  - Right rail: Profile + 음악 컨텐츠                 │
│  - Bottom: NowPlayingBar                            │
├─────────────────────────────────────────────────────┤
│  MY PAGE                                            │
│  - 사용자 프로필 + 자기 플레이리스트 목록           │
└─────────────────────────────────────────────────────┘
```

### 우측 rail 의 7개 섹션 (선택된 빌딩이 있을 때)

```
[Profile row + collapse chevron]   ← Header
─────────────────────────────────
1. AddTrackComposer (검색)
   ├─ search input + leading icon
   ├─ Playlists (큐레이터 매치 결과)
   └─ Songs (Apple Music 결과)
2. MY PLAYLIST (내 핀)
3. TOP PLAYLISTS (큐레이터 랭킹)
4. TOP PICKS (인기 트랙 3)
5. AI 추천 (도시·테넌트 기반)
─────────────────────────────────
[Up Next 토글]                    ← Footer (sticky)
```

### 검색 결과 위계

```
검색어 입력
    ↓
[Playlists] 섹션 ←  큐레이터 @alias / 이름 / 플레이리스트명 매치
    ↓
[Songs]     섹션 ←  Apple Music 카탈로그 매치
```

큐레이터를 트랙보다 위에 둔 이유: 사람들은 "OO 의 플레이리스트" 를 찾아 들어가는 경험을 강하게 기억한다 (Apple Music 의 "Top Result" 패턴).

---

## 4. 비주얼 디자인 시스템

### 4.1 색상 팔레트

#### 디자인 원칙: **Monochrome 시스템 + 정의된 액센트**

회색조 + 단 4개의 크로마틱 컬러만 허용.

```ts
COLOR = {
  // ── Light 텍스트 ────────────────────────
  ink:       '#0e0e1a'    // 1차 본문
  ink2:      '#2e2e38'    // 2차
  ink3:      '#5a5a66'    // 3차 (캡션·메타)
  ink4:      '#7a7a86'    // 4차 (disabled)

  // ── 페이퍼 ──────────────────────────────
  paper:     '#faf9f6'
  white:     '#ffffff'

  // ── 표면 오버레이 ────────────────────────
  hover:        rgba(14,14,26, 0.05)
  accent:       rgba(14,14,26, 0.07)
  hoverStrong:  rgba(14,14,26, 0.08)
  tint:         rgba(0,0,0,    0.025)

  // ── 보더 ────────────────────────────────
  divider:        rgba(14,14,26, 0.10)
  dividerStrong:  rgba(0,0,0,    0.12)

  // ── 다크 테마 ────────────────────────────
  onDark:           '#f5f5f7'
  onDark2:          '#a8a8b3'
  paperDark:        rgba(15,15,20, 0.55)
  paperDarkSolid:   rgba(20,20,24, 0.96)
  hoverDark:        rgba(255,255,255, 0.08)
  accentDark:       rgba(255,255,255, 0.12)
  dividerDark:      rgba(255,255,255, 0.12)

  // ── 크로마틱 액센트 (정책적 제한) ─────────
  appleRed:   '#FA243C'   // Apple Music 브랜드 CTA만
  heartRed:   '#ff375f'   // 좋아요/하트 — 모노크롬 시스템에서
                          //                유일하게 허용된 감정 컬러
  liveGreen:  '#34c759'   // Live mode 토글 (iOS 표준)

  // ── 메달 (TOP PLAYLISTS 1/2/3위) ─────────
  medalGold:    '#f5b301'
  medalSilver:  '#b6b6c1'
  medalBronze:  '#c97a4a'
}
```

#### 의사결정의 근거

- **모노크롬 우선** → 사용자의 음악(앨범 아트의 컬러)이 가장 강한 시각 요소가 되도록. UI 자체는 conduit.
- **`HEART_RED` 정책** → 좋아요 액션은 "감정"이라 컬러가 정당화됨. 그 외 시스템 액션 (Play, Add to Playlist 등) 은 ink 톤으로 통일.
- **Apple Music 브랜드 빨강 분리** → "Apple Music 으로 이동" 같은 외부 링크 CTA에만. 우리 내부 액션과 시각 분리.
- **다크 테마 페어** → 모든 라이트 색상은 `*Dark` 페어를 가짐. 누락 방지를 위해 같은 객체 안에 인접 정의.

### 4.2 타이포그래피

#### Apple HIG 기반 SF Pro 스택 + Pretendard fallback (한글)

```css
font-family: -apple-system, BlinkMacSystemFont,
             "SF Pro Display", "SF Pro Text",
             "Pretendard Variable", "Pretendard",
             "Inter", system-ui, sans-serif;
```

#### **2-tier ladder** (4의 배수 grid)

처음엔 `17 / 14 / 13 / 12 / 11 / 10` 6-tier 였으나, 사용자 피드백 (큰 글씨가 부담스럽다) 을 받고 점진적으로 평탄화:

```
6-tier  →  3-tier  →  2-tier
17/14/13/12/11/10   →   20/16/12   →   16/12
```

최종 시스템:

```ts
HERO_HEADLINE  = 16 / 700 / -0.01em / lh 1.2
ROW_TITLE      = 16 / 600 / -0.01em / lh 1.3   ← 후에 12로 압축
ROW_CAPTION    = 12 / 500 / -0.01em / lh 1.3
SECTION_HEADER = 12 / 600 / +0.06em / uppercase
EYEBROW        = 12 / 700 / +0.08em / uppercase
PANEL_HEADER   = 12 / 600 / +0.10em / uppercase
```

#### 의사결정 근거

- **위계는 size 가 아닌 weight + tracking** — 모든 본문이 12px 이지만 `400 / 500 / 600 / 700` weight 와 uppercase + `letter-spacing` 으로 4단계 위계 표현.
- **SF Pro + Pretendard** — 한글이 섞이는 ko/ja 환경에서도 line-height 가 깨지지 않게.
- **`-0.01em` 마이너스 트래킹** — Apple Music macOS 기본 spec. 모든 본문에 일괄 적용 → 시각 통일.

### 4.3 스페이싱 — 4-pt grid

```ts
SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
}
```

모든 padding/margin/gap/width/height/borderRadius 가 `4 · 8 · 12 · 16 · 24 · 32 · 48` 토큰 위에 있어야 한다는 룰. `5 / 6 / 10 / 14` 같은 off-grid 값은 sweep 으로 제거.

#### 예외

- `borderRadius: 999` (full pill)
- `borderRadius: '50%'` (원)
- `width: 2` (decorative hairline indicator)
- `fontSize` (Apple HIG 11/13/14/17 과 충돌해 별도 시스템)

### 4.4 Radius 스케일

```ts
RADIUS = {
  s:    6     // 트랙 아트워크 (작은 칩)
  m:   10     // 카드
  l:   14     // 큰 카드
  xl:  20     // 모달, 패널 외곽
  pill: 999   // 액션 버튼
  full: '50%' // 원형 아바타
}
```

이후 4-multiple 룰에 맞춰 radius 도 `4 / 8 / 12 / 16` 로 점차 통일.

### 4.5 아이콘 시스템

- **lucide-react** 단일 패키지
- 사이즈는 4-multiple: 12 / 16 / 24 / 32 (**14 / 18 / 22 금지**)
- 기본 strokeWidth `2.2` (Apple Music macOS 비주얼 무게에 맞춤)
- 컨테이너는 24×24 또는 32×32 슬롯에 센터 정렬

---

## 5. 레이아웃·정렬 시스템

### 5.1 우측 rail의 대칭 12px gutter

```
┌─ aside ─────────────────────────────┐
│                                     │ ← rail edge
│   ┌─ row pill ──────────────────┐   │
│   │ ░ artwork ░  title           │   │ ← row paddingLeft 12
│   │                ⋯  +          │   │ ← row paddingRight 12
│   └──────────────────────────────┘   │
│   ←─12px─→             ←─12px─→     │ ← body padding 12
└─────────────────────────────────────┘

좌측 컨텐츠 시작:  rail-x = 12 (body) + 12 (row) = 24
우측 컨텐츠 끝:    panel-right − 12 (body) − 12 (row) = panel-right − 24
```

좌·우 거울 대칭으로 컨텐츠가 시각적 정중앙에 떨어지게.

### 5.2 트레일링 컬럼 통일

모든 row 의 우측 액션을 동일한 슬롯 시스템에 맞춤:

```
[⋯] [+/✓]   ← TrackRow / PopularRow / PlaylistMatchRow
[♥] [count] ← RankRow (TOP PLAYLISTS)

  32        32
 wide      wide
center    center
icon       slot
```

`[Ellipsis 32×32 center] gap 4 [Plus 32×32 center]` 패턴이 모든 row 트레일링의 단일 룰.

### 5.3 Reactive rail 시스템

#### 문제

좌·우 rail 의 width 가 사용자 드래그로 가변. NowPlayingBar 는 두 rail 사이 정중앙에 와야 하고, 빌딩 시점도 그 중앙에 맞춰야 한다. Prop drilling 으로는 너무 많은 컴포넌트가 width 를 알아야 함.

#### 솔루션: CSS 커스텀 프로퍼티 broadcast

```tsx
// FixedToolSidebar.tsx (좌측 rail)
useEffect(() => {
  document.documentElement.style.setProperty(
    '--vbk-left-rail-w',
    `${open ? width : 28}px`
  );
}, [open, width]);

// FixedQueueSidebar.tsx (우측 rail) — 동일 패턴

// NowPlayingBar.tsx — 자동 센터링
left: 'calc(var(--vbk-left-rail-w) + (100vw - var(--vbk-left-rail-w) - var(--vbk-right-rail-w)) / 2)'

// PlateauScene.tsx — 카메라 frustum 패닝
useFrame(() => {
  const cs = getComputedStyle(document.documentElement);
  const leftW  = parseFloat(cs.getPropertyValue('--vbk-left-rail-w'))  || 280;
  const rightW = parseFloat(cs.getPropertyValue('--vbk-right-rail-w')) || 280;
  const dx = (rightW - leftW) / 2;
  camera.setViewOffset(canvasW, canvasH, dx, 0, canvasW, canvasH);
});
```

#### 왜 zustand 스토어가 아닌가?

1. **CSS calc 가 자체 reactive** — setter 한 번이면 모든 consumer 가 별도 React 리렌더 없이 자동 갱신
2. **`transition: left 160ms ease`** 가 그대로 작동 → 부드러운 드래그
3. **R3F useFrame 에서도 `getComputedStyle` 로 cheap 하게 읽음**
4. **DOM 트리에 끼지 않는 cross-cutting 컴포넌트 (camera, NowPlayingBar) 도 자연스럽게 구독**

### 5.4 카메라 패닝 — `setViewOffset` vs `transform`

#### 첫 시도 (실패)

```css
.canvas-wrapper { transform: translateX(calc((leftRail - rightRail) / 2)); }
```

→ 캔버스가 viewport 풀사이즈인 상태에서 transform 으로 시프트하니 **한쪽 가장자리에 body 배경이 검은/흰 띠로 노출**.

#### 두 번째 시도 (성공)

```ts
camera.setViewOffset(canvasW, canvasH, dx, 0, canvasW, canvasH);
```

- Three.js 가 projection matrix 만 시프트
- 캔버스 자체는 viewport 에 단단히 고정
- `BuildingScreenAnchor` 의 projection 이 새 frustum 자동 반영
- OrbitControls / shadow follower / fog effect 모두 무영향

### 5.5 240px 중앙 hairline divider

랜딩 페이지 섹션 break 의 비주얼 룰:

```
[Section A]
       ━━━━━━ ← width: 240, height: 1, margin: 0 auto, background: divider
[Section B]
```

풀 너비 borderTop 대신 짧은 가운데 hairline 만 그려서 페이지 좌·우 가장자리는 깨끗하게 유지.

---

## 6. 인터랙션 디자인

### 6.1 Up Next telescoping panel

#### 처음 (문제)

펼치면 큐 리스트가 별도 floating 카드로 body 위에 떠 있고, 토글 버튼은 따로 떨어져서 보여 — 두 요소가 분리된 느낌.

#### 두 번째 시도 (잘 안 됨)

토글이 있던 sticky footer 자체가 위로 자라며 큐를 품도록. body 가 함께 밀려 올라가는 부작용.

#### 최종 (성공)

```tsx
<footer style={{ position: 'relative' }}>
  {expanded && (
    <div style={{
      position: 'absolute',
      bottom: '100%',  ← footer 위로 자라남
      left: 0, right: 0,
      maxHeight: '50vh',
      backdropFilter: 'blur(20px)',
    }}>
      {큐 리스트}
    </div>
  )}
  <Toggle />  ← 항상 같은 자리
</footer>
```

- 큐 리스트가 absolute overlay 라 body layout 영향 0
- 토글은 같은 자리 고정 → 사용자 커서가 빈 공간을 헛클릭 안 함
- Backdrop blur + 180ms slide-up 으로 자연스러운 등장

### 6.2 Now Playing EQ 인디케이터

#### 문제

재생 중인 트랙 = hover bg 와 동일 톤만. 어떤 곡이 지금 나오는지 즉시 파악 불가.

#### 솔루션

3-bar CSS 애니메이션을 아트워크 오버레이에 렌더:

```tsx
{isCurrent && !hover ? (
  <NowPlayingEQ size={16} color="#fff" />
) : isCurrent && hover ? (
  <Pause size={16} />
) : (
  <Play size={16} fill="currentColor" />
)}
```

- 재생 중 + hover 안 됨 → EQ 애니메이션 (정보 신호)
- 재생 중 + hover → Pause (액션 어포던스)
- 비재생 → Play (액션 어포던스)

180ms 스태거로 3개 bar 가 자연스럽게 랜덤 같은 모션. `prefers-reduced-motion` 에서는 정적 2/3 높이로 표시.

### 6.3 카메라 시네마틱 인트로

#### 의도

랜딩 hero 가 단순 정적 이미지가 아닌 **"도시가 자기를 드러내는 순간"** 으로 느껴지도록.

#### 구현

```
0   ~ 2.4s:  카메라 줌-인  ←  y=7000 / z=500 (성층권)
                             → y=600 / z=1000 (시네마틱 35°)
                             + 0.45 rad yaw 회전 풀림
                             ease-out cubic

1.2 ~ 2.2s:  scrim 페이드 인 (0 → 0.55 alpha)
1.3 ~ 2.2s:  blur 페이드 인 (0 → 14 px)

1.7 ~ 2.3s:  텍스트 컨텐츠 stagger (4단계, 200ms 간격)
   • 1700ms:  H1 헤드라인
   • 1850ms:  서브헤드
   • 2000ms:  CTA 버튼
   • 2150ms:  Auth row
   • 2300ms:  Language switcher

3.5s+:       ⌄⌄ 스크롤 큐 페이드 인 + bounce loop
```

`prefers-reduced-motion` 사용자에게는 모든 애니메이션 정적 표시.

### 6.4 Toast 시스템

#### 디자인 원칙

조용한 status 메시지. 자기를 강조하지 않는 HUD.

```ts
showToast('이미 플레이리스트에 있는 곡이에요.');
```

- bottom-center fixed
- backdrop blur + 1px hairline
- 2.4s auto-dismiss
- 동일 메시지 연속 push → 타이머 reset (스택 안 함)
- KO/EN/JA i18n

#### 사용 케이스

`+` 버튼 ↔ `✓` 버튼 토글 시 사용자가 "이미 추가됨" 상태에서 한 번 더 누르면, 의도치 않은 unpin 대신 토스트로 안내. **Discovery surface (검색·추천) 에서 실수로 트랙이 사라지는 것 방지**.

### 6.5 큐레이터 검색

#### 인사이트

사용자가 "@glass.set" 같은 alias 를 검색창에 넣으면, 그 큐레이터의 플레이리스트로 바로 가고 싶다.

```
검색어 "@glass" 입력
     ↓
[Playlists]
  Mei Watanabe          @glass.set · 12 songs    ← 클릭 시 PlaylistDetailView
[Songs]
  ...iTunes 결과
```

- substring 매칭 (case-insensitive)
- `@` prefix 자동 처리 (`@glass` 도 `glass` 도 매치)
- alias / 큐레이터 이름 / 플레이리스트 이름 모두 검색
- Apple Music 의 "Top Result → Songs" UX 패턴

---

## 7. 3D 씬·카메라 설계

### 7.1 캔버스 설정

```tsx
<Canvas
  shadows={{ type: VSMShadowMap }}
  camera={{ position: [0, 600, 1000], fov: 35, near: 10, far: 20000 }}
  dpr={[1, 3]}                              // 3× retina 풀샘플
  gl={{
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',     // 디스크리트 GPU 우선
    logarithmicDepthBuffer: true,            // 멀리 빌딩 z-fighting 완화
  }}
/>
```

#### 의사결정

- **`fov: 35`** — Apple Music 의 album cover viewer 기본값. 자연스러운 시각 (55+ 어안 효과 vs 25 이하 망원 압축 사이).
- **`dpr=[1, 3]`** — 4K 디스플레이 / iPhone Pro Max 에서도 또렷하게.
- **`logarithmicDepthBuffer`** — far=20000 환경에서 멀리 있는 빌딩 표면이 깨지는 z-fighting 방지.

### 7.2 카메라 모드 — 3가지

| 모드 | 트리거 | 동작 |
|---|---|---|
| **Interactive** | 메인 맵 페이지 | OrbitControls 회전·줌·팬 모두 가능 |
| **Static** | 랜딩 페이지 light backdrop | mount 시 한 번 position + lookAt 설정, 그대로 멈춤 |
| **Intro animation** | 랜딩 hero | 2.4s 프로그래매틱 줌-인 + yaw rotation |

각 모드는 독립 컴포넌트로 분리:
- `CameraNavigator` — 빌딩 클릭 시 fly-to
- `StaticCameraView` — 랜딩 light backdrop
- `IntroCameraAnimation` — 랜딩 hero
- `CameraViewOffsetSync` — rail 변화에 맞춘 frustum 패닝

### 7.3 Fog 시스템

#### 다크 모드 (랜딩 hero)

```ts
{ r: 0.04, g: 0.04, b: 0.06,  near: 400,  far: 2000, exp: 1.8 }
```

near 가 캐릭터 가까이 있어 도시가 빠르게 안개에 잠김 → 시네마틱 분위기.

#### 라이트 모드 (메인 맵)

```ts
{ r: 1.00, g: 1.00, b: 1.00,  near: 1200, far: 4000, exp: 1.2 }
```

near 가 멀어 클리어한 도시 + 멀리만 부드러운 흰 안개.

#### 날씨 modifier

```ts
const modifiers = {
  rain:    { intensity: 0.35 + 0.55 * mm,   tint: rgb(.55, .62, .70) }, // cool blue
  thunder: { intensity: 0.85,                tint: rgb(.40, .44, .52) }, // dark grey
  snow:    { intensity: 0.45 + 0.45 * mm,   tint: rgb(.86, .88, .92) }, // soft pale
  fog:     { intensity: 0.95,                tint: rgb(.78, .80, .82) }, // grey
};
```

실시간 강수량(`mm`) 에 비례해 fog density 가 동적으로 변함.

### 7.4 비/눈 입자 시스템

#### prisoner849 LineSegments GPU pattern

```glsl
// 각 입자: gEnds.x = topY, gEnds.y = bottomY (per-vertex)
// GPU 에서 mod() 로 무한 루프 → CPU 부담 0
gl_Position = projectionMatrix * modelViewMatrix * vec4(
  position.x + windOffset.x,
  mod(position.y - time * speed, gEnds.x - gEnds.y) + gEnds.y,
  position.z + windOffset.z,
  1.0
);
```

- 60fps 에서 ~5000 입자도 GPU 부담 거의 0
- 바람 oscillation `sin(time * 0.31)` 으로 자연스러운 흔들림
- `precipitationIntensity` 가 입자 수 / 속도 / 길이 / alpha 모두 동시 스케일

### 7.5 랜딩 light backdrop 카메라

```ts
staticCameraView={{
  position: [0, 1600, 1300],   // 미드 알티튜드 새의 눈 시점
  target: [0, 0, 0],
}}
```

- y=1600: 너무 높지 않게 individual 빌딩 디테일 살림
- z=1300: 전경 빌딩이 stats 텍스트 가리지 않게 살짝 뒤로
- 인트로와 다른 별도 카메라 — 랜딩 light 섹션은 정적이라 OrbitControls / 패닝 모두 비활성

---

## 8. 모션 디자인

### 8.1 트랜지션 토큰

```ts
TRANSITION = {
  fast:    '120ms ease',     // hover, color, opacity
  normal:  '160ms ease',     // background, transform 큰 변화
  smooth:  '180ms cubic-bezier(0.2, 0.9, 0.3, 1)',  // overlay 등장
  bar:     '320ms cubic-bezier(0.2, 0.7, 0.2, 1)',  // NowPlayingBar 등장
}
```

#### 사용 예시

- 행 hover: `background 120ms ease` (즉각)
- 카메라 frustum 시프트: `tau ≈ 80ms exponential` (부드러운 글라이드)
- Up Next 펼침: `180ms slide-up + opacity` (smooth)
- Toast 등장: `180ms cubic-bezier(0.2, 0.9, 0.3, 1) + translateY 8px → 0`
- Hero 인트로: `2400ms ease-out cubic`

### 8.2 마키 (overflow 텍스트)

긴 트랙명 / 큐레이터 이름이 잘릴 때, **호버 시에만 슬라이드**.

```css
.vbk-card-mq:hover .vibloc-mq.is-overflow > .vibloc-mq-track {
  animation: vibloc-mq-flow var(--mq-duration, 6s) linear infinite;
}
```

부모 카드 호버 → 카드 안의 모든 마키 동시 흐름. `prefers-reduced-motion` 에서 전부 정지.

### 8.3 EQ 인디케이터

3개 bar 가 sin 곡선처럼 scaleY:

```css
@keyframes vbk-eq-bar {
  0%, 100% { transform: scaleY(0.35); }
  50%      { transform: scaleY(1); }
}
```

- 각 bar 0 / 180 / 360 ms 스태거 → 인위적이지 않은 랜덤 같은 모션
- `prefers-reduced-motion` → 정적 ~70% 높이

### 8.4 스크롤 큐 (랜딩 하단)

```css
@keyframes vbk-scroll-cue-bounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50%      { transform: translateX(-50%) translateY(6px); }
}
```

1.8s loop, 6px 만 이동 → 강하지 않게 "더 있어요" 신호.

---

## 9. 접근성 고려

### 9.1 키보드 네비게이션

```css
button:focus-visible,
[role="button"]:focus-visible,
[role="listitem"]:focus-visible,
a:focus-visible {
  outline: 2px solid rgba(14, 14, 26, 0.55);
  outline-offset: 2px;
  border-radius: inherit;
}
```

`:focus-visible` 만 사용 — 마우스 클릭 시는 outline 안 보이고 키보드 Tab 일 때만. macOS native 동작과 일치.

### 9.2 ARIA

- 모든 커스텀 버튼 → `aria-label` + `aria-pressed` (좋아요) / `aria-expanded` (Up Next)
- 토스트 → `role="status"`, `aria-live="polite"`
- 디코레이션 요소 → `aria-hidden="true"`
- 트랙 행 → `role="button"` + `tabIndex=0` + Enter/Space 키 핸들러

### 9.3 터치 타겟

```
모든 인터랙티브 버튼 ≥ 32×32 px
(HIG 권장 36+ 에 가까움; 28→32 일괄 bump 적용)
```

행 트레일링 클러스터의 gap 도 2 → 4 px 로 늘려 mis-click 위험 완화.

### 9.4 prefers-reduced-motion

모든 애니메이션 (인트로, 마키, EQ, 스크롤 큐, 토스트) 에 미디어 쿼리 가드:

```css
@media (prefers-reduced-motion: reduce) {
  .vbk-hero-content { animation: none; opacity: 1; }
  .vbk-scroll-cue   { animation: none; }
  /* ...전체 일괄 정지 */
}
```

### 9.5 텍스트 대비

- ink (`#0e0e1a`) on paper (`#faf9f6`): **WCAG AAA**
- ink3 (`#5a5a66`) on paper at 12px: **AA 4.5:1 통과**
- 12px 텍스트가 최소 사이즈 → 그 아래는 시스템 자체에 없음

---

## 10. 프로덕션 폴리싱

### 10.1 가상 캐릭터 dev-only gate

`seedAgents.ts` 가 6 도시 × ~8 큐레이터 × ~5 트랙 = ~240 개 데모 데이터를 푸시. 디자인 검토에는 좋지만 실제 사용자에게는 혼란.

```tsx
useEffect(() => {
  if (!import.meta.env.DEV) return;  // ← production 에서 early return
  void import('./features/dev/seedAgents').then(...)
}, [buildings, area]);
```

Vite 가 production 빌드 시 dynamic import 가 dead code 임을 인지 → **번들에서 완전 tree-shake**.

### 10.2 Auto-select-on-mount 제거

기존 코드는 `getPlayerStateSnapshot().currentBuildingId` 가 있으면 mount 시 자동으로 그 빌딩 선택 (이전 세션 복원).

```tsx
// REMOVED: building 자동 복원 useEffect
```

→ 새 사용자는 "Explore Map" 클릭 후 깨끗한 캔버스로 진입. 명시적 클릭으로 시작.

### 10.3 환경변수 문서화

`.env.example` 확장:

```
VITE_SUPABASE_URL          (필수)
VITE_SUPABASE_ANON_KEY     (필수)  ← publishable 또는 legacy JWT 둘 다 OK
VITE_GOOGLE_CLIENT_ID      (선택)  ← Sign in with Google
VITE_API_URL               (선택)  ← 백엔드
VITE_GOOGLE_MAPS_EMBED_KEY (선택)  ← Street View 프리뷰
```

각 변수마다 어디서 발급받는지 단계별 설명 + 보안 주의사항.

### 10.4 저장소 정리

| 파일/폴더 | 처리 |
|---|---|
| `Compass.tsx`, `CityVibeBlock.tsx`, `AppleMusicIcon.tsx` | 모든 import 0 → **삭제** |
| `bun.lock` | npm 사용 → **삭제** |
| `CLAUDE.md`, `docs/business/`, `TODAY-*.md`, `docs/개발현황-총정리.md` | 비공개 자료 → **gitignore** + `git rm --cached` |
| 인라인 `console.log` | DEV 가드로 wrap |

### 10.5 README 신규

영문 primary + 한국어 요약. Features / Stack / Quick start / Env vars / Project layout / Design system / Deployment.

### 10.6 빌드 검증

```
TypeScript: clean (5 errors 수정 후)
Vite build: 380ms
Bundle (gzip total): 580 KB
  - vendor-three: 318 KB (가장 큼)
  - MarqueeText (chunk): 96 KB
  - vendor-react: 74 KB
  - MapAppPage: 44 KB
```

`vendor-three` 가 318 KB 는 큼. 향후 dynamic import 로 routes 별 split 검토.

---

## 11. 기술 의사결정 트레이드오프

### 11.1 Zustand vs Context vs Redux

→ **Zustand**

- React Context 보다 구독자 단위 리렌더 정밀
- Redux 보다 boilerplate 90% 감소
- TypeScript 추론 자연스러움
- `usePlayerState()` 같은 selector hook 패턴

### 11.2 R3F vs three.js raw

→ **R3F**

- React 선언형 패턴으로 씬 그래프 관리
- `useFrame` / `useThree` 훅으로 ECS-like 편의
- 단점: 매 프레임 React reconciliation 오버헤드 → 핫 패스는 `useRef` 로 직접 mutate

### 11.3 OSM Overpass vs 자체 데이터

→ **OSM + Wikipedia/Wikidata enrichment**

- 라이선스: ODbL (오픈)
- 빌딩 footprint + height + 테넌트 정보 무료
- 단점: 데이터 품질 들쭉날쭉 → POI 매칭 + 주소 verifier 필터링 layer 추가

### 11.4 Apple Music vs Spotify vs YouTube Music

→ **Apple Music (iTunes Search API)**

- **auth-free** — 클라이언트만으로 검색 가능
- 30초 프리뷰 무료
- album artwork 600×600 직접 호스팅
- Spotify 는 OAuth 필수 + Web Playback SDK 가 무거움
- YouTube Music 은 공식 API 부재

### 11.5 Supabase vs Firebase vs 자체 백엔드

→ **Supabase**

- Postgres + Row Level Security 로 SQL 표준 유지
- Auth + Storage + Realtime 한 패키지
- anon key 가 client-safe (RLS 가 보안)
- Firebase 의 NoSQL 모델보다 우리 도메인 (관계형 — playlist · track · user · building) 에 더 적합

### 11.6 Vercel vs Netlify vs 자체 호스팅

→ **Vercel**

- Vite preset 자동 감지
- Edge function 무료 tier 충분
- GitHub 연동 PR preview 자동
- 한국·일본·동남아 CDN 지점 있음 (Asia 트래픽 대응)

---

## 12. 회고와 다음 단계

### 12.1 잘 된 것

1. **CSS 변수 reactive 패턴** — prop drilling 없이 cross-cutting concern (rail width → bar / 카메라 / 패널) 깔끔하게 해결.
2. **모노크롬 + 액센트 정책** — 음악(앨범 아트) 이 가장 강한 컬러가 되도록 시스템 자체를 quiet 하게.
3. **2-tier 폰트** — 사용자 피드백 받고 점진 평탄화. 결과적으로 Apple HIG 와 더 가까워짐.
4. **`setViewOffset` 카메라 패닝** — 캔버스 transform 의 가장자리 노출 버그 해결.
5. **Production gate** — `import.meta.env.DEV` 한 줄로 dev/prod 데이터 분리.

### 12.2 어려웠던 것

1. **카메라 패닝의 부호** — `setViewOffset` 의 offsetX 부호가 직관 반대 (양수=컨텐츠 left). 첫 시도 부호 오류로 빌딩이 NowPlayingBar 반대편으로 이동. 디버그에 30분 소요.
2. **Up Next 펼침 시 layout shift** — 처음 두 시도 (floating 카드 / footer 자체 자라남) 모두 부작용. `position: absolute, bottom: 100%` 가 정답이었지만 발견까지 시행착오.
3. **타이포 ladder 평탄화 결정** — 3-tier 가 디자인 시스템 책에 더 가깝지만, 사용자가 "큰 글씨가 부담" 한 피드백 → 2-tier 로 단순화. 책보다 사용자 의견 우선.

### 12.3 다음 단계

- [ ] **PR & 머지**: `feat/left-info-panel` → `main` (윤섭님 리뷰 후)
- [ ] **Vercel 배포** + 도메인 연결
- [ ] **Supabase URL 등록** (Site URL + Redirect URLs)
- [ ] **번들 사이즈 최적화** — `vendor-three` 의 dynamic import 분할
- [ ] **Lint 정리** — 116개 기존 경고 점진 처리
- [ ] **모바일 대응** — 280px rail 은 desktop 전용. 모바일 stack 레이아웃 별도 디자인 필요
- [ ] **실사용자 onboarding** — 가상 캐릭터 제거 후 빈 상태에서 "어떻게 시작하나" 가이드
- [ ] **소셜 기능** — 친구 팔로우 / 공유 링크 / 활동 피드

---

## Appendix A. 디자인 토큰 참조

전체 토큰 정의: `src/lib/ui/tokens.ts`

```ts
COLOR.{ink, ink2, ink3, ink4, paper, white,
       hover, accent, hoverStrong, tint,
       divider, dividerStrong,
       overlayDim, shadowAlpha,
       shadowMd, shadowMdDark, shadowUp, shadowUpDark,
       onDark, onDark2, paperDark, paperDarkSolid,
       tintDark, hoverDark, accentDark, dividerDark, dividerDarkStrong,
       appleRed, heartRed, liveGreen,
       medalGold, medalSilver, medalBronze}

FONT.{ui, mono}

SPACE = { 1:4, 2:8, 3:12, 4:16, 6:24, 8:32, 12:48 }

RADIUS = { s:6, m:10, l:14, xl:20, pill:999, full:'50%' }

EYEBROW         = 12 / 700 / +0.08em / uppercase
PANEL_HEADER    = 12 / 600 / +0.10em / uppercase
SECTION_HEADER  = 12 / 600 / +0.06em / uppercase
ROW_TITLE       = 16 / 600 / -0.01em / lh 1.3
ROW_CAPTION     = 12 / 500 / -0.01em / lh 1.3
HERO_HEADLINE   = 16 / 700 / -0.01em / lh 1.2
COMPACT_PILL_BUTTON = inline-flex, gap 8, padding 0 8, minHeight 32
```

## Appendix B. 디렉토리 맵

```
src/
├── App.tsx                      메인 맵 페이지 — 빌딩 선택, 패널, 큐
├── main.tsx                     entry
├── app/
│   └── router.tsx               react-router 설정
├── components/
│   ├── canvas/
│   │   ├── PlateauScene.tsx     R3F Canvas + 카메라 + fog + 효과
│   │   ├── OSMCity.tsx          OSM 빌딩 jeometry + 셰이더
│   │   ├── WeatherFX.tsx        비/눈 입자 (LineSegments GPU)
│   │   └── effects/             post-processing 효과
│   ├── layout/                  헤더, 인증 레이아웃
│   ├── ui/
│   │   ├── FixedToolSidebar.tsx 좌측 rail
│   │   ├── ToastHost.tsx        토스트 HUD
│   │   ├── SearchBar.tsx        도시·빌딩 검색
│   │   └── music/
│   │       ├── FixedQueueSidebar.tsx       우측 rail (음악)
│   │       ├── NowPlayingBar.tsx           재생바 (auto-center)
│   │       ├── NowPlayingEQ.tsx            3-bar EQ 인디케이터
│   │       ├── TrackRow.tsx                트랙 행 (재사용)
│   │       ├── PopularTrackCard.tsx        TOP PICKS
│   │       ├── TopTaggerCard.tsx           TOP PLAYLISTS
│   │       ├── BuildingPlaylist.tsx        MY PLAYLIST
│   │       ├── RecommendedList.tsx         AI 추천
│   │       ├── AddTrackComposer.tsx        검색 컴포저 + 큐레이터 매치
│   │       ├── PlaylistDetailView.tsx      플레이리스트 상세
│   │       ├── PlaylistCover.tsx           2×2 모자이크 커버
│   │       ├── PreviewPlayer.tsx           오디오 + 큐 + repeat/shuffle
│   │       └── MarqueeText.tsx             overflow 마키
├── features/
│   ├── auth/                    Supabase auth + 아바타
│   └── profile/                 빌딩 resolver, my-music
├── lib/
│   ├── geo/                     OSM loader, Plus Code
│   ├── music/                   iTunes wrapper, recommendation engine
│   ├── ui/
│   │   ├── tokens.ts            COLOR / FONT / SPACE / RADIUS
│   │   └── toast.ts             toast pub/sub store
│   └── share/                   Apple Music 딥링크
├── pages/
│   ├── landing/LandingPage.tsx  랜딩 (시네마틱 인트로)
│   ├── auth/                    로그인 / 회원가입
│   ├── mypage/                  내 페이지 + 플레이리스트 상세
│   └── share/                   공유 프리뷰 페이지
└── stores/                      zustand stores (time, weather, building)
```

---

**문서 마지막 수정**: 2026-05-06
**총 라인**: ~520
**다음 업데이트**: PR 머지 + 배포 후 실사용자 데이터 회고 추가 예정
