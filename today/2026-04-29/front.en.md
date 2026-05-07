# Front — 2026-04-29 (English)

**100% music match · UI consistency · full a11y pass** — Work between
4/28 and 4/29. Build-time cover bake of 50/52 tracks, unified Apple
Music app icon, paired left/right panel grids, global NowPlayingBar
with auto-play, and a WCAG 2.4.7 / Reduce Motion safety net.

---

## TL;DR

Worked around iTunes text-search ambiguity (same song lives in N
collections — single, OST, deluxe, compilation) by **baking covers
at build time across four data sources** (iTunes lookup → iTunes
search → Deezer → MusicBrainz + Cover Art Archive). Result:
50/52 (96%) seed tracks ship with byte-identical Apple Music
covers on first paint, zero runtime fetches.

Surface work on top: every Apple Music affordance now uses a
**single squircle app-icon component** (gradient + beamed double-
note glyph), the **two floating panels read as a paired design
system** (PLACE pink dot · MUSIC green dot), a global **bottom
NowPlayingBar fades in (180 ms)** when playback starts, and
clicking a building **auto-plays the #1 playlist's first track**
(250 ms after select, with a dedup guard so the same song doesn't
restart on re-clicks). Plus a **WCAG 2.4.7 focus-visible global**
+ **prefers-reduced-motion safety net**.

---

## Major changes

| Area | Change |
|------|---|
| **Share modal** | QR modal dropped. URL-based Web Share / Copy link, same `/p#p=…` fragment payload, still zero backend |
| **`/p` route** | New `PlaylistPreviewPage` — decodes hash → hero cover + track list with per-track Apple Music deep links. In-app browser detect + iOS `music://` scheme bypass |
| **Track-search precision** | New `coverArt.ts` 3-tier scorer: Tier-0 iTunes lookup `?id=…` (storefront-aware) → Tier-1 strict scored search (variant −60, compilation −20, single +8) → Tier-2 MusicBrainz + Cover Art Archive |
| **Build-time bake** | `scripts/bakeSeedCovers.mjs` — every seed resolved through the 4-source chain → frozen into `seedCovers.json`. mk() reads from the bake, ships the right Apple URL on first paint. 50/52 (96%) |
| **Seed verification** | `scripts/auditSeedCovers.mjs` (live lookups) + `scripts/crossCheckSeeds.mjs` (batch lookup, 600 IDs / call) — caught DJ Mix / Today's Hits / Boiler Room / deluxe / compilation traps |
| **Auto storefront detection** | Hangul → KR / Kana → JP / Han → JP / `kpop` genre → KR. JP-only releases (e.g. Pocket Park) failing US store now route through JP store |
| **Personal playlist names** | All 17 personas use `"{First}'s playlist"` (the iOS Music default). Editorial blurbs gone |
| **Mosaic / custom cover** | `PlaylistCover.tsx` — 4-tier fallback (custom URL → 4-up mosaic → single image → monogram). 5 personas (Omar / Mei / Sora / Kai / Ezra) carry `customCoverUrl`; missing files silently fall through to mosaic |
| **Apple Music app icon** | `AppleMusicIcon.tsx` — red squircle (22% radius) + white beamed-double-eighth-note SVG path. Gradient `#FB5C74 → #FA243C` + 1 px inset white specular. One component reused on TrackRow / NowPlayingBar / PreviewPage |
| **Tenant click → Google Maps** | `tenantClickUrl.ts` 3-tier (website > Maps `/@lat,lon,18z` > search fallback). Strips generic nouns ("restaurant", "cafe") so the geocoder gets the brand alone |
| **Tenant box size** | 28→36 px (desktop) / 36→44 px (mobile). Image fills 100%×100% with white background — no more partial-alpha PNG bleeding to the panel halo |
| **Mood-vector recommend** | `tenantMood.ts` — every tenant collapses to a 4-D vector (energy / warmth / intimacy / formality) + peakHour. `buildingMood` averages weighted by clock-face proximity to NOW. Literal "japanese → city pop" mappings dropped. RSS popularity share lifted 60 → 75% |
| **Lang-aware geocode** | `reverseGeocode(lat, lon, lang)` — sends user's lang as primary `accept-language`. Address format is now locale-correct (KO 큰→작은, JA no separator, EN street-first) so paste-into-Google-Maps lands on the same place |
| **i18n expansion** | Added `player.*`, `detail.*`, `share.*`, `preview.*`, `panel.music`. NowPlayingBar / PlaylistDetailView / PlaylistShareModal all route through `useT()` |
| **NowPlayingBar** | Global bottom mini-player (440 px max). Six elements: artwork / title-artist / play-pause / progress (click-to-seek) / Apple Music / × close. 180 ms fade |
| **Auto-play on select** | Building click → 250 ms later, auto `playPreview` of the #1 playlist's first track. Dedup guard (`lastAutoPlayRef`) prevents the same-song re-trigger that was secretly toggling the player |
| **City selector compact** | 6 chips → single dropdown pill (bottom-LEFT). Frees the bottom-CENTER thumb zone for NowPlayingBar. Hick's Law (one decision visible) |
| **Paired panel headers** | PLACE pink dot + MUSIC green dot pair. `SECTION_HEADER` token (11/800/1.2) applied to TENANTS / TOP PLAYLISTS / TOP PICKS — same in-section rhythm everywhere |
| **All images squared** | Music covers / curator avatars / monogram tiles → rounded squares. Only action affordances (⋯ / + / × / medal pip) stay circular |
| **Global a11y CSS** | `:focus-visible` 2 px indigo outline (lighter on dark mode), `@media (prefers-reduced-motion: reduce)` blanket safety net |
| **Dead code sweep** | Deleted 6 unreferenced files (BuildingPanel / BentoGrid / TrustStats / HeroCity / CityBuilding / PlateauCity). Orphan i18n keys removed |
| **Vendor split** | three / drei / postprocessing → `vendor-three.js` (1 MB). Marketing entry shrank 491 → 87 KB gz (-82%) |

