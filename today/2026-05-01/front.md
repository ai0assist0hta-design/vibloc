# Front — 2026-05-01

**Apple Music macOS 플레이어바 + 양쪽 rail 글래스 통일 + 8pt 그리드 정규화 + 내 플레이리스트 바로가기** — 4/30 ~ 5/1 사이의 작업. 단일 행 플레이어바 (shuffle/prev/PLAY/next/repeat + 곡 + ⋯/+ + ×) + 그라데이션 마스크 (노래 행 중심) + 좌/우 rail 경계선 전부 제거 + SPACE 토큰 도입 + + 버튼 = 내 빌딩 플레이리스트 자동 핀.

---

## 한 줄 요약

3-row 큐 스택을 폐기하고 **Apple Music macOS 단일 행 플레이어바** (shuffle / prev / PLAY 36px / next / repeat · art + title/artist · ⋯ / + · ×)로 전환. 둥근 모서리 제거 + 위/아래 **수직 linear-gradient mask**의 opaque 코어를 **노래 행 vertical center (≈ 37%)**에 정렬. 좌/우 rail에서 모든 hairline / inset highlight / box-shadow 제거 → 순수 backdrop-blur만 남김. SPACE 토큰 (`{1,2,3,4,6,8,12}`) 도입으로 `8/10/12/14` 매직 넘버 정규화. **+ 버튼**: 현재 빌딩에 트랙 자동 `pinTrack` (genre 'pop' default, queue url로 previewUrl 채움). 좌측 rail에 **내 플레이리스트** 섹션 신설 (`getMyBuildings()` — taggerId === 현재 user인 빌딩만, latest pin 순). 우측 rail header에 Apple Music macOS 패턴 (Shuffle / Repeat / Clear) 추가. 컴퍼스 제거.

---

## 주요 변경점

