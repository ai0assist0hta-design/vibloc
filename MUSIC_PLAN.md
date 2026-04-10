# VIBLOC — 음악 레이어 구축 계획

> **이 문서는 `CLAUDE.md`(프로젝트 마스터 스펙)의 보조 문서다.** CLAUDE.md에 이미
> 정의된 결정(iTunes Search API 채택, Tag 스키마, Top DJ, Vibe Drop, Walled
> Garden, Phase 1-4 등)을 **무엇 하나 덮어쓰지 않고** 그 위에 "패널 안 음악
> 추천 + 곡 핀 + 짧은 글" 흐름을 어떻게 구체적으로 끼워 넣을지 정한다.
> CLAUDE.md와 충돌이 보이면 항상 CLAUDE.md가 정답이다.

## 0. 왜 이 문서가 필요한가

현재 빌딩 패널은 주소 / Street View / 지도 딥링크 등 **지도 데이터 위주**다.
CLAUDE.md의 핵심 컨셉은 "공간 ↔ 음악"인데, 그 음악 쪽이 코드상으론
- `Tag` 타입에 `trackName / artistName / artworkUrl / previewUrl / comment / vibeTags[]`
  필드만 있고 (`src/types/index.ts`)
- 실제로 곡을 찾고 / 추천하고 / 핀하는 UI·엔진이 비어 있다.

이 문서는 "Phase 2 — Backend + Music" (CLAUDE.md §14)의 클라이언트 측
구체화 + Phase 3의 일부(Vibe Drop)로의 다리 역할.

---

## 1. 정합성 체크 — CLAUDE.md와 어긋나면 안 되는 것

| CLAUDE.md 규칙 | 이 계획의 준수 방식 |
|---|---|
| **iTunes Search API가 음악 1차 소스** (§5) | 트랙 검색 / 30s 프리뷰 / 아트워크 / 1차 장르 분류는 100% iTunes. 보조 소스는 iTunes가 못 주는 "위치 → 추천" 부분에만 사용. |
| **Tag 스키마 고정** (§7) | 신규 테이블/스토어 안 만들고 기존 `Tag` + `useBuildingStore.addTag()` 그대로 사용. 새 필드는 추가하지 않음. |
| **140자 코멘트 한도** (§7) | Composer input maxLength=140 강제. |
| **Vibe Tags 8종 프리셋** (§11) | Composer에 자유 입력 X, 8개 프리셋 칩만 토글. |
| **Walled Garden — 외부 링크 금지** (§11) | 추천/스토리 카드에서 외부(Spotify/YouTube) 버튼 금지. iTunes `trackViewUrl`도 패널 외부에선 안 쓰고, 사용자 프로필 1개 SNS 링크 룰 그대로. |
| **Top DJ 시스템** (§9) | 추천 섹션 헤더에 "🎧 Top DJ: @user" 한 줄 항상 노출. 추천 알고리즘이 Top DJ의 최근 핀을 가산점으로 사용. |
| **Time Decay** (§8) | 건물의 누적 태그를 추천 시드로 쓸 때 기존 `getTimeDecayWeight` 그대로 사용. |
| **디자인 톤 STRICT** (§3) | 새 컬러·폰트 추가 금지. 파스텔 장르 컬러, IBM Plex Mono, glassmorphic 패널 그대로. 새 컴포넌트도 inline style + `GENRE_COLORS` 안에서만. |
| **MVP scope: in-localStorage** (§15) | Phase A는 zustand persist 안에서 끝낸다. Supabase 동기화는 CLAUDE.md Phase 2 후반에 합류. |
| **Vibe Drop = 12h ephemeral** (§11) | "Stories" 섹션 = Vibe Drop의 UI 형태. 12h 지난 핀은 자동 비표시(데이터는 유지). |
| **Geo-Weight <50m: 1.0 / 그 외: 0.01** (§11) | 추천 컨텍스트에 사용자 GPS가 있을 때 `is_local` 가산. |

---

## 2. iTunes만으로 못 하는 부분 — 보조 소스의 정확한 한계

CLAUDE.md가 iTunes를 1차로 못 박은 이유(키 불필요·30s 프리뷰·무제한)는
존중한다. 다만 iTunes Search는 **"이 도시의 음악"** 같은 위치 질의를 직접
지원하지 않는다. 그래서 위치-인식 추천에만 한해 보조 소스를 쓴다.

| 보조 소스 | 쓰는 부분 | 어떻게 iTunes로 귀결시키나 |
|---|---|---|
| **Last.fm `geo.getTopArtists`** (무료 키, CORS, read-only) | "country → 인기 아티스트 N명" | 받은 아티스트명으로 **iTunes에서 다시 검색** → 30s 프리뷰는 iTunes 응답에서만 |
| **MusicBrainz `area`** (키 X, 1 req/s, UA 필수) | "도시 단위 출신 아티스트 보정" | 같은 패턴, iTunes로 환원 |
| **Every Noise at Once 정적 미러** (빌드 시점 1회 fetch) | "city → top genre 라벨" | 라벨 → CLAUDE.md §6 컬러 매핑 → iTunes 검색 시드로 |
| **Wikidata SPARQL** (선택, 키 X) | 정밀 도시-출신 아티스트 (P19) 보정 | 동일 |

