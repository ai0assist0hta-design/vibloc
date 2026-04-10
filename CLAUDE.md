# VIBLOC — Project Master Context

## What is this file?
This is the single source of truth for the VIBLOC project. Claude Code should read this file before any implementation work. Every decision documented here has been discussed and confirmed.

---

## 1. Project Definition

**Name**: VIBLOC (바이블록) — Vibe + Block
**One-liner**: A location-based spatial audio social game where users claim real city buildings with music, and accumulated taste data transforms building colors on a 3D map.
**Category**: Data Visualization × Social × Music × 3D Web × Gamification
**Purpose**: Portfolio side project demonstrating WebGL 3D, external API integration, social backend, real-time data visualization, and gamification.

---

## 2. Core Concept

Users "claim" real buildings by tagging them with music genres (floor-by-floor). As tags accumulate, buildings visually transform — changing color based on dominant musical taste. The city becomes a living music taste map.

### The Magic Moment
All buildings start as white/gray masses. Someone tags floor 5 with Jazz, another tags floor 3 with Lofi. Over time, floors 3-5 glow warm amber. The next building over gets Electronic tags — it turns cool cyan. Zoom out and you see neighborhood-level music personality: Hongdae glows indie green, Gangnam pulses pop pink, Itaewon mixes everything.

### Key Differentiator
This is NOT passive tagging. It's a **Turf War** — users compete to be the "Top DJ" (most influential tagger) of each building. Top DJ gets their name displayed and can customize the building's visual effects.

### Core Flywheel
User claims building with music → building changes to their taste color + Top DJ shown → VIBLOC Export generates glowing 3D screenshot → shared on Instagram → friends join to compete → more tags → richer city colors → repeat.

---

## 3. Design Principles (STRICT)

