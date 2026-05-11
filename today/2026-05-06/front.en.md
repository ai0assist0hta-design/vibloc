# Front — 2026-05-06

**Design system unification + reactive rails + landing cinematic intro + production prep** — work between 5/5 and 5/6. Realigned the entire right rail onto a single design-token system (COLOR / FONT / SPACE), made NowPlayingBar auto-center + camera frustum pan in response to live rail-width changes, added a Manhattan cinematic hero intro + light city backdrop, removed virtual persona seed data from production builds, and shipped an English README + env-var docs.

---

## TL;DR

Single `COLOR.*` palette + a 2-tier font ladder (16 title / 12 body, all multiples of 4) + a 4-multiple box grid normalize the entire right rail. CSS custom properties `--vbk-left-rail-w` / `--vbk-right-rail-w` broadcast rail widths live → NowPlayingBar auto-centers via `calc(leftRail + (vw - rails) / 2)`. The 3D canvas stays pinned to the viewport at full size, and `camera.setViewOffset(dx, 0)` pans only the projection matrix so buildings stay aligned with the bar's center (no exposed black/white edges). Dragging a rail wider fades the surface alpha `0.40 → 0.02` (blur-only). The Up Next list expands as an `position: absolute` overlay so body layout never shifts. Curator `@alias` search surfaces in a dedicated `Playlists` section above track results → click opens PlaylistDetailView. The landing hero plunges from 7000 px stratosphere to a 35° cinematic angle in 2.4 s with 0.45 rad yaw, blur + scrim fade-in, content stagger, and a bottom ⌄⌄ scroll cue. STATS + CITIES sit over a shared light-mode Manhattan canvas with a 5-stop white gradient; FEATURES uses a music-panel backdrop (stylized track-row mockups drift down both edges). 240-px centered hairlines unify every section break. Production builds gate the virtual personas (Mei / Rio / Jiro / Jaehyun / Noa) seed + iTunes artwork enricher behind `import.meta.env.DEV`, so they're tree-shaken out. Auto-select-on-mount removed → clean canvas on Explore Map. Fixed 5 TypeScript errors + wrote an English README + expanded `.env.example`.

---

## Major changes

