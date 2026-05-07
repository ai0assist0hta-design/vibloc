# Front — 2026-04-20

**HEADZ 아바타 풀 통합** — 4/19 시작한 ThreeDee HEADZ 통합을 마무리. 옥상 3D 얼굴 + 마이페이지 부분별(per-part) PNG 커마이저까지.

---

## 한 줄 요약

빌딩 옥상에 떠있는 **3D HEADZ 얼굴** + 마이페이지에서 **메모지처럼 헤어/안경/모자/귀고리/수염/콧수염을 따로 골라 조합**하는 PNG 레이어드 커마이저 출시. Blender headless 베이크 파이프라인 자동화. 모든 캐릭터 헤드 사이즈 정규화(256×280).

---

## 주요 변경점

| 영역 | 변경 |
|------|-----|
| **HEADZ 라이센스 가드** | `docs/legal/headz-license.md`, `.gitignore`에 GLB/per-char PNG layers 차단. 각 dev이 `scripts/headz/setup.sh`로 로컬 베이크. 무료 비상업 portfolio 한정 |
| **GLB 익스포터** (`scripts/headz/export-head.py`) | 아마추어 이름→`char_prefix` 자동 검출, utility 메쉬 화이트리스트, `bisect_plane(z=1.30)`으로 목 위만 슬라이스, pose 적용 + `frame_set(72)` + `export_apply=True` 베이크. Draco level 6 압축 |
| **부분별 PNG 베이크 파이프라인** | `bake_layers_v2.sh` + `render_full.py` — Cycles + 전면 카메라 + RGBA 512×512. **핵심 발견**: HEADZ는 `Geo_*.hide_render`/`hide_viewport`에 **드라이버**가 걸려 있어서 Python으로 False 세팅해도 즉시 덮어씀. → 렌더 직전 visibility 드라이버 전부 제거. 머리/몸은 `visible_camera=True`로 둬서 GN 의존성 유지 |
| **레이어 정규화** (`normalize_layers.py`) | 베이크 raw → 256×280 uniform 캔버스. 헤드 영역 자동 검출(첫 번째 all-transparent row까지), Lanczos 리샘플로 캐릭터 간 머리 크기 균일화. 4 chars × ~16 layers = 3.8MB |
| **Diff 레이어 추출** | base.png 대비 픽셀 diff(threshold=8)로 variant-only alpha 추출 → `<img>` 스택만으로 합성 가능 |
| **`avatarConfig.ts`** | `LAYER_AVAILABILITY` 테이블 (캐릭터별 가용 variant), `avatarLayerUrl(base, layer, index)`, 부분별 deterministic 랜덤 롤. Brown→Black GLB remap 유지 |
| **`LayeredAvatar.tsx`** | z-stack: `base → beard → mustache → hair → earrings → glasses → hat`. 절대 위치 `<img>` 7장. Canvas/WebGL 0 |
| **`AvatarHeadshot.tsx`** | 기존 단일 PNG → `LayeredAvatar` 기반으로 교체. 마이페이지/태거카드 모두 합성 결과 반영 |
| **`AvatarEditor.tsx`** | 메모지 스타일 모달. 라이브 합성 프리뷰(200×200) + 6 sections: 기본 캐릭터 / 헤어스타일 / 안경 / 모자 / 귀고리 / 수염 / 콧수염. 각 섹션마다 "없음" 타일 + variant 썸네일. 캐릭터 변경 시 가용하지 않은 variant 자동 정리 |
| **`RooftopAvatar.tsx`** (4/19) | Suspense + footprint 기반 사이징 (5~50m), `AVATAR_LAYER=2`로 빌딩 광원 격리, 5-light Memoji 스튜디오 rig, `<Billboard lockX lockZ>`로 Y축만 회전 |
| **`AvatarMesh.tsx`** | `useGLTF + scene.clone()`, isPartVisible 테이블, sclera+iris 머티리얼 강제 `opacity=1`(transparent shader 노드 무시), 메모리 누수 방지 dispose |

