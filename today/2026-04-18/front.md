# Front — 2026-04-18

**오늘 변경분 정리는 전부 현태 쪽에서 한 거.** 윤섭이 4/11에 깔아둔 today 컨벤션 그대로 따라감.

---

## 현태한테 전달 사항 (= 윤섭한테 보고용)

### 한 줄 요약
어제(4/16) "빌딩 옆 부유 패널" 첫 버전을 깐 후, 오늘은 그걸 **카메라 회전·줌·다른 빌딩 클릭 어떤 시나리오에서도 깨지지 않게** 다듬는 데 집중. **버벅임 제로(rAF + ref) / 줌 비례 축소·페이드 / 진정한 edgeless 블러(progressive blur 3-layer)** 가 핵심.

### 주요 변경점

| 영역 | 변경 |
|------|-----|
| **빌딩 화면 투영** | `BuildingScreenProjector`가 footprint 모든 정점을 지면+꼭대기 양쪽으로 투영해 **진짜 silhouette bbox** 계산 → 모든 카메라 각도에서 panel-to-building 갭이 일정 |
| **패널 위치 zero-render화** | `bldgAnchor` state → `bldgAnchorRef` 로 변경. 매 프레임 setState 0회 → React 리렌더 0회 → 카메라 회전 시 버벅임 사라짐 |
| **5단 폴백 배치** | LEFT → RIGHT(음악 패널 충돌 검사) → ABOVE → BELOW → 좌상단 safe-corner. 낮고 넓은 빌딩이 음악 패널을 절대 침범 안 함 |
| **줌 비례 패널 스케일** | `bbMax = max(bbW, bbH)` 기반 (마천루 슬림 타워도 풀 사이즈로 시작). 데드존 0.65 + smoothstep + MIN_SCALE 0.28까지 점진 축소. transform-origin: top-right로 빌딩 쪽으로 수축 |
| **줌 아웃 fog** | scale 비례로 opacity 1.0→0.35, saturate 1.0→0.55, blur 0→1.6px. fogT > 0일 때만 적용 (halo와 충돌 회피) |
| **5+ tenant lift** | 입점 정보 5개 이상이면 패널 Y가 `min(180, (n-4)*28)px` 위로 이동 → 긴 리스트가 화면 밖으로 안 잘림 |
| **다른 빌딩 선택 잠금** | `selectedBuildingRef` 사용 (closure stale 방지) → 한 빌딩 선택 후 다른 빌딩 클릭 무시. 우클릭으로만 해제 |
| **같은 빌딩 재클릭 no-op** | 마우스 좌클릭으로 회전 중 stray click이 fly-to를 재발화시켜 카메라가 제자리로 휙 가던 버그 픽스 |
| **마우스 우클릭 deselect** | 컨텍스트 메뉴 차단 + selectedBuilding=null. 다른 상태(카메라/도시/언어 등) 모두 보존 |
| **카메라 fit 완화** | padding 1.9→2.3, 최소 거리 140→180m로 살짝 넓게 |
| **마천루 ghost ring 확장** | 선택 빌딩 height ≥ 80m → 반경 120→200m, 추가 height gate (0.85배 이상 이웃만 fade). 작은 주변 건물은 그대로 보임 |
| **Maps 버튼 통합** | Google/Apple/지역 옵션을 단일 "Maps" 토글로 합침. 클릭 시 옆으로 fan-out (cubic-bezier 280ms + 35ms 스태거). 색깔 통일, "Maps" 단어만 |
| **AddTrackComposer 정리** | "TAG A TRACK" 라벨 + mood 칩 6개 제거 → 검색 박스만 남음 |
| **MY PLAYLIST 정리** | 태거 카드(아바타/이름/❤️) 제거 → 트랙 한 줄만 |
| **왼쪽 패널 폰트 ↑** | 약 30% 일괄 상향, 패널 너비 280→320px |
| **Open Street View 로딩** | shimmer 스켈레톤 + 펄싱 도트 3개 + 페이드인 전환 (로드 대기 동안 비어있던 박스 채움) |
| **Edgeless progressive blur** | 단일 backdrop-filter 단일 마스크 → **3-layer nested progressive blur** 로 교체. 컬러 0%, 어떤 배경(다크 윈도우 격자/라이트 흰 빌딩) 위에서도 윤곽선 안 보임 |

### 안 건드린 것
- 인증/라우터/MyPage/seedAgents 등 4/16 구조 그대로
- 백엔드, MySQL, today 컨벤션
- 음악 데이터 모델 (`buildingPlaylist.ts`) 그대로

---