| Area | Change |
|---|---|
| **Single color palette** | `lib/ui/tokens.ts` consolidates every color into one `COLOR.*` object. ink/paper, hover/accent/tint, shadows, dark-theme paired tokens, brand accents (appleRed, heartRed, liveGreen), 3-color medal palette. Inline `rgba()`/`#hex` is now a code smell. Legacy tokens (`INK`, `MUTED`, `DIVIDER`…) preserved as `@deprecated` aliases |
| **2-tier font ladder** | Hero 16 / 600, Row title 16 (later compressed to 12 per user request) / 500-600, Body 12 / 400-500, Eyebrow 12 / 600-700 with uppercase tracking. Everything 4-multiple. Hierarchy comes from weight + uppercase + letter-spacing instead of size |
| **4-multiple box grid** | Every padding/margin/gap/width/height/borderRadius snaps to 4·8·12·16·24·32. Off-grid `5/6/10/14/22` values swept out. fontSize handled separately because it conflicts with Apple HIG ladder |
| **HEART_RED policy** | The only chromatic accent allowed in the monochrome system (filled-heart liked, heart count meta). Play pill changed from red → neutral ink, curator avatar removed |
| **Symmetric 12-px rail gutter** | body padding 12 + row padding 12 → content edges at panel-x=24 and panel-right−24. Left + right rails mirror each other |
| **HIG touch targets** | All trailing buttons bumped 28→32, cluster gap 2→4. Plus / Check / Ellipsis / Heart icon all in 32-wide center slots, counts in 32-wide center slots |
| **Up Next telescoping panel** | When expanded, queue list floats as `position: absolute, bottom: 100%` overlay so body layout stays fixed. Toggle row never moves. Backdrop blur + 180 ms fade-in |
| **NowPlayingEQ indicator** | 3-bar pure-CSS animation (180 ms stagger, `prefers-reduced-motion` aware). PopularRow / TrackRow artwork overlay shows EQ when `isCurrent && !hover`, Pause glyph on hover |
| **Reactive CSS variables** | FixedToolSidebar / FixedQueueSidebar use `useEffect` to write `:root` style props `--vbk-left-rail-w` / `--vbk-right-rail-w` (covers resize, expand, collapse — collapsed tab handle reports its 28 px) |
| **NowPlayingBar auto-center** | `left: calc(leftRail + (vw - rails) / 2)`, `width: max(320, min(720, vw - rails - 32))`. Pure CSS calc so no JS rerender on rail drag |
| **Camera frustum panning** | New `CameraViewOffsetSync` useFrame component reads CSS vars each frame and calls `camera.setViewOffset(canvasW, canvasH, dx, 0, canvasW, canvasH)`. Only the projection matrix shifts — canvas stays viewport-pinned, no exposed body edges. 80 ms exponential smoothing |
| **Rail transparency fade** | As width grows 280→560, surface alpha fades `0.40 → 0.02`. 24-px backdrop blur stays constant |
| **Toast system** | `lib/ui/toast.ts` pub/sub + `ToastHost` bottom-center HUD. Quiet status copy ("Already in your playlist."). Dedup — pushing the same message back-to-back resets the timer instead of stacking |
| **Curator search** | AddTrackComposer takes a `useTopTaggers` snapshot and substring-matches `@alias` / curator name / playlist name. Hits surface above track results in a dedicated `Playlists` section with PlaylistMatchRow (36-px PlaylistCover + headline + `@alias · N songs`) → click opens PlaylistDetailView |
| **PlaylistDetailView refresh** | Color policy aligned (Play pill red → neutral), curator avatar removed, only `@alias` shown as caption. Name limit 60 → 30, character counter UI removed (`maxLength` enforces). Trailing `OPEN`/`EDIT` label stripped. Uses only SECTION_HEADER + ROW_CAPTION + SPACE tokens |
| **Heart trailing alignment** | RankRow heart cluster rebuilt with the same `[Ellipsis 32] gap 4 [Plus 32]` geometry as PopularRow. Heart ♥ now centers on the ⋯ column, count centers on the +/✓ column |
| **240-px hairline divider** | Every section break uses one rule: a centered `width: 240, height: 1, margin: 0 auto, background: divider` line instead of full-width borderTop |
| **Landing hero intro** | `IntroCameraAnimation` lerps the camera from `(0, 7000, 500)` → `(0, 600, 1000)` + 0.45 rad yaw, ease-out cubic over 2.4 s. Blur 0→14 px (1300 ms delay), scrim 0→0.55 (1200 ms delay), content stagger (1700–2300 ms in 4 steps). `prefers-reduced-motion` aware |
| **Bottom scroll cue** | Stacked chevron-down `⌄⌄` + `LEARN MORE` label, non-interactive bounce loop (1800 ms) |
| **Shared light city backdrop** | STATS + CITIES wrapped in a single `position: relative` parent with `<PlateauScene area="manhattan" darkMode={false}>` + a 5-stop white gradient + 2-px backdrop blur. `staticCameraView={ position: [0, 1600, 1300] }` mid-altitude bird's-eye reveals individual buildings |
| **FEATURES music-panel backdrop** | New `FeaturesMusicBackdrop` component — stylized track rows (album tile 36×36 + 2-line skeleton bars) drift down both edges, 7 rows per side, 7-color hue rotation, vertical mask gradient, opacity 0.55 |
| **Render quality boost** | Canvas `dpr={[1, 3]}` (full retina sampling), `powerPreference: 'high-performance'`, `logarithmicDepthBuffer: true` (curtails z-fighting at far=20000) |
| **Production mode (no virtual personas)** | `seedBuildingPlaylists` + `enrichSeedArtworkInBackground` calls now early-return on `if (!import.meta.env.DEV)`. Tree-shaking pulls them out of the prod bundle entirely. Auto-select-on-mount (`getPlayerStateSnapshot().currentBuildingId`) also removed → Explore Map lands on a clean canvas |
| **i18n additions** | `track.toast.alreadyAdded` (KR/EN/JA), `music.searchPlaceholder` ("Song, artist, or @user"), `music.playlists` / `music.songs` / `music.noResults`, `panel.tenants` (`Tenants` → `Building info`) |
| **Build / deployment prep** | Fixed 5 TS errors (uniform typing, missing `primaryGenreName`, `Uint8Array<ArrayBuffer>`, missing `useT` scope, duplicate decl). `npm run build` succeeds in 380 ms, 580 KB gzip total |
| **Repo cleanup** | New English-primary README (Korean summary at the bottom), expanded `.env.example` (Supabase / Google OAuth / API URL / Maps Embed all documented), private docs (`CLAUDE.md`, `docs/business/`, `today/`, KR dev notes, `bun.lock`) untracked + ignored, 3 orphan components (`Compass.tsx`, `CityVibeBlock.tsx`, `AppleMusicIcon.tsx`) deleted, stray `console.log` DEV-gated |

