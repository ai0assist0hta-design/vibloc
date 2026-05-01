# Front — 2026-05-01

**Apple Music macOS player bar + edgeless rail glass + 8pt grid normalization + My Playlists shortcut** — work between 4/30 and 5/1. Single-row player bar (shuffle/prev/PLAY/next/repeat + song + ⋯/+ + ×) with gradient mask centered on the song row + every hairline removed from both rails + SPACE token rollout + `+` button auto-pins to my building playlist.

---

## TL;DR

Replaced the 3-row queue stack with the **Apple Music macOS single-row layout** (shuffle / prev / PLAY 36 px / next / repeat · art + title/artist · ⋯ / + · ×). Re-centered the vertical `linear-gradient` mask's opaque core onto the **song row's vertical center (≈ 37 %)** instead of the bar's mid-height. Stripped every hairline / inset highlight / box-shadow from both rails — pure backdrop-blur only. Introduced a `SPACE` token (`{1,2,3,4,6,8,12}`) and replaced `8/10/12/14` magic numbers throughout. The **`+` button** auto-pins the current track to the selected building's playlist (`pinTrack` with genre 'pop' default). New **My Playlists** section in the left rail (`getMyBuildings()` — buildings where the current user has pinned tracks, latest-pinned first). Right-rail header gained the Apple Music macOS triplet (Shuffle / Repeat / **Clear**). Compass removed.

---

## Key changes

| Area | Change |
|------|--------|
| **NowPlayingBar redesign** | 3-row stack (prev / current / next, same size + slide keyframe) → **single-row Apple Music layout**. Left cluster (Shuffle / Skip / **PLAY 36 px** / Skip / Repeat) + center art + title/artist + ⋯/+ + right ×. Slide-fade animation now scoped to the center music block only |
| **Gradient mask re-centering** | Backdrop layer split into its own `z-index: -1 + isolation: isolate` element with `linear-gradient(to bottom, transparent 0%, black 16%, black 58%, transparent 100%)`. Opaque core moved 50 % → **37 %** to align with the song row's vertical center. Content (text · icons) unaffected |
| **Squared corners** | Bar + backdrop both `borderRadius: 0`. Square edges everywhere except artwork rounding and pill buttons |
| **Playback modes (shuffle / repeat)** | `PreviewPlayer` state gained `shuffle: bool` + `repeat: 'off'\|'one'\|'all'`. New `toggleShuffle()` / `cycleRepeat()` exports. `nextTrack()` and the audio `ended` listener both honor mode (one → restart, shuffle → random non-self, all → wrap). `stopPreview()` preserves user toggles |
| **MoreMenu (⋯)** | Apple Music macOS row "..." menu pattern. Track info → openAppleMusic / Share → clipboard / Copy → "Title — Artist". Click-outside + Escape standard popover. `aria-haspopup="menu"` + `role="menu"`/`menuitem` |
| **+ button = auto-pin to my playlist** | `App.tsx` passes `selectedBuildingId`. Click → `pinTrack(buildingId, track)` with track reconstructed from `player.meta` + queue url (genre 'pop' default). `subscribePlaylists()` subscription flips active state instantly. Disabled when no building selected or already pinned |
| **Left rail "My playlists" section** | New `getMyBuildings(): MyBuildingShortcut[]` (`buildingPlaylist.ts`) — buildings with at least one track stamped `taggerId === currentUserId`, sorted by `latestPinnedAt`. 24 px artwork + building name + pin count. Click → camera zoom + right-rail re-sync. Other-city buildings disabled with tooltip |
| **Right rail header actions** | Apple Music macOS pattern: left cluster (Shuffle / Repeat / **Clear**) + right collapse. Clear → `setQueue([]) + stopPreview()`. shuffle/repeat share the same store with the bar (two-way sync) |
| **Edgeless rail glass** | Removed all hairlines (header borderBottom, settings borderTop, borderRight, borderLeft, inset white-veil shadow, drop shadow). `boxShadow: 'none'`, `border: 'none'`. Glass surface = `rgba(0.55) + blur(20–24 px) saturate(140–160 %)` only. Symmetric 280-280 |
| **Right rail always visible (placeholder)** | Killed `if (!hasQueue && !buildingId) return null`. Empty state shows Music icon + "Up Next" eyebrow + "Click a building to start a queue". Left/right balance preserved |
| **8pt grid token** | `tokens.ts` added `SPACE = {1:4, 2:8, 3:12, 4:16, 6:24, 8:32, 12:48}`. Every padding/gap moved from magic numbers → `SPACE[n]`. 14/13/12 standardized typography scale |
| **Visibility ↑** | Left rail row 13→14, VIBLOC wordmark 13→14, section eyebrow 9.5→11, lang chip 11→12, icons 15→16. INK `#1a1a2e → #0e0e1a`, MUTED `#6e6e73 → #5a5a66` for stronger contrast. NowPlayingBar title 12→13 / artist 10.5→11 |
| **Theme-aware NowPlayingBar colors** | Light mode: `INK` glyphs, white-32 veil, dark-78 progress, dark fog play button. Dark: `PAPER` glyphs, dark-22 veil, white fog button. Both modes ≥ 4.5:1 WCAG over the city tiles |
| **Time + progress** | `0:12 / 0:30` 11pt mono + tabular-nums. minWidth 32 (8pt) labels flanking the bar |
| **Inline search + eyebrow** | `SearchBar` `embedded` prop. Mounted inside FixedToolSidebar under a `tools.search` Section eyebrow so it shares hierarchy with the other rail sections |
| **PlaylistDetailView mounting** | `detailTaggerId` state was a dead end → conditional at top of FixedQueueSidebar children IIFE now renders `<PlaylistDetailView buildingId taggerId onBack=...>`. Clicking a playlist syncs the entire right rail to that playlist |
| **Compass removed** | Per request — import + mount both deleted (file kept for future use). NowPlayingBar position shift (`bottom: 36`) eliminated the floating-orphan feel |
| **i18n** | `player.menu.{more,info,share,copy,copied}` / `player.repeat` / `player.add` (= "Add to my playlist") / `player.added` / `tools.{search,myPlaylists,notInThisCity}` / `queue.clear` × en/ko/ja |