**의도적으로 안 쓰는 것** (CLAUDE.md 정신과 충돌):
- Spotify Web API — OAuth 강제 + audio-features 폐기 (§5에 명시)
- YouTube — 임베드는 walled garden 위반
- Genius/Musixmatch — 가사 저작권 이슈

> 즉 보조 소스의 출력은 **항상 iTunes에서 한 번 더 검증된 트랙**으로 환원된다.
> 사용자가 보고 듣는 모든 곡 데이터의 실체는 iTunes 응답이다.

---

## 3. 추천 엔진 (클라이언트만)

### 3.1 입력

```ts
type RecommendationContext = {
  // 위치 (이미 있는 데이터)
  lat: number;
  lon: number;
  country: string;        // ISO-3166-1 alpha-2
  city: string;           // geocoder.ts에서 resolve
  isLocal: boolean;       // 현재 GPS와 <50m이면 true (CLAUDE.md §11)

  // 건물 — 기존 zustand 스토어에서 직접
  building: Building;
  buildingTags: Tag[];    // time decay 적용된 장르 분포가 시드
  topDjUserId: string | null;

  // 환경 (옵션, 패널에서 토글)
  hourOfDay: number;      // 0-23
  vibeIntent?: VibeTag;   // 8개 프리셋 중 하나 (CLAUDE.md §11)
};
```

### 3.2 파이프라인

```
ctx
  │
  ├─[A] City Vibe        Last.fm geo.getTopArtists(country)
  │                      + Every Noise (city → genre 라벨)
  │                      → top 3 GenreKey
  │
  ├─[B] Building Bias    buildingTags의 GenreKey 분포
  │                      (getTimeDecayWeight 적용, 이미 구현)
  │                      + Top DJ의 최근 핀 가중치 +0.3
  │
  ├─[C] Hour Bias        hourOfDay → 장르 보정 테이블
  │                      (06–10 acoustic+, 23–05 chill+, etc.)
  │
  └─[D] Intent           vibeIntent가 설정돼 있으면 GenreKey 리매핑
                         (🌧 Rainy-day → jazz/lofi+, ⚡ Energetic → electronic/pop+)
        │
        └→ 최종 GenreKey 가중치 → 시드 키워드 N개 생성
              └→ iTunes Search로 후보 K개 fetch
                  └→ 동일 artist/album 중복 제거 → 5곡 반환
```

복잡한 mood 벡터(valence/energy/...)는 의도적으로 빼고
**GenreKey 가중치 한 축**으로만 동작한다 — iTunes에 audio-features가 없고,
CLAUDE.md §6의 컬러 매핑이 이미 7-genre 그룹으로 정해져 있어 이 축이 가장
정합성 높은 시드.

### 3.3 파일 레이아웃 (모두 신규)

```
src/lib/music/
  ├── itunes.ts            # CLAUDE.md §5의 1차 소스. searchTrack(), normalizeGenre()
  ├── geoSources/
  │   ├── lastfm.ts        # geoTopArtists(country) — 보조
  │   ├── musicbrainz.ts   # artistArea() — 보조
  │   └── everyNoise.ts    # 정적 lookup — 보조
  ├── cityProfile.ts       # ctx.country/city → top GenreKey[] (캐시 1h)
  ├── hourBias.ts           # 시간대 → GenreKey 가중치
  ├── vibeIntentMap.ts      # 8개 Vibe Tag → GenreKey 가중치
  ├── recommendEngine.ts    # 위 파이프라인 진입점, RecommendedTrack[] 반환
  └── trackTypes.ts         # RecommendedTrack 타입
```

캐시: `idb-keyval` 또는 sessionStorage. 키 = `${country}|${city}|${hour}`.
TTL = 1h. iTunes 호출은 CLAUDE.md §5의 **20 req/min, 300ms debounce** 강제.

### 3.4 라이선스 / 안전
- iTunes: 30s 프리뷰 직접 호스팅 안 함, URL 핫링크만 (약관 OK).
- 아트워크: `artworkUrl100` 핫링크 OK.
- 가사: **금지** (CLAUDE.md 정신 + 기존 copyright 룰).
- Last.fm 키: read-only이므로 `VITE_LASTFM_KEY`로 frontend env (Google Maps Embed
  키와 동일 패턴).
- MusicBrainz: User-Agent `vibloc/0.1 (contact)` 필수.

---