## 현태용 — 쉬운 말로만

- **클릭하면 그 건물 옆에 정보가 떠오름.** 카메라 돌려도 건물 따라 부드럽게 움직임. 줌 인/아웃하면 건물이랑 같이 패널도 커지고 작아짐 + 살짝 흐려짐 (멀어지는 느낌).
- **한 번 누르면 다른 건물 못 누름.** 그래서 정보 보면서 카메라 돌려도 옆 건물에 잘못 클릭해서 화면 휙 바뀌는 일 없음. **마우스 우클릭** 하면 풀림.
- **마천루 클릭하면** 주변에 비슷하게 큰 다른 마천루는 흐려지고, 작은 건물은 그대로 보임. 도시 컨텍스트 안 잃음.
- **패널 디자인이 사각형으로 안 보임.** 뒤에 도시가 부드럽게 흐려져서 텍스트만 떠 있는 느낌. 다크모드든 라이트모드든 똑같이 깔끔.
- **OPEN STREET VIEW 누르면** 로딩 동안 점 3개가 통통 튀고 빛이 흐르는 애니메이션이 뜸 (몇 초 기다리는 동안 화면이 안 비어있음).
- **Maps 버튼 하나만** 보여서 누르면 Google·Apple·네이버·카카오 등이 옆으로 펴짐.
- 입점 정보 많은 건물(5개 이상)은 패널이 자동으로 더 위로 올라가서 다 보임.

---

## 윤섭한 내용 (프론트 · 기술 디테일)

### 변경 파일
- **`VIBLOC-frontend/src/App.tsx`** (대부분의 작업) — bldgAnchorRef + rAF 통합 루프 + 5단 폴백 + 줌 비례 scale·fog + 5+ tenant lift + 선택 lock(ref-based) + 우클릭 deselect + Maps 토글 컴포넌트 + 폰트 사이즈 일괄 상향 + progressive blur 3-layer halo
- **`VIBLOC-frontend/src/components/canvas/PlateauScene.tsx`** — `BuildingScreenProjector` 가 footprint 전체 vertex를 지면+꼭대기로 투영해 진짜 bbox 산출. CameraNavigator fit padding 완화 (1.9→2.3, min 140→180m)
- **`VIBLOC-frontend/src/components/canvas/OSMCity.tsx`** — `aBuildingHeight` per-vertex attribute 추가. opaque + ghost 셰이더 양쪽에 `uSelectedHeight`, `uHeightFilterMin` uniform 추가, 마천루 모드에서 height gate 적용
- **`VIBLOC-frontend/src/components/ui/StreetViewBox.tsx`** — 로딩 상태에 shimmer + 펄싱 도트 3개 + 라벨 + fade-in 전환 추가
- **`VIBLOC-frontend/src/components/ui/music/AddTrackComposer.tsx`** (4/16 일부 변경 후 오늘은 미수정)
- **`VIBLOC-frontend/src/components/ui/music/BuildingPlaylist.tsx`** — MY PLAYLIST에서 태거 카드 제거, `resolveAvatarUrl` import 정리
- **`VIBLOC-frontend/src/index.css`** — `@keyframes vibloc-shimmer / vibloc-pulse-dot / vibloc-fade-in` 추가

### 핵심 패턴

**1. Zero-render 패널 추적**
```ts
const bldgAnchorRef = useRef<BuildingScreenAnchor | null>(null);
const onSelectedAnchor = useCallback((a) => { bldgAnchorRef.current = a; }, []);
// rAF loop reads ref → computes target → lerps current → writes el.style directly
// React state 0회, 부드러운 110ms half-life exponential smoother
```

**2. 5단 폴백 배치**
- LEFT (안전) → RIGHT (음악 패널 collision check: `vw - 440 - gap`) → ABOVE (저층 와이드 빌딩 케이스) → BELOW → 좌상단 safe corner
- 모든 placement에서 vw/vh 클램프

**3. 줌 비례 sizing**
```ts
const bbMax = Math.max(bbW, bbH);          // 슬림 타워도 OK
const ratio = clamp(bbMax / 700, 0, 1);
const scale = ratio >= 0.65 ? 1.0 : MIN_SCALE + (1-MIN_SCALE) * smoothstep(ratio/0.65);
const gapX = 180 * scale;
const gapY = 96 * scale;
// fogT, opacity, saturate, blur 모두 scale 기반
```