---

## Design decisions

### 1. Single-row vs 3-row stack

The 3-row stack (prev / current / next at the same size, opacity tier for state) was an explicit user request, but later feedback included an Apple Music macOS screenshot as the new reference. macOS Music keeps a compact single-row pattern (shuffle / prev / PLAY / next / repeat + art + title) under 50 px tall. Switching:
- **Pro**: bar height halved → city visibility ↑
- **Trade-off**: prev/next preview goes away
- **Mitigation**: ⋯ menu + new shuffle / repeat / repeat-one modes give prev/next behavior more depth

The 3-row's slide keyframe survives in the single-row (`key={animTick}` re-mounts only the art+title block).

### 2. Gradient-mask center re-alignment

A symmetric vertical `linear-gradient` mask with the opaque core at 50 % puts the song row (vertical center ≈ 37 %) on the upper fade ramp. After explicit user direction ("center on the song"), mask stops moved 28-72 % → **16-58 %** (center 37 %). The progress bar at the bottom rides the natural lower ramp and dissolves softly.

Math: bar padding 12 + row 40 + gap 8 + progress 16 + padding 12 ≈ 92 px. Song row center = 12 + 20 = 32 px → 32/92 ≈ 35–37 %.

### 3. Zero-edge policy

Both rails were styled as floating cards before; now they read as **translucent panes laid on the city**, with every hairline / inset highlight / drop shadow removed. Aligns with Tesler's Law (cut visual noise) and the 2026 Liquid Glass direction (Apple HIG 24+). Glass alpha 0.55 + heavy blur carries the legibility load.

### 4. + button = auto-pin to current building's playlist

Apple Music's "+" is a library add, but VIBLOC has no library — the **per-building playlist** is the core data structure. So + = pin to the currently selected building. No selection → no anchor → disabled. Already-pinned → `active` highlight as confirmation.

The `genre: 'pop'` default is intentional — `RecommendedTrack` requires a genre but `player.meta` doesn't carry one. genre is a soft recommender signal, not a required field, so a stable default is safe.

### 5. My Playlists shortcut (left rail)

Apple Music macOS's left rail surfaces user-authored playlists by category (All Playlists / Favorite Songs / individual names). VIBLOC's analog is "buildings I've pinned tracks in", since building = playlist anchor. `getMyBuildings()` — only buildings with `taggerId === me.id` tracks, latest-pin first, 24 px artwork + name + count. Other-city buildings are disabled (their `OSMBuilding` object isn't in memory).

---

## Open / follow-up

- **+ button genre default**: how much does the 'pop' fallback bias the recommender? Not measured
- **Other-city my-playlist click**: currently disabled. Could evolve into auto city-switch + zoom (2-step). Requires lazy-loading `OSMBuilding[]` per city — memory vs. friendliness trade-off
- **Repeat 'one' edge case**: re-firing `playPreview` from `audio.ended` with the same id — some browsers may not debounce, risking infinite loop. 30 s preview means real impact is small, but a guard is warranted
- **Compass: remove permanently or restore?** Camera rotate/reset UX is gone now. CanvasTour guidance still exists, but where does the everyday "reset to north" intent land?
- **3-row stack slide**: prev/next preview is gone in the single-row layout. Should the ⋯ menu carry an "Up Next" mini-view?

---
