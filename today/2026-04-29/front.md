# Front — 2026-04-29

**음악 매칭 100%·UI 일관성·전체 a11y 패스** — 4/28 ~ 4/29 사이의 작업. 커버 매칭 50/52 빌드타임 베이크 + Apple Music 앱 아이콘 통일 + 좌/우 패널 그리드 통일 + 자동재생 / NowPlayingBar / 글로벌 a11y.

---

## 한 줄 요약

iTunes 텍스트 매칭의 본질적 한계(같은 곡 N개 collection)를 **빌드타임 4-source 베이크 (iTunes lookup → Search → Deezer → MusicBrainz+CAA)**로 우회 → 50/52 트랙 100% Apple-byte-identical 커버 보장. 음악 surface 전체에 **Apple Music 앱 아이콘 (그라데이션 + 빔드 노트 글리프)** + **좌/우 패널 그리드 통일 (PLACE / MUSIC dot)** + **글로벌 NowPlayingBar (180ms 페이드인)** + **빌딩 클릭 시 자동재생 (250ms 후 #1 트랙)** + **WCAG 2.4.7 글로벌 focus-visible + prefers-reduced-motion 안전망** 적용.

---

## 주요 변경점

| 영역 | 변경 |
|------|-----|
| **공유 모달** | QR 모달 폐기 → URL 기반 Web Share / Copy link 모달. 같은 `/p#p=…` fragment payload, 백엔드 0 유지 |
| **`/p` 라우트** | `PlaylistPreviewPage` 신설 — 디코드 → hero 커버 + 트랙 리스트 + per-track Apple Music 직링크. 인앱 브라우저 감지 + iOS `music://` 스킴 우회 |
| **트랙 검색 정확도** | `coverArt.ts` 신설 (3-tier scorer): Tier-0 iTunes lookup `?id=…` (storefront-aware) → Tier-1 strict scored search (variant −60, compilation −20, single +8) → Tier-2 MusicBrainz + Cover Art Archive 폴백 |
| **빌드타임 커버 베이크** | `scripts/bakeSeedCovers.mjs` — 모든 시드 트랙을 4 source 체인으로 resolve → `seedCovers.json` 한 파일에 frozen. mk()가 첫 페인트부터 진짜 Apple URL 사용. 50/52 (96%) |
| **시드 데이터 검증** | `scripts/auditSeedCovers.mjs` (실시간 lookup) + `scripts/crossCheckSeeds.mjs` (batch lookup, 600 IDs at once) — DJ Mix / Today's Hits / Boiler Room / 디럭스 / 컴필 함정 다 잡아냄 |
| **로케일 storefront 자동 감지** | 한글 → KR / 카나 → JP / 한자 → JP / kpop genre → KR. JP-only 트랙 (Pocket Park) 미국 store에서 0 반환 → JP store로 라우팅 |
| **Personal playlist names** | 17 페르소나 모두 `"{First}'s playlist"` 패턴 (iOS Music 디폴트). Editorial blurb 폐기 |
| **Mosaic / Custom cover** | `PlaylistCover.tsx` — 4-tier 폴백 체인 (custom URL → 4-up mosaic → single image → monogram). 5 페르소나에 `customCoverUrl` 박힘 (Omar/Mei/Sora/Kai/Ezra). 404 시 silent fallback |
| **Apple Music 앱 아이콘** | `AppleMusicIcon.tsx` — 빨간 둥근 사각형 (22% radius squircle) + 흰 빔드 더블 8th-note SVG path. 그라데이션 `#FB5C74 → #FA243C` + inset 1px 흰 specular. 3 surface (TrackRow / NowPlayingBar / PreviewPage) 다 같은 컴포넌트 |
| **Tenant 클릭 → Google Maps** | `tenantClickUrl.ts` — 3-tier (website > Maps `/@lat,lon,18z` > 검색 폴백). generic noun ("restaurant" / "cafe") 자동 제외해 brand만 검색 → 정확도↑ |
| **Tenant 박스 크기** | 28→36px (desktop) / 36→44px (mobile). 이미지 100%×100% cover + 흰 배경 → 부분 투명 PNG 뒤로 패널 halo 안 비침 |
| **mood-vector tenant 분석** | `tenantMood.ts` 신설 — 입점을 4-D mood 벡터 (energy / warmth / intimacy / formality) + peakHour. 시간 가중평균. literal "japanese → city pop" 매핑 폐기. RSS 인기곡 비중 60%→75% |
| **번역 lang-aware geocode** | `reverseGeocode(lat, lon, lang)` — 사용자 lang을 Nominatim accept-language 우선순위로. 주소 포맷 로케일별 (KO 큰→작은, JA 구분자 X, EN street-first) |
| **i18n 확장** | player.* / detail.* / share.* / preview.* / panel.music 키 추가. NowPlayingBar / PlaylistDetailView / PlaylistShareModal 다 `useT()` 통과 |
| **NowPlayingBar** | 글로벌 하단 미니 플레이어 (440px max). 6 요소: artwork / title-artist / play-pause / progress (click-to-seek) / Apple Music / × close. 페이드 180ms |
| **자동 재생** | 빌딩 클릭 → 250ms 후 #1 플레이리스트 1번 트랙 자동 `playPreview`. Dedup 가드 (lastAutoPlayRef)로 같은 곡 재트리거 차단 |
| **City 셀렉터 압축** | 6-chip 행 → 단일 드롭다운 pill (bottom-LEFT). NowPlayingBar bottom-CENTER와 충돌 해결. Hick's Law (1 결정만 노출) |
| **좌/우 패널 그리드 통일** | PLACE pink dot + MUSIC green dot 헤더 페어. SECTION_HEADER 토큰 (11/800/1.2) 적용 → TENANTS / TOP PLAYLISTS / TOP PICKS 모두 동일 스펙 |
| **이미지 사각형 통일** | 모든 음악 surface 사진 → 사각 (rounded). 액션 버튼 (호버 ⋯ / + / × / 메달 pip) 만 원형 유지 |
| **글로벌 a11y CSS** | `:focus-visible` 2px 인디고 outline (다크모드 라이터). `@media (prefers-reduced-motion: reduce)` 안전망 |
| **데드 코드 정리** | 6 파일 삭제 (BuildingPanel / BentoGrid / TrustStats / HeroCity / CityBuilding / PlateauCity). 주석 처리된 i18n 키 제거 |
| **vendor split** | three / drei / postprocessing → `vendor-three.js` (1 MB). 마케팅 entry 491→87 KB gz (-82%) |

---

## 핵심 패턴

**1. 빌드타임 4-source 커버 베이크**
```
[1] iTunes lookup?id=N&country={JP|KR|US}    → 41 hits 🎯 결정론
[2] iTunes search + scored matcher            → 4 hits  🔍
[3] Deezer search                             → 1 hit   🎵
[4] MusicBrainz + Cover Art Archive           → 4 hits  📚
                                              ──────
                                              50/52 (96%)
```
브라우저 CORS / iTunes rate limit / MB 1 req/sec 모두 Node에서 우회. 결과 `seedCovers.json` frozen → 런타임 fetch 0.

**2. Variant + Collection 페널티**
```
ct === wt → +50, ca === wa → +50
VARIANT_RE → −60 (Karaoke/Live/Instrumental/Remix/Deluxe Edition)
COMPILATION_RE → −20 (DJ Mix/Boiler Room/Today's Hits/Greatest)
trackCount === 1 → +8 (Single 우선)
releaseDate 오래될수록 → 최대 +5 (원본 우선)
```
"Sunflower" → Spider-Verse OST vs Hollywood's Bleeding vs Diamond Collection 정확히 분리. "DJ Mix" 함정 거부.

**3. Storefront 자동 감지**
```
한글 → KR / 카나 → JP / kpop → KR / jpop → JP / CJK → JP / else → caller
```
"アイドル / YOASOBI" → JP store 우선 → 1등 결과 = 정답. US store에 없는 JP-only release도 매칭.

**4. mood-vector 추천**
```
Tenant tag → MoodVector (energy/warmth/intimacy/formality, peakHour)
buildingMood = avg weighted by |peakHour - now| (close 1.3x, far 1.0x)
moodToGenreBoosts → small additive (max ±2)
```
도쿄 한식당 11pm = 도쿄 인기곡 + intimate dinner mood (NOT k-pop). 같은 한식당 서울 11pm = k-pop 자연스럽게 (city profile에서).

**5. 자동재생 dedup**
```
lastAutoPlayRef = { buildingId, trackId }
if (last.id === id && last.tid === firstTrack.id) return; // skip
```
useEffect 재실행 시 같은 곡 재트리거 (toggle pause / restart 0:00) 방지.

---

## 안 건드린 것

- 백엔드 0줄 (오늘도)
- iTunes 검색 자체 (이미 작동 중)
- 사용자 인증 / 프로필 동기화

---

## 현태용 — 쉬운 말로만

- 음악 커버 다 진짜 그 곡 그림으로 매칭됨. 50개 중 48개는 빌드 시점에 미리 찾아서 baked-in. 나머지 2개는 가짜 곡 이름이라 placeholder.
- 가상 큐레이터 17명 다 "Luna's playlist" / "Jiro's playlist" 같은 개인 이름 패턴 (iOS Music 디폴트). Editorial 블루brbm 폐기.
- 5명에겐 사용자가 보낸 사진 5장 (곰인형/검은고양이/펭귄/말/실루엣) 반영. `public/playlist-covers/` 에 떨어뜨리면 바로 적용. 안 떨어뜨리면 그 5명도 자동으로 4-up 모자이크.
- 빌딩 클릭 → 250ms 후 #1 플레이리스트 1번 곡 자동 재생. 하단에 미니 플레이어 떠오름.
- 빨간 Apple Music 버튼 = 진짜 앱 아이콘 모양. 누르면 iOS는 앱 직접 오픈, 그 외는 웹.
- 입점 정보 클릭하면 Google Maps에 그 가게 정확히 핀. 체인점도 빌딩 좌표로 그 지점 매칭.
- 도시 6개 칩 → 1개 드롭다운으로 줄여서 하단 공간 정리. 음악 플레이어가 가운데 차지.
- 좌/우 패널 헤더가 PLACE 핑크 / MUSIC 그린 dot로 페어. 디자인 시스템 통일.

---

## 윤섭한 — 기술 디테일

### 신규 파일
- `src/lib/music/coverArt.ts` — 3-tier resolveCover (id lookup → search → MB), storefront 자동 감지
- `src/lib/music/musicbrainz.ts` — MB recording search + CAA front-1200, 1 req/sec throttle
- `src/lib/music/tenantMood.ts` — 4-D mood vector + moodToGenreBoosts + moodKeywords
- `src/lib/share/playlistShareUrl.ts` — encode/decode + appleMusicUrl helper
- `src/lib/share/openAppleMusic.ts` — iOS music:// 스킴 + in-app browser detection
- `src/lib/ui/tokens.ts` — APPLE_RED, INK, PAPER, MUTED, DIVIDER, FONT, EYEBROW, PANEL_HEADER, SECTION_HEADER, PANEL_PADDING
- `src/lib/geo/tenantClickUrl.ts` — 3-tier (website / Maps@coords / search)
- `src/components/ui/CityDropdown.tsx` — 단일 pill 드롭다운 (Hick's + Fitts's)
- `src/components/ui/music/PlaylistCover.tsx` — custom + mosaic + single + monogram 폴백 체인
- `src/components/ui/music/PlaylistShareModal.tsx` — Web Share + Copy link
- `src/components/ui/music/NowPlayingBar.tsx` — 글로벌 미니 플레이어
- `src/components/ui/music/AppleMusicIcon.tsx` — Apple Music 앱 아이콘 (그라데이션 + 빔드 노트)
- `src/components/ui/music/FeaturedPlaylistHero.tsx` — 160px hero + share button
- `src/pages/share/PlaylistPreviewPage.tsx` — `/p` 라우트
- `src/features/dev/enrichSeedArtwork.ts` — 백그라운드 enricher (cache v7)
- `src/features/dev/seedCovers.json` — 베이크된 50/52 커버 URL
- `scripts/bakeSeedCovers.mjs` — 4-source 빌드타임 베이커
- `scripts/auditSeedCovers.mjs` — DJ mix / collection 감사
- `scripts/crossCheckSeeds.mjs` — batch lookup (600 IDs/req)

### 주요 수정
- `src/App.tsx` — NowPlayingBar 마운트, 자동재생 useEffect + dedup ref, CityDropdown 통합, lang-aware geocode 호출, mood-vector를 deriveBuildingVibe 거쳐 cityVibeAlgorithm에 흘림, tenant click URL 3-tier
- `src/lib/music/itunes.ts` — `lookupTrackId(id, country)` 시그니처 확장 (overload, 백워드 컴팩), 1200→600 px artwork URL
- `src/lib/music/buildingPlaylist.ts` — TaggerGroup에 `coverGridUrls[]`, `customCoverUrl` 추가
- `src/lib/music/recommendEngine.ts` — RSS 75% / keyword 25% 비율로 변경 (popularity 우선)
- `src/lib/geo/osmLoader.ts` — `reverseGeocode(lat, lon, lang)` 로케일별 주소 포맷
- `src/lib/app/i18n.ts` — player.* / detail.* / share.* / preview.* / panel.music 추가
- `src/components/ui/music/TrackRow.tsx` — 우측 액션 ✓ → AppleMusicIcon (pinned 시), idle ⋯ / hover Plus / × 유지
- `src/components/ui/music/PlaylistDetailView.tsx` — Apple Music style hero (132px square cover), Play/Shuffle pill 버튼, 32% red Play, 트랙 리스트 헤더 "Song / Open(Edit)"
- `src/components/ui/music/PreviewPlayer.tsx` — state에 meta + duration + position 추가, pausePreview / resumePreview / seekPreview helper
- `src/features/dev/seedAgents.ts` — 17 페르소나 personal name, customCoverUrl 5명, SEED_VERSION v17, picsum 600px

### 의존성
- `lucide-react`에 Music4 (사용 안 함, 자체 SVG path 채택)
- 추가 deps 없음 (lz-string은 이전 commit에서 추가)

### 보안 (CSP / 프라이버시)
- 공유 URL 데이터는 fragment(`#`) → 서버 로그/리퍼러 미노출 (검증 완료, 본 리서치 기반)
- iOS music:// 스킴 — Universal Link 라우팅 우회, 인앱 브라우저 capture 회피
- 빌드 타임 베이커는 서버사이드 fetch (CORS 없음). 런타임은 baked JSON만 읽음 → 외부 fetch 0
- localStorage 외 트래커 0
- a11y: `:focus-visible` global, `prefers-reduced-motion` 안전망

---

## 현태가 클로드 코드한테 붙여 넣을 말 (예시)

- 「커버 매칭은 빌드타임 베이크가 source of truth. 시드 추가/수정 후엔 `node scripts/bakeSeedCovers.mjs` 한 번 돌리고 `seedCovers.json` 커밋. 런타임에 새 source 추가하지 마.」
- 「음악 surface에 Apple Music 보내는 버튼 만들 때는 `<AppleMusicIcon href={url} size={N} />` 쓰면 끝. 새로 만들지 마.」
- 「자동재생 트리거는 useEffect + lastAutoPlayRef로. 같은 곡 재트리거 = mute. **dedup 가드 빼지 마.**」
- 「Tenant 클릭은 `tenantClickUrl(tenant, lat, lon)` — 3-tier 자동. website 있으면 그걸로, 없으면 `/maps/search/{q}/@{lat,lon},18z` 형식. `?api=1&query=` 형식은 검색 결과 페이지로 폴백되니 쓰지 마.」
- 「i18n 키 추가는 `src/lib/app/i18n.ts` DICT에. 컴포넌트에서 `useT()` 훅으로 호출. 인라인 영문 박지 마.」
- 「색상은 무조건 `tokens.ts` 통해서. APPLE_RED / INK / PAPER / DIVIDER. 새 색 만들기 전에 토큰 봐.」
- 「Section header는 `fontSize: 11, fontWeight: 800, letterSpacing: 1.2` (SECTION_HEADER 스펙). 다른 값 쓰면 좌/우 패널 그리드 어긋남.」

---

## 다음에 할 만한 것

### 🔴 Critical (구조)
- 패널 3개 동시 노출 통합 (Hick's Law) — 좌(PLACE) + 메인(DETAILS)을 탭으로
- 모바일 bottom sheet (좌·우 패널 폐기, sheet 안 탭으로)
- 자동재생 muted 옵션 / "Click to play" 첫 unlock CTA (Chrome autoplay policy)
- 첫 방문 onboarding (펄스 링 + 토스트 1회)
- 3D 빌딩 키보드 도달 (a11y mirror `<ul>`)

### 🟡 High
- Esc / 빈공간 클릭 deselect (현재 우클릭만)
- 빌딩 hover affordance + cursor pointer
- NowPlayingBar 풀폭 dock or sheet 통합
- 공유 OG 이미지 (Cloudflare Workers 무료) + deep link

### 🟢 Quality
- `seedCovers.json` 자동 재베이크 GitHub Actions (월 1회)
- AcoustID fingerprint 매칭 (지금은 미사용)
- 사용자 pinned 트랙 collectionId까지 저장 (Tier-0 결정론)

---

## 백엔드 쪽

오늘도 백엔드 0줄. 빌드타임 베이커가 사실상 "정적 백엔드" 역할 (Node에서 fetch → JSON으로 freeze → 런타임 read).