---

## 핵심 패턴

**1. visibility 드라이버 제거 (베이크 핵심)**
```python
def kill_visibility_drivers(o):
    ad = o.animation_data
    if not ad: return 0
    for d in list(ad.drivers or []):
        dp = d.data_path
        if dp in ('hide_viewport','hide_render') or \
           dp.endswith('.show_viewport') or dp.endswith('.show_render'):
            ad.drivers.remove(d)  # 이걸 안 하면 hide_render=False가 즉시 True로 복원됨
```

**2. Diff 기반 알파 레이어 추출**
- base.png 렌더 (헤드만, no variant)
- variant.png 렌더 (헤드 + Hair.001)
- 픽셀 단위 diff > THRESHOLD → variant-only RGBA 보존, 나머지 transparent
- 결과: 웹에서 그냥 `<img>` 쌓으면 합성 완료 (Canvas API 불필요)

**3. 헤드 영역 자동 검출**
```python
# 알파 위에서부터 첫 번째 all-zero 가로줄까지 = 머리
for i in range(8, len(widths)):
    if widths[i] == 0:
        head_end_y = y0 + i; break
# 남성은 발/몸 픽셀이 떠있어도 무시 (헤드 region만 정확히 잡힘)
```

**4. Per-part deterministic 롤** (`rollAvatarForId`)
- FNV-1a hash + salt(11..34)로 같은 userId → 같은 룩 영구. 부위별 가용 가중치(헤어 100%, 안경 30%, 모자 18%, 귀고리 35%, 수염 40%, 콧수염 25%)

**5. 레이어 z-order 의도**
- beard/mustache는 머리 BEHIND로 둬서 fringe가 위에 덮음
- earrings는 hair 다음 (hair가 귀를 일부 가릴 수 있음)
- glasses는 hair WITHIN면 잘못 보일 수 있지만 hair PNG가 얼굴 영역 제외하므로 안전

---

## 안 건드린 것

- 빌딩 selection / 카메라 / panel 4/18 그대로
- 음악 데이터 모델, MyPlaylist 트랙 리스트
- 백엔드 (오늘도 0줄)

---

## 현태용 — 쉬운 말로만

- 빌딩 클릭하면 옥상에 **3D 얼굴**이 떠 있고, 빌딩 크기에 맞춰 자동으로 커지고 작아짐. 카메라 따라 얼굴이 나를 봄.
- 마이페이지에서 **🎭 프로필 편집** 누르면 메모지처럼 캐릭터/헤어/안경/모자/귀고리/수염을 **따로따로** 고를 수 있음. 미리보기가 실시간으로 합쳐짐.
- 6명 캐릭터 × 헤어 10종 × 안경 4종(없음 포함) × 모자/귀고리/수염 ON/OFF = 수천 개 조합 가능.
- 저장한 룩이 마이페이지/태거카드/3D 옥상 얼굴까지 **전부 동기화**됨.
- HEADZ 자체 PNG 파일은 **저작권 보호**로 깃에 안 올라감. 새 dev은 자기 HEADZ 구매분으로 `scripts/headz/setup.sh` 한 번 돌리면 됨.

---

## 윤섭한 — 기술 디테일

### 변경/추가 파일
- **`docs/legal/headz-license.md`** (신규) — Sam 이메일 확인 + 7가지 가드레일
- **`docs/headz-blend-analysis.md`** (신규) — .blend 6개 audit (4 unique chars, 26 pose actions, mesh inventory)
- **`scripts/headz/`** (신규) — `setup.sh` (4 chars 베이크 + sips 썸네일), `export-head.py` (GLB 익스포트), `audit-blend.py` (분석)
- **`src/features/avatar/`** (신규 디렉토리)
  - `avatarConfig.ts` — 6 bases, PoseId, LAYER_AVAILABILITY, URL helpers, FNV roll
  - `useUserAvatar.ts` — localStorage `vibloc.avatar.<userId>`, subscribe + storage event
  - `AvatarMesh.tsx` — GLB → R3F primitive, AVATAR_LAYER 격리, 머티리얼 swap
  - `LayeredAvatar.tsx` — 7장 PNG z-stack 합성 (no Canvas)
  - `AvatarHeadshot.tsx` — 원형 cropping + LayeredAvatar
  - `AvatarEditor.tsx` — 메모지 스타일 풀스크린 모달
  - `HeadzThumb.tsx` — 경량 2D 썸네일