| 영역 | 변경 |
|------|-----|
| **NowPlayingBar 재설계** | 3-row 스택 (prev / current / next 동일 크기 + 슬라이드 키프레임) → **단일 행 Apple Music 레이아웃**. 좌측 컨트롤 클러스터 (Shuffle / Skip / **PLAY 36 px** / Skip / Repeat) + 중앙 art+title/artist + ⋯/+ + 우측 ×. 슬라이드 페이드 애니메이션은 중앙 음악 블록에만 적용 |
| **그라데이션 마스크 재정렬** | 별도 backdrop 레이어 (`z-index: -1` + `isolation: isolate`)에 `linear-gradient(to bottom, transparent 0%, black 16%, black 58%, transparent 100%)`. opaque 코어 중심을 50% → **37%** (노래 행 vertical center)로 재정렬. content (텍스트·아이콘) 마스크 영향 없음 |
| **둥근 모서리 제거** | 바 + backdrop 레이어 모두 `borderRadius: 0`. 사진 정사각 / 버튼 pill 외엔 squared edges |
| **재생 모드 (shuffle / repeat)** | `PreviewPlayer` state에 `shuffle: bool` + `repeat: 'off'\|'one'\|'all'` 추가. `toggleShuffle()` / `cycleRepeat()` exports. `nextTrack()` + audio `ended` 둘 다 모드 인지 (one → 재시작, shuffle → 랜덤 비-자기, all → wrap). `stopPreview()`는 사용자 토글 보존 |
| **MoreMenu (⋯)** | Apple Music macOS row "..." 메뉴 패턴. Track info → openAppleMusic / Share → 클립보드 / Copy → "Title — Artist". 클릭아웃사이드 + Escape 표준 popover. `aria-haspopup="menu"` + `role="menu"`/`menuitem` |
| **+ 버튼 = 내 플레이리스트 자동 추가** | `App.tsx`에서 `selectedBuildingId` 전달. 클릭 시 `pinTrack(buildingId, track)` (player.meta + queue url로 RecommendedTrack 재구성, genre 'pop' default). `subscribePlaylists()` 구독으로 즉시 active state 반영. 비활성 조건: 빌딩 미선택 / 이미 핀됨 |
| **좌측 rail "내 플레이리스트" 섹션** | `getMyBuildings(): MyBuildingShortcut[]` 신규 (`buildingPlaylist.ts`) — `taggerId === currentUserId` 트랙 1+ 빌딩만, `latestPinnedAt` 정렬. 24px 아트워크 + 빌딩 이름 + 트랙 카운트. 클릭 → camera 줌 + 우측 rail 동기화. 다른 도시는 disabled + tooltip |
| **우측 rail header 액션** | Apple Music macOS 패턴: 좌측 클러스터 (Shuffle / Repeat / **Clear**) + 우측 collapse. Clear → `setQueue([]) + stopPreview()`. shuffle/repeat은 동일 store 공유 (NowPlayingBar와 양방향 동기화) |
| **양쪽 rail 글래스 통일** | 모든 hairline (header borderBottom, settings borderTop, borderRight, borderLeft, inset white-veil shadow, drop shadow) 제거. `boxShadow: 'none'`, `border: 'none'`. 글래스 표면 `rgba(0.55) + blur(20–24 px) saturate(140–160 %)`만 남김. 좌·우 280-280 대칭 |
| **우측 rail 항상 노출 (placeholder)** | `if (!hasQueue && !buildingId) return null` 폐기. 빈 상태에서도 Music 아이콘 + "다음 재생" eyebrow + "빌딩을 클릭하면 큐가 시작됩니다" 노출. 좌·우 균형 유지 |
| **8pt 그리드 토큰** | `tokens.ts`에 `SPACE = {1:4, 2:8, 3:12, 4:16, 6:24, 8:32, 12:48}`. 모든 padding/gap이 매직 넘버 → `SPACE[n]`. 14/13/12 → 14/13 표준화 |
| **타이포 가시성 ↑** | 좌측 rail row 13→14, VIBLOC wordmark 13→14, 섹션 eyebrow 9.5→11, lang chip 11→12, 아이콘 15→16. INK `#1a1a2e → #0e0e1a`, MUTED `#6e6e73 → #5a5a66`로 콘트라스트 강화. NowPlayingBar 내부 title 12→13 / artist 10.5→11 |
| **테마-aware 컬러 (NowPlayingBar)** | 라이트모드: ink `INK`, 베일 white-32, 진행바 dark-78, 재생 버튼 흑색 페그라데이션. 다크: PAPER, 베일 dark-22, 화이트 페그라데이션. 두 모드 모두 WCAG ≥ 4.5:1 |
| **시간 표시 + 진행바** | `0:12 / 0:30` 11pt mono + tabular-nums. 진행바 양쪽에 minWidth 32 (8pt) 라벨 |
| **검색바 inline + eyebrow** | `SearchBar` `embedded` prop. FixedToolSidebar 안에 eyebrow `tools.search` 섹션으로 노출 (다른 섹션과 위계 통일) |
| **PlaylistDetailView 마운트 연결** | `detailTaggerId` state는 dead-end였음 → FixedQueueSidebar children IIFE 최상단 conditional로 `<PlaylistDetailView buildingId taggerId onBack=...>` 마운트. 클릭 시 우측 rail 전체가 그 플레이리스트로 sync |
| **Compass 제거** | 사용자 요청 — import + 마운트 모두 삭제 (컴포넌트 파일은 보존). NowPlayingBar 위치 변경 (`bottom: 36`)으로 인한 부유감 해소 |
| **i18n 확장** | `player.menu.{more,info,share,copy,copied}` / `player.repeat` / `player.add` (= "내 플레이리스트에 추가") / `player.added` / `tools.{search,myPlaylists,notInThisCity}` / `queue.clear` × en/ko/ja |

---

## 디자인 의사결정

### 1. 단일 행 vs 3-row 스택

3-row 스택 (prev / current / next 동일 크기, opacity tier로 구분)은 사용자 명시 요청이었으나 후속 피드백에서 Apple Music macOS 스크린샷이 reference로 들어옴. macOS Music은 단일 행 (shuffle / prev / PLAY / next / repeat + art + title) 패턴을 50px 미만의 컴팩트한 footprint로 유지. 3-row → 단일행 전환:
- **장점**: bar 높이 → 절반, 도시 가시성 ↑
- **트레이드오프**: prev/next 트랙 미리 보기 사라짐
- **보완**: ⋯ 메뉴는 그대로 + repeat:'one' / shuffle 등 새 모드로 prev/next 행동 자체를 풍부화