---

## Key patterns

**1. Build-time 4-source cover bake**
```
[1] iTunes lookup?id=N&country={JP|KR|US}    → 41 hits 🎯 deterministic
[2] iTunes search + scored matcher            → 4 hits  🔍
[3] Deezer search                             → 1 hit   🎵
[4] MusicBrainz + Cover Art Archive           → 4 hits  📚
                                              ──────
                                              50/52 (96%)
```
Browser CORS / iTunes rate limit / MB 1 req/sec — all sidestepped
in Node. Output `seedCovers.json` is frozen → runtime fetches = 0.

**2. Variant + collection penalty**
```
ct === wt → +50, ca === wa → +50
VARIANT_RE → −60   (Karaoke / Live / Instrumental / Remix / Deluxe Edition)
COMPILATION_RE → −20 (DJ Mix / Boiler Room / Today's Hits / Greatest)
trackCount === 1 → +8 (single preferred)
older releaseDate → up to +5 (original release wins ties)
```
Cleanly separates "Sunflower" Spider-Verse OST vs Hollywood's
Bleeding vs Diamond Collection. Rejects DJ-Mix bait.

**3. Storefront auto-detect**
```
Hangul → KR / Kana → JP / kpop → KR / jpop → JP / CJK → JP / else → caller
```
"アイドル / YOASOBI" → JP store first → top result = correct
recording. JP-only releases that 0-out on the US store still match.

**4. Mood-vector recommendation**
```
Tenant tag → MoodVector (energy / warmth / intimacy / formality, peakHour)
buildingMood = avg weighted by |peakHour - now| (close 1.3×, far 1.0×)
moodToGenreBoosts → small additive (max ±2)
```
Korean BBQ in Tokyo at 11 pm → Tokyo charts + intimate-dinner mood
(NOT k-pop). Same restaurant in Seoul at 11 pm → k-pop comes from
the city profile, not from the tenant tag.