**4. Selection lock — ref 기반**
```ts
const selectedBuildingRef = useRef<OSMBuilding|null>(null);
useEffect(() => { selectedBuildingRef.current = selectedBuilding; }, [selectedBuilding]);
const handleBuildingSelect = useCallback((b) => {
  const prev = selectedBuildingRef.current;
  if (b !== null && prev) return;  // 같은/다른 빌딩 모두 차단
  // ...
}, [area, handleNavigate]);  // selectedBuilding을 deps에서 뺌 → 클로저 stale 방지
```

**5. Skyscraper ghost ring**
- 셰이더에 `aBuildingHeight` attribute + `uHeightFilterMin` uniform
- ghost 마스크 = `(1 - inFocus) * inRing * heightGate * focusActive`
- JS에서 selected.height ≥ 80m → radius 120→200, filterMin 0→0.85

**6. Edgeless progressive blur (3-layer nested)**
```jsx
<div blur(3px) mask=feather(100)>     // outermost, 가장 약한 블러, 가장 넓은 영역
  <div blur(7px) mask=feather(70)>    // 중간
    <div blur(14px) mask=feather(50)/> // innermost, 가장 강한 블러, 좁은 중앙
  </div>
</div>
// 각 자식의 backdrop = 부모의 blurred 출력 → 블러 강도 합성
// 중앙 ≈ blur(24), 가장자리 ≈ blur(3) → 단일 boundary 0
// background: 없음 (완전 transparent)
// dual linear-gradient + mask-composite: intersect 로 사각형 페더링
```

레퍼런스: kennethnym "Progressive blur in CSS", devslovecoffee "Apple progressive blur on web", Smashing Mag "CSS Blurry Shimmer Effect", Josh Comeau "Next-level frosted glass".

### 성능 노트
- BuildingScreenProjector: 1px 미만 변화 emit 안 함, 카메라 정지 시 0회 setState (이전엔 매 프레임 setState였음)
- 패널 chase: rAF가 DOM ref 직접 mutate, React state 0
- 3-layer blur: GPU 합성에서 처리, 모던 GPU에서 단일 패널이라 영향 미미
- 셰이더에 attribute 1개 (aBuildingHeight) + uniform 2개 추가 → 메모리·연산 미미

### 보안 (CSP-safe 확인)
- 모든 신규 효과 (blur, mask, shimmer 등) 순수 CSS
- 외부 URL/이미지/폰트 0
- 사용자 입력이 style/uniform 문자열에 안 들어감
- contextmenu 핸들러는 selectedBuilding이 있을 때만 preventDefault → 일반 우클릭 동작 보호

---

## 현태가 클로드 코드한테 붙여 넣을 말 (예시)

- 「패널 위치 / 카메라 fit / 빌딩 anchor 관련은 **`VIBLOC-frontend/src/App.tsx`** 의 `bldgAnchorRef` + rAF loop. React state 안 거치고 ref만 mutate해야 버벅임 안 남.」
- 「빌딩 화면 좌표 필요하면 **`VIBLOC-frontend/src/components/canvas/PlateauScene.tsx`** 의 `BuildingScreenProjector`. footprint 모든 vertex 지면+꼭대기 투영해 bbox 산출. `BuildingScreenAnchor = { left, right, top, bottom, x, y, radius, inFront }`.」
- 「패널 폴백 배치 5단계 수정하려면 `computeTarget()` 안의 LEFT/RIGHT/ABOVE/BELOW/safe-corner 블록.」
- 「Edgeless 블러 만들 땐 단일 backdrop-filter 쓰지 말고 **3-layer nested progressive blur + dual linear-gradient mask + mask-composite: intersect**. 단일 마스크는 항상 윤곽 보임.」
- 「선택 lock 풀려면 `selectedBuildingRef` ref-based 패턴. selectedBuilding을 useCallback deps에 넣으면 closure stale로 race condition 발생.」
- 「마천루 transparency 규칙은 셰이더의 `uHeightFilterMin` uniform. 0이면 기존 동작, 0.85면 비슷하거나 더 큰 이웃만 fade.」

---

## 다음에 할 만한 것 (제안)

- 모바일에서 패널 anchor 동작 (현재 desktop only, 모바일은 바텀시트 그대로)
- 줌 아웃 시 panel-to-building 라인 (얇은 점선) 부여 검토 → 패널이 어느 빌딩의 정보인지 명확화
- 진짜 동/구 단위 폴백 (PopularTrackCard) — 빌딩에 district 메타 들어오면 한 줄 추가
- Selection lock UI 표시 (우클릭 안내 토스트 등)
- 다중 빌딩 비교 모드 (lock 풀고 여러 개 동시 선택)

---

## 백엔드 쪽

오늘 작업 백엔드 0줄. `today/2026-04-18/backend.md` 안 만들었음.