3-row의 슬라이드 키프레임은 단일 행에서도 살림 (`key={animTick}`로 art+title 블록만 re-mount).

### 2. 그라데이션 mask center 재배치

수직 linear-gradient의 opaque 코어가 50% (바 vertical center)에 있으면 song 행 (vertical center ≈ 37%)이 fade ramp 상단에 걸침. 사용자가 "노래 중앙으로" 명시 → mask stops 28-72% → **16-58%** (center 37%)로 시프트. 진행바는 자연스러운 하단 ramp 위에 얹혀 흐릿하게 사라짐.

수치 근거: 바 padding 12 + row 40 + gap 8 + progress 16 + padding 12 ≈ 92px. song row center = 12 + 20 = 32px → 32/92 ≈ 35–37%.

### 3. 경계선 zero policy

좌/우 rail이 따로 떠다니는 카드가 아닌, 도시 위에 얹힌 **반투명 면**이 되도록 모든 hairline/shadow를 제거. Tesler's Law (visual noise 절감) + 2026 Liquid Glass 트렌드 (Apple HIG 24+) 부합. 글래스 표면 alpha 0.55 + heavy blur로 가독성 충분.

### 4. + 버튼 — 내 빌딩 플레이리스트 자동 핀

Apple Music의 "+"는 라이브러리 추가지만, VIBLOC은 라이브러리 개념이 없고 **빌딩별 플레이리스트**가 핵심 데이터 구조. 따라서 + = 현재 선택된 빌딩에 자동 핀. 빌딩 미선택 = + anchor 없으니 disabled. 이미 핀된 트랙 = `active` 하이라이트로 confirm.

genre 'pop' default 처리는 의도적 — `RecommendedTrack`이 genre를 요구하지만 player.meta는 carry 안 함. genre는 추천 시그널이지 필수값이 아니라 안전한 default가 가능.

### 5. 내 플레이리스트 바로가기 (좌측 rail)

Apple Music macOS 좌측 rail은 사용자 자작 플레이리스트를 카테고리 (All Playlists / Favorite Songs / 개별 이름)로 노출. VIBLOC은 빌딩 = 플레이리스트 anchor이므로 "내가 트랙 박은 빌딩 리스트"가 등가. `getMyBuildings()` — `taggerId === me.id` 트랙 1+ 빌딩만, latestPinnedAt 정렬, 24px 아트 + 이름 + 트랙 카운트. 다른 도시 빌딩은 disabled (OSMBuilding 객체 메모리 부재).

---

## 미해결 / 후속

- **+ 버튼 genre default**: 'pop' fallback이 어디까지 buyable한지 — 추천 시그널 정확도 측정 안 됨
- **다른 도시 내 플레이리스트 클릭**: 현재 disabled. 자동 city switch + 줌 (2-step)으로 진화시키면 더 친절. 그러려면 `OSMBuilding[]`을 city별로 lazy-load → 메모리 vs 친절도 트레이드오프 평가 필요
- **Repeat 'one' 모드 시 이미 끝까지 재생된 경우**: 현재 `audio.ended`에서 같은 트랙 `playPreview` 재호출 → 일부 브라우저에서 deboucing 안 되면 무한 루프 가능성. 30s 프리뷰 환경이라 실측 영향은 미미하지만 가드 필요
- **Compass 영구 제거 vs 재도입**: 카메라 회전/리셋 UX가 사라짐. CanvasTour 가이드는 남았지만 일상 사용에서 "북향 리셋" 인텐트는 어떻게 받지?
- **3-row 스택 슬라이드 애니메이션 의도**: 단일 행으로 통합되며 prev/next 미리보기는 사라짐. ⋯ 메뉴에 "Up next" 미니 보기가 있어도 좋을지 사용자 피드백 필요

---