### Visual Style
- **Reference images weight: 90%** — architectural white model aesthetic
- **NO paper texture, NO ornament, NO multi-color neon**
- **Tesla FSD / Apple Music level minimal**
- Background: warm off-white (#f0ede6) — NOT pure white
- Buildings base: cool blue-gray (#d0d4de) — visible against warm bg
- Edge lines: strong (#9090a8, opacity 0.4) — silhouette definition
- Shadows: strong directional + hemisphere (warm sky + cool ground)
- Tagged buildings: translucent taste color tint + glow
- UI: glassmorphic panels (backdrop-filter blur), pill genre buttons
- Typography: IBM Plex Mono (data), Pretendard (Korean), system fonts (UI)

### Building Rendering States
| State | Tags | Visual |
|-------|------|--------|
| Empty | 0 | Cool blue-gray mass + dark edge lines |
| Hinted | 1-5 | Faint taste color tint on tagged floors (10-15% opacity) |
| Forming | 6-20 | Dominant color spreading (20-35% opacity), edges tinting |
| Full | 20+ | Clear taste color + emissive glow + subtle pulse animation |

### Post-Processing (Critical for Quality)
- **SSAO** (N8AO) — contact shadows between buildings = 90% of depth perception
- **Depth of Field** — tilt-shift miniature model feel
- **Vignette** — subtle edge darkening
- **Fog** — exponential, fades city edges naturally

---

## 4. Tech Stack (CONFIRMED)

```
Frontend:       React 18 + TypeScript + Vite
3D Engine:      React Three Fiber + @react-three/drei
Post-Process:   @react-three/postprocessing + n8ao
State:          Zustand
Styling:        Tailwind CSS
Animation:      Framer Motion
Backend:        Supabase (Auth + PostgreSQL + Realtime + Edge Functions)
Music:          iTunes Search API (FREE, no API key, no user limit)
Building Data:  PLATEAU glTF (Tokyo) / OSM Overpass API (Seoul, NYC, HK)
Deploy:         Vercel
Monitoring:     r3f-perf (dev)
```

---

## 5. Music Integration — iTunes Search API

### Why iTunes (NOT Spotify)
- Free: No API key, no developer account, no user limit
- 30-sec preview: previewUrl field returns direct m4a URL
- Genre: primaryGenreName field for auto-classification
- Album art: artworkUrl100 for thumbnails
- Spotify deprecated audio-features (Nov 2024), restricted to 25 dev-mode users (May 2025)

### Usage
```
GET https://itunes.apple.com/search?term={query}&media=music&limit=10
```

Response fields used:
- trackName, artistName, collectionName
- previewUrl — 30-sec m4a, play with HTML5 <audio>
- primaryGenreName — "Jazz", "Pop", "Electronic", etc.
- artworkUrl100 — album art thumbnail
- trackViewUrl — link to Apple Music

Rate limit: 20 req/min. Debounce search input 300ms.

---

## 6. Taste → Color Mapping

| Genre Group | Color | Hex | Feel |
|-------------|-------|-----|------|
| Jazz / Soul / Lofi | Amber | #ff9500 | Warm, analog |
| Electronic / Techno / House | Cyan | #00c7be | Cold, digital |
| Pop / K-pop / Dance | Pink | #ff2d55 | Energetic, bold |
| R&B / Hip-hop / Rap | Purple | #af52de | Deep, nocturnal |
| Indie / Folk / Acoustic | Green | #34c759 | Organic, earthy |
| Rock / Metal / Punk | Red | #ff453a | Raw, aggressive |
| Classical / Orchestral | Gold | #ffcc00 | Refined, golden |

### Color Rules
- Single genre dominant (70%+) → full color
- Mixed → gradient of top 2 genres by floor position
- Building color = weighted average of all floor tags
- Floor color = that floor's tags only

---

## 7. Data Models

### buildings
```
id, city_key, name, lat, lon, height, levels, is_landmark, osm_id, created_at
```

### tags (Vibe Feed — cumulative)
```
id, building_id, floor, genre, itunes_track_id, track_name, artist_name,
artwork_url, preview_url, comment(140 chars max), vibe_tags[],
user_id, is_local(boolean), influence_weight(float), created_at
```

### users
```
id, display_name, avatar_url, auth_provider, level, xp, vibe_credits,
streak_days, last_active_date, equipped_frame, equipped_glow,
equipped_title, badges[], created_at
```

### daily_quests
```
id, user_id, quest_type, quest_description, target_count, current_count,
reward_vc, reward_xp, is_completed, quest_date, created_at
```

---

## 8. Time Decay

```typescript
function getTimeDecayWeight(createdAt: Date): number {
  const days = (Date.now() - createdAt.getTime()) / 86400000;
  return Math.exp(-0.01 * days);
}
// Today: 1.0 | 7d: 0.93 | 30d: 0.74 | 90d: 0.41 | 180d: 0.17
```

---

## 9. Top DJ System

- Top DJ = user with highest weighted tag count per building
- Display: hover label "🎧 Top DJ: @username" + panel header
- Tie-breaker: most recent tag wins
- Phase 2: subtitle customization, VFX selection

---

## 10. Gamification

### XP Levels
1(0) Listener → 2(100) Explorer → 3(300) Tagger → 5(800) Curator → 7(1500) Influencer → 10(3000) DJ → 15(6000) Producer → 20(10000) Architect → 30(20000) City Owner

### VC Earning
Tag: 10 | First tag on building: 30 | Local tag: 25 | Quest: 50-200 | All-clear bonus: 100 | Top DJ: 100 | Top DJ/24h: 20 | 7-day streak: 300

### Daily Quests
3 random from pool, no category duplicates, no carry-over. All-clear bonus +100 VC +50 XP.

### Shop (VC spending)
Profile: color(100), frame(300/800), glow(500), title(1000), banner(600)
Building FX (Top DJ): gradient(500), pulse(400), particles(800), aurora(1200), crown(600)
Tags: custom tag(1500), color(200), gold frame(700)

### Badges (12 total)
First Steps, Explorer(10 buildings), Building DJ(20 tags/1 building), Top DJ, City Dominator(5 simultaneous), Genre Master(all 10), Night Owl, Streak King(30d), World Traveler(3 cities), Pioneer(20 virgin buildings), Critic(50 comments), Social Butterfly(50 users visited)

---

## 11. Social Features

### Vibe Tags presets
🎶 Chill, 🔥 Trendy, 🌌 Ethereal, 🌧 Rainy-day, 💎 Hidden gem, ⚡ Energetic, 🎭 Dramatic, 🌊 Flow

### Walled Garden
- No external links in 3D map. User profile: 1 SNS link only. Comment URLs auto-filtered.

### VIBLOC Export (Phase 2)
canvas.toDataURL() → text overlay → Web Share API

### Vibe Drop (Phase 2)
12h ephemeral. WHERE created_at + interval '12 hours' > now()

### Geo-Weight (Phase 2)
<50m: weight 1.0, is_local=true. >=50m: weight 0.01

---

## 12. Building Data Sources

| City | Source | Format |
|------|--------|--------|
| Tokyo | PLATEAU + TUM glTF | glTF/glb (ready to use) |
| Seoul | OSM Overpass API | GeoJSON → ExtrudeGeometry |
| NYC | NYC Open Data / awesome-citygml | CityGML → glTF |
| Hong Kong | OSM Overpass API | GeoJSON → ExtrudeGeometry |

### Key repos
- github.com/N8python/n8ao — SSAO
- github.com/pmndrs/react-postprocessing — DOF/Bloom
- github.com/SergeyTreacle/OSM-3D-Viewer — OSM city reference
- github.com/OloOcki/awesome-citygml — free 3D city catalog
- github.com/NASA-AMMOS/3DTilesRendererJS — Google Earth tiles
- mlit.go.jp/plateau/open-data — Japan free 3D cities

---

## 13. Landmark Data (Hardcoded)

### Seoul
Lotte World Tower(123F,taper+spire), 63 Building(60F,slab), N Seoul Tower(tower+spire), Gangnam Finance Center(50F,box), DDP(organic dome), Gwanghwamun Gate(low)

### Tokyo
Tokyo Skytree(634m,lattice+spire), Tokyo Tower(red lattice), Mori Tower(wide box), Mode Gakuen(twist), Senso-ji(temple)

### NYC
One WTC(taper+spire), Empire State(4-step deco+spire), Chrysler(deco crown), 432 Park(pencil), Statue of Liberty(statue), Flatiron(triangle), Brooklyn Bridge(span)

### Hong Kong
ICC(taper), Bank of China(angular), Two IFC(taper), Central Plaza(cylinder+spire), Big Buddha(statue)

---

## 14. Development Phases

### Phase 1 — 3D City + Tagging (3-4 weeks)
R3F setup, procedural city + landmarks, SSAO+DOF, raycasting, tagging UI, color transform, Top DJ, Time Decay, localStorage, demo seeding

### Phase 2 — Backend + Music (3-4 weeks)
Supabase (Auth+DB+Realtime), iTunes API search+preview, user auth, Top DJ server-side, profiles, 4 cities

### Phase 3 — Social + Gamification (2-3 weeks)
Quests, XP/Level/VC, shop, VIBLOC Export, Vibe Drop, GPS weight, badges, Influence Score

### Phase 4 — Polish + Launch (2-3 weeks)
Performance (InstancedMesh, LOD), mobile, Vercel deploy, OG tags, portfolio page, pilot launch

---

## 15. MVP Scope (Minimum)

**In**: 1 city (procedural), ~150 buildings, floor tagging, color transform, Top DJ, Time Decay, quests+XP+VC (localStorage), demo data, roads/parks, SSAO+DOF

**Out**: Supabase, iTunes API, GPS weight, Vibe Drop, Export, shop, 4-city switching

---

## 16. File Structure

```
vibloc/
├── public/models/
├── src/
│   ├── components/
│   │   ├── canvas/    (City, Building, Roads, Landmarks, PostProcessing)
│   │   ├── ui/        (BuildingPanel, TaggingForm, QuestTracker, CityNav, HUD, Toast)
│   │   └── layout/    (App)
│   ├── stores/        (useBuildingStore, useTagStore, useUserStore, useQuestStore)
│   ├── data/          (cities, genres, quests, shop, badges)
│   ├── lib/           (itunes, tasteEngine, timeDecay, questEngine, buildingGen)
│   ├── types/         (index.ts)
│   ├── main.tsx
│   └── index.css
├── CLAUDE.md
├── package.json, tsconfig.json, tailwind.config.ts, vite.config.ts
```

---

## 17. Setup Commands

```bash
npm create vite@latest vibloc -- --template react-ts
cd vibloc
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
npm install zustand framer-motion
npm install -D tailwindcss @tailwindcss/vite
npm install n8ao postprocessing
npm run dev
```

---

*Last updated: 2026-04-04*