---

## Design rationale

### 1. One palette, one source of truth — why `COLOR.*` as a single object?

The codebase had drifted to 30+ inline `rgba(14,14,26,0.05)`, `rgba(14,14,26,0.07)`, `rgba(0,0,0,0.025)` literals — close-but-not-identical alphas with no way to tell whether the differences were intentional (hover vs accent vs tint) or just typos. Naming them — `COLOR.hover = 0.05`, `COLOR.accent = 0.07`, `COLOR.tint = 0.025` — assigns explicit meaning AND makes the dark-theme pairs (`hoverDark`, `accentDark`, `dividerDark`…) live next to their light-theme counterparts so missing pairs become obvious at the source.

### 2. Two font sizes — why flatten to `12 / 16`?

Started at a 6-tier ladder (`17 / 14 / 13 / 12 / 11 / 10`), got "make the big text smaller" feedback, compressed to a 3-tier (`20 / 16 / 12`), then flattened further to a 2-tier (`16 / 12`) on iteration. Hierarchy comes from `weight` (400 / 500 / 600 / 700) + `letter-spacing` + `uppercase`. Apple Music macOS effectively does the same — row titles around 13, captions around 11, two sizes. The 4-multiple grid (12, 16, 20, 24…) drops out for free.

### 3. CSS-variable reactivity — why no prop drilling?

NowPlayingBar needs both rail widths but neither is a parent. Putting them in zustand would work, but **CSS calc is already reactive**: writing `:root.style.setProperty('--vbk-left-rail-w', '${w}px')` once propagates instantly to every consumer with zero React rerenders. `transition: left 160ms` still works on the consumer. R3F's `CameraViewOffsetSync` reads via `getComputedStyle` per frame — cheap because CSS-var reads are O(1). One pattern reused across NowPlayingBar position, floating panel widths, and the 3D camera offset.

### 4. `setViewOffset` vs canvas transform

First attempt: `transform: translateX((leftRailW - rightRailW) / 2)` on the canvas wrapper. Bug: with canvas at full viewport, the transform exposed body background on one edge. Switched to `camera.setViewOffset(canvasW, canvasH, dx, 0, canvasW, canvasH)` — only the projection matrix shifts, the canvas itself stays pinned. `BuildingScreenAnchor` projection automatically reflects the new frustum, so floating panels track buildings perfectly. OrbitControls / shadow follower / fog all unaffected.

### 5. Production mode — `import.meta.env.DEV` gate on virtual personas

`seedAgents.ts` ships ~240 demo entries (6 cities × ~8 curators × 5 tracks) into localStorage on every mount. Great for design review, confusing for actual users — they see playlists they didn't make. The fix: `if (!import.meta.env.DEV) return` before the dynamic `import('./features/dev/seedAgents')`. Vite tree-shakes the entire seed module out of the production bundle. Same gate on `enrichSeedArtwork`.

---

## Next steps

- **PR** — merge `feat/left-info-panel` → `main` (Yunseop review)
- **Vercel deploy** — import `viblo-project/VIBLOC` or `ai0assist0hta-design/vibloc`, set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` env vars
- **Supabase URL config** — register the deployed origin in Site URL + Redirect URLs
- **Monorepo main merge** — when syncing into `main` of the shared repo (which uses `VIBLOC-frontend/` + `VIBLOC-backend/` monorepo layout), move the frontend work into the `VIBLOC-frontend/` folder
- **Bundle size** — `vendor-three` is 318 KB gzip, the biggest chunk. Consider dynamic-import route-splitting
- **Lint cleanup** — 116 pre-existing warnings (`react-hooks/set-state-in-effect` etc.) to chip away at