- **`src/components/canvas/RooftopAvatar.tsx`** (신규) — 옥상 3D 마운트
- **`src/pages/mypage/MyPage.tsx`** — `AvatarHeadshot` + `🎭 프로필 편집` pill + `<AvatarEditor>` 모달
- **`src/components/ui/music/TopTaggerCard.tsx`** — dicebear 제거, `LayeredAvatar` 반영
- **`src/main.tsx`** — `preloadAvatarBases()` (PNG fetch warm)
- **`.gitignore`** — `public/avatars/layers/*/*.png` 추가 (라이센스), `.vite/` 추가

### 베이크 파이프라인 (로컬에서만, 깃 외부)
- `/tmp/headz-work/render_full.py` — Cycles 베이커 (드라이버 제거 + visibility hack)
- `/tmp/headz-work/bake_layers_v2.sh` — 4 chars × ~16 layers 자동
- `/tmp/headz-work/normalize_layers.py` — 헤드 검출 + 256×280 정규화 + diff 추출

### 보안 (CSP-safe)
- 모든 신규 자산이 `public/`에 정적 (외부 URL 0)
- 사용자 입력 → URL 미반영 (`avatarLayerUrl`은 enum 값만)
- HEADZ 라이센스 자산은 `.gitignore`로 푸시 차단 (실수 커밋 방지)
- localStorage 외 third-party 트래커 0

---

## 현태가 클로드 코드한테 붙여 넣을 말 (예시)

- 「아바타 부위별 커마는 **`src/features/avatar/AvatarEditor.tsx`** 의 Section 컴포넌트. 새 부위 추가하려면 (1) `LAYER_AVAILABILITY`에 enum 추가 (2) `LayeredAvatar.tsx`의 STACK 배열에 z-order 위치 (3) AvatarEditor에 새 Section 블록.」
- 「PNG 레이어 베이크는 로컬에서만. **`/tmp/headz-work/bake_layers_v2.sh`** 한 번 돌리고 **`normalize_layers.py`** 로 정규화. 결과를 `public/avatars/layers/<base>/`에 복사. 깃 안 올라감 (라이센스).」
- 「HEADZ는 `hide_render`에 **드라이버**가 걸려있어서 Python으로 False 세팅 무용. 베이크 시 `kill_visibility_drivers()` 필수.」
- 「3D 얼굴 사이즈/위치는 **`RooftopAvatar.tsx`**의 `HEAD_NECK_Y=1.30 / HEAD_CROWN_Y=1.62 / HEAD_CENTER_Y≈1.46` 상수.」
- 「아바타 룩 저장은 `useUserAvatar(userId).saveAvatar(cfg)`. localStorage `vibloc.avatar.<userId>`. 다른 탭 storage event 자동 sync.」

---

## 다음에 할 만한 것

- 색 슬라이더 (skinHsl/hairHsl) — 현재 타입엔 있는데 UI 미노출
- 옥상 3D 아바타도 Layered PNG로 통일할지 결정 (현재는 GLB) — 모바일 GPU 부담 감안
- 베이크 시 다른 pose 추가 (현재 pose 7만) — 표정 다양화
- 친구가 만든 룩 공유 링크 (URL에 cfg 직렬화)

---

## 백엔드 쪽

오늘도 백엔드 0줄. `today/2026-04-20/backend.md` 미작성.