## 4. 패널 UI — 디자인 톤 그대로, 섹션만 추가

기존 패널(주소 / StreetView / 지도 딥링크 / 장르 버튼 / 최근 태그) **아무 것도
수정하지 않고**, StreetView 박스 아래에 세 섹션을 끼워 넣는다. 새 컬러/폰트
없음 — CLAUDE.md §3·§6의 팔레트만 사용.

```
┌─ Building Panel ─────────────────┐
│ [기존 그대로]                    │
│  이름 / 주소                     │
│  Street View 프리뷰              │
│  Google/Apple Maps 버튼          │
│  카테고리 칩들                   │
│                                  │
│ ── CITY VIBE ─────────────       │  ← 신규 A (read-only)
│  Tokyo · 23:14                   │
│  city-pop · ambient · jazz       │
│                                  │
│ ── RECOMMENDED ───────────       │  ← 신규 B
│  🎧 Top DJ: @hana                │
│  ♫ track1 — artist          ▶    │
│  ♫ track2 — artist          ▶    │
│  ♫ track3 — artist          ▶    │
│  [⟳]  [🎶 chill] [🌧]            │  ← Vibe intent 칩 토글
│                                  │
│ ── VIBE DROPS ────────────       │  ← 신규 C (= CLAUDE.md Vibe Drop)
│  [+ Pin a song]                  │
│  ┌──────┐ "비 오는 신주쿠..."    │
│  │ art  │ ♫ track — artist       │
│  │  ▶   │ — @user · 3h · F5      │
│  └──────┘                        │
└──────────────────────────────────┘
```

### 4.1 컴포넌트

```
src/components/ui/music/
  ├── CityVibeBlock.tsx       # 도시명 + top 3 장르 (read-only)
  ├── RecommendedList.tsx     # 5곡 카드 + ⟳ + 8개 Vibe intent 칩
  ├── PreviewPlayer.tsx       # 단일 <audio> 싱글톤. 한 번에 한 곡만 재생.
  ├── VibeDropFeed.tsx        # 12h 이내 핀만 노출 (CLAUDE.md §11)
  └── PinSongComposer.tsx     # 트랙 검색 → 카드 → 140자 코멘트 → Vibe Tag 칩 → Pin
```

### 4.2 PreviewPlayer 규칙

- 패널 안에서 어떤 ▶이든 하나 누르면 다른 ▶ 자동 정지 (전역 싱글톤).
- Space = 재생/정지 (a11y).
- 첫 클릭 후에만 unlock — 자동재생 정책 우회 안 함.
- 10초 hover 시 자동 페이드아웃 (사용자가 카드 위에 머무는 동안만 재생되는
  Instagram-story 느낌).

### 4.3 PinSongComposer 흐름

1. "+ Pin a song" → 작은 모달이 패널 위에 layer.
2. 트랙 검색 input (300ms debounce, iTunes Search).
3. 결과 5개 중 1곡 선택 → 카드 미리보기 (artwork + 제목 + 30s ▶).
4. 층 선택 (CLAUDE.md의 floor 기준 그대로 — `useState selectedFloor`).
5. Vibe Tag 칩 토글 (8개 프리셋 중 1-2개).
6. 코멘트 input `maxLength=140`.
7. **Pin** → `addTag(buildingId, floor, primaryGenreName→GenreKey, {trackName,
   artistName, artworkUrl, previewUrl, comment, vibeTags})`.
8. 즉시 `VibeDropFeed`에 reverse-chronological로 표시.
9. CLAUDE.md §10의 리워드도 발화: 첫 핀 +30 VC, 일반 핀 +10 VC, is_local +25 VC,
   퀘스트 카운트 +1.

### 4.4 Top DJ 표시

- `RecommendedList` 헤더에 항상 노출.
- Top DJ가 바뀌면 (CLAUDE.md §9) 짧은 toast.
- 본인이 Top DJ인 경우 헤더 옆에 ⚙ → CLAUDE.md §10 shop의 building FX 적용
  버튼 (Phase 후반).

---

## 5. CLAUDE.md Phase 분류와의 매핑

CLAUDE.md §14에 이미 Phase 1-4가 정의돼 있다. 이 음악 레이어는 그 안에서
다음과 같이 자른다:

### Phase 1 (3D City + Tagging)
- **변화 없음.** 이미 끝났거나 진행 중.

### Phase 2 (Backend + Music) — 이 문서가 메인으로 다루는 곳
- **2A. 데이터 레이어 (UI 0)**
  - `src/lib/music/itunes.ts` + `src/lib/music/recommendEngine.ts`
  - `geoSources/` 3개 어댑터
  - 콘솔 진입점 `window.__recommend(buildingId)`로 검증
  - 캐시 + 레이트리밋