**5. Auto-play dedup**
```
lastAutoPlayRef = { buildingId, trackId }
if (last.id === id && last.tid === firstTrack.id) return; // skip
```
Stops the useEffect re-run / playPreview-toggle-pause / restart-
from-0:00 misfires when the same building stays selected.

---

## Untouched

- Backend (still 0 lines)
- iTunes search itself (works as-is)
- User auth / cross-device sync

---

## Plain-English summary (현태용)

- Every cover is now the actual album art for that song. 50/52
  resolved at build time. The 2 unresolved ones are fake song
  names in the seed (Late Night Tales / Yebba isn't a real song).
- All 17 fake curators got renamed to "Luna's playlist", "Jiro's
  playlist", etc. — the iOS Music default style. Editorial
  one-liners ("rainy 4am alley walk") are out.
- Five of them have custom photo covers (your teddy bear / cat /
  penguin / horse / silhouette images). Drop the files in
  `public/playlist-covers/` and they show up. Don't drop them and
  those five fall back to the 4-up mosaic too.
- Click any building → 250 ms later the #1 playlist's first track
  starts playing. A small bar fades in at the bottom of the screen.
- The little red Apple Music button = the actual app icon. Tap on
  iPhone → Apple Music app opens straight to that song.
- Click a tenant in the building → Google Maps drops the pin on
  that exact branch (uses the building's coordinates).
- The 6 city chips collapsed into one dropdown so the bottom of
  the screen is free for the player.
- Left and right panels now feel like a pair: pink "PLACE" dot on
  the left, green "MUSIC" dot on the right.

---

## Tech detail (윤섭한)

### New files
- `src/lib/music/coverArt.ts` — 3-tier resolveCover, storefront detection
- `src/lib/music/musicbrainz.ts` — MB recording search + CAA front-1200, 1 req/sec throttle
- `src/lib/music/tenantMood.ts` — 4-D mood vector + boosts + keywords
- `src/lib/share/playlistShareUrl.ts` — encode/decode + appleMusicUrl helper
- `src/lib/share/openAppleMusic.ts` — iOS music:// scheme + in-app webview detection
- `src/lib/ui/tokens.ts` — color / radius / font / spacing tokens (single source of truth)
- `src/lib/geo/tenantClickUrl.ts` — 3-tier (website / Maps@coords / search)
- `src/components/ui/CityDropdown.tsx` — single-pill dropdown (Hick's + Fitts's)
- `src/components/ui/music/PlaylistCover.tsx` — custom + mosaic + single + monogram fallback chain
- `src/components/ui/music/PlaylistShareModal.tsx` — Web Share + Copy link
- `src/components/ui/music/NowPlayingBar.tsx` — global mini-player
- `src/components/ui/music/AppleMusicIcon.tsx` — Apple Music app icon (gradient + beamed note)
- `src/components/ui/music/FeaturedPlaylistHero.tsx` — 160 px hero + share button
- `src/pages/share/PlaylistPreviewPage.tsx` — `/p` route
- `src/features/dev/enrichSeedArtwork.ts` — background enricher (cache v7)
- `src/features/dev/seedCovers.json` — baked 50/52 cover URLs
- `scripts/bakeSeedCovers.mjs` — 4-source build-time baker
- `scripts/auditSeedCovers.mjs` — DJ-mix / collection auditor
- `scripts/crossCheckSeeds.mjs` — batch lookup (600 IDs/req)

### Major edits
- `src/App.tsx` — NowPlayingBar mount, auto-play useEffect + dedup ref, CityDropdown integration, lang-aware geocode call, mood-vector flowing through deriveBuildingVibe → cityVibeAlgorithm, tenant click URL 3-tier
- `src/lib/music/itunes.ts` — `lookupTrackId(id, country)` overloaded signature (back-compat), 1200 → 600 px artwork URL
- `src/lib/music/buildingPlaylist.ts` — TaggerGroup gains `coverGridUrls[]`, `customCoverUrl`
- `src/lib/music/recommendEngine.ts` — RSS 75% / keyword 25% mix (popularity-first per spec)
- `src/lib/geo/osmLoader.ts` — `reverseGeocode(lat, lon, lang)` locale-aware address format
- `src/lib/app/i18n.ts` — added player.*, detail.*, share.*, preview.*, panel.music
- `src/components/ui/music/TrackRow.tsx` — right action ✓ → AppleMusicIcon when pinned, idle ⋯ / hover Plus / × kept
- `src/components/ui/music/PlaylistDetailView.tsx` — Apple Music style hero (132 px square cover), Play / Shuffle pills, Apple-red Play, "Song / Open(Edit)" track list header
- `src/components/ui/music/PreviewPlayer.tsx` — state gains meta + duration + position, pausePreview / resumePreview / seekPreview helpers
- `src/features/dev/seedAgents.ts` — 17 personas with personal names, customCoverUrl on 5, SEED_VERSION v17, picsum 600 px

### Dependencies
- `lucide-react` has Music4 (not used — wrote our own SVG path for fidelity)
- No new deps added (lz-string was added in a previous commit)

### Security (CSP / privacy)
- Share-URL data lives in the fragment (`#`) → never reaches server logs / referrer headers (verified in research)
- iOS `music://` scheme — bypasses Universal Link routing + in-app webview interception
- Build-time baker is server-side fetch (no CORS). Runtime reads only the baked JSON → external fetches at runtime = 0
- No localStorage trackers
- A11y: global `:focus-visible`, `prefers-reduced-motion` safety net

---

## Code-Claude prompts (for future me)

- "Cover matching is owned by the build-time bake. After
  changing the seed, run `node scripts/bakeSeedCovers.mjs` and
  commit `seedCovers.json`. Don't add a new runtime source."
- "When you need an Apple Music CTA on a music surface, use
  `<AppleMusicIcon href={url} size={N} />` — don't reinvent."
- "Auto-play is `useEffect + lastAutoPlayRef`. Same-song re-trigger
  toggles → mute. **Don't strip the dedup guard.**"
- "Tenant click is `tenantClickUrl(tenant, lat, lon)` — 3-tier
  automatic. Website wins, else `/maps/search/{q}/@{lat,lon},18z`.
  `?api=1&query=` falls back to a generic results page — don't
  use it."
- "i18n key adds go in `src/lib/app/i18n.ts` DICT. Components
  consume via the `useT()` hook. No inline English in render."
- "Colors come from `tokens.ts` only. APPLE_RED / INK / PAPER /
  DIVIDER. Look at the tokens before adding a new color."
- "Section headers are `fontSize: 11, fontWeight: 800,
  letterSpacing: 1.2` (the SECTION_HEADER spec). Anything else
  breaks the left/right panel grid alignment."

---

## What's worth doing next

### 🔴 Critical (structural)
- Consolidate the 3 simultaneous panels (Hick's Law) — fold left
  PLACE + main DETAILS into tabs
- Mobile bottom sheet (kill the side panels on mobile, all in
  one sheet with tabs)
- Auto-play: muted-by-default option / "Click to play" first-
  unlock CTA (Chrome autoplay policy)
- First-visit onboarding (pulse ring + dismissable toast)
- Keyboard reach for 3D buildings (a11y mirror `<ul>`)

### 🟡 High
- Esc / empty-space click to deselect (right-click only today)
- Building hover affordance + cursor pointer
- NowPlayingBar full-width dock or sheet integration
- Share OG images (Cloudflare Workers free tier) + deep links

### 🟢 Quality
- GitHub Action to re-bake `seedCovers.json` monthly
- AcoustID fingerprint matching (currently unused)
- User-pinned tracks should also store collectionId for Tier-0
  determinism

---

## Backend

Still 0 lines. The build-time baker effectively plays the role of
"static backend" (Node fetches → freezes to JSON → runtime reads).