- **2B. 패널 read-only 섹션 (Section A + B)**
  - `CityVibeBlock`, `RecommendedList`, `PreviewPlayer` 추가
  - 기존 패널에 끼움
  - 검증: ESB → "NYC · jazz, hip-hop" + 5곡 + ▶

- **2C. Composer + Pin 저장 (Section C 일부)**
  - `PinSongComposer` + 기존 `addTag()` 연결
  - 핀 생성 시 CLAUDE.md §10의 VC/XP 발화
  - localStorage persist만 (Supabase는 아직)

- **2D. Supabase 합류**
  - CLAUDE.md §7의 `tags` 테이블에 1:1 매핑
  - Top DJ 서버 측 산출
  - Realtime으로 다른 사용자 핀 stream-in

### Phase 3 (Social + Gamification)
- **3A. Vibe Drop UI (Section C 완성)**
  - `VibeDropFeed` — 12h 필터 + 카드 렌더
  - CLAUDE.md §11 ephemeral 룰 그대로

- **3B. Geo-Weight**
  - 사용자 GPS와 건물 거리 <50m이면 `is_local=true`, weight 1.0
  - 추천 엔진에도 동일 가중치

- **3C. VIBLOC Export**
  - 핀 카드 + 도시 배경을 1080×1920 PNG로 (html-to-image, 클라이언트만)
  - Web Share API
  - CLAUDE.md §11 그대로 walled garden 유지

### Phase 4 (Polish)
- 추천 엔진 LRU 캐시 튜닝
- a11y 키보드 단축키 정리
- mobile 패널 레이아웃 (디자인 톤 유지)

---

## 6. 비기능 요구사항

- **시각적 영향 0**: 새 컴포넌트도 inline style + `GENRE_COLORS` 만 사용.
  Tailwind가 CLAUDE.md §4에서 예고됐지만 현 코드는 inline-style이므로 그
  관행 유지 (이 PR에서 Tailwind 도입 안 함).
- **첫 화면 ≤300ms**: City Vibe 섹션은 캐시 hit 시 동기 렌더, 추천 fetch는
  비동기.
- **레이트리밋**: iTunes 20/min, Last.fm 5/s, MB 1/s — 어댑터 자체 토큰 버킷.
- **오프라인 폴백**: 모든 source 실패 시 Every Noise 정적 데이터로 최소 한 줄
  ("Tokyo의 대표 장르: city-pop")는 항상 보이게.
- **a11y**: ▶ Space 토글, 핀 모달 ESC 닫기, 칩 Tab 순환.
- **i18n**: 기존 `lib/i18n.ts` 패턴에 KR/EN/JP 추가.

---

## 7. 위험 / 미해결

| 리스크 | 대응 |
|---|---|
| Last.fm geo 데이터가 수년 정체됨 | Every Noise 정적 미러로 보강. 둘 다 빈 도시는 country fallback. |
| iTunes 결과의 장르 라벨 다양성 (예: "K-Pop", "World") → CLAUDE.md §6의 7개 그룹 매핑 누락 | `normalizeGenre()` 함수에서 alias 테이블로 흡수. 모르는 라벨은 `indie`로 폴백. |
| 사용자가 Walled Garden을 깨고 외부 URL을 코멘트에 적음 | 기존 CLAUDE.md §11 "Comment URLs auto-filtered" 룰을 composer 단에서 정규식으로 차단. |
| Top DJ 가산점이 추천을 한 사람에게 편향 | hourly window로 가중치 reset, 한 user의 기여는 max 30%로 cap. |
| 12h ephemeral과 사용자 기대 어긋남 | 핀 직후 toast "이 드롭은 12시간 후 사라져요". |
| 자동재생 차단 | 첫 ▶ 클릭으로만 unlock, 이후도 사용자 액션 기반. |

---

## 8. 즉시 시작 가능한 첫 PR

가장 ROI 높은 첫 단위 = **CLAUDE.md Phase 2A + 2B의 절반**:

1. `src/lib/music/itunes.ts` — `searchTrack(query)`, `normalizeGenre()`
2. `src/lib/music/geoSources/lastfm.ts` — `geoTopArtists(country)`
3. `src/lib/music/recommendEngine.ts` — country → top artist → iTunes 검색 → 5곡
   (mood 벡터 없이, GenreKey 가중치만)
4. `src/components/ui/music/CityVibeBlock.tsx` — 도시명 + top 3 장르 라벨
5. `src/components/ui/music/RecommendedList.tsx` + `PreviewPlayer.tsx`
6. 기존 패널의 StreetView 박스 아래에 두 컴포넌트 끼우기

이 한 PR로 패널은 더 이상 "지도 데이터만 있는" 박스가 아니게 되고,
나머지(2C, 2D, 3A…)는 같은 인터페이스 위에 점진적으로 올린다.

---

*Aligned with `CLAUDE.md` v2026-04-04. Any future change to CLAUDE.md
overrides this file.*
