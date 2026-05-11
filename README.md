# VIBLOC

> Stack music on cities. Discover unique sounds building by building, in 3D.

VIBLOC is a web app where every building in a 3D city map carries its own playlist. Pin tracks to specific addresses, browse what other curators tagged in the same neighborhood, and let an AI recommendation engine surface the city's musical fingerprint one block at a time.

---

## ✨ Highlights

- **Real 3D city maps** — Manhattan, Shibuya, Shinjuku, Itaewon, Gangnam, LA. Click any building to open its panel.
- **Pin music to places** — search Apple Music's catalogue, tag a track to a building, see what others have tagged.
- **AI recommendations** — per-building playlists derived from city vibe + tenant context (Japanese restaurant → city pop, club → techno, etc.).
- **Live weather → scene** — real-time precipitation drives in-canvas rain particles + a fog tint. Camera follows the city's wall clock for the lighting cycle.
- **Apple Music macOS-style UI** — left tool rail + right music rail, both resizable. The city pans automatically to stay centred between the rails.
- **30-second previews** — non-DRM Apple Music previews with a built-in player + queue. No Apple Music subscription required.
- **Multi-language** — Korean / English / Japanese, switchable from the hero language pill.

---

## 🛠 Stack

| Layer | Tech |
|---|---|
| UI | React 19, TypeScript, Vite |
| 3D | three.js + @react-three/fiber + @react-three/drei + @react-three/postprocessing |
| Geo data | OpenStreetMap (Overpass API), Wikipedia / Wikidata enrichment |
| Music | Apple Music / iTunes Search API (free, no auth) |
| Auth + storage | Supabase (anon key only on the client) |
| State | Zustand |
| Routing | react-router |

---

## 🚀 Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
# → fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (see .env.example)

# 3. Run dev server
npm run dev
# → http://localhost:5173
```

### Build for production

```bash
npm run build       # type-check + bundle
npm run preview     # serve dist/ locally
```

---

## 🌐 Environment variables

All required + optional vars are documented in **[`.env.example`](./.env.example)**. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase publishable / anon key (safe for client) |
| `VITE_GOOGLE_CLIENT_ID` | optional | "Sign in with Google" button |
| `VITE_API_URL` | optional | Custom backend base URL |
| `VITE_GOOGLE_MAPS_EMBED_KEY` | optional | Inline Street View previews |

Only `VITE_`-prefixed vars are exposed to the client bundle. Never commit a service-role key or any other server-side secret.

---

## 📁 Project layout

```
src/
├── App.tsx                 # main map app — building selection, panels, queue
├── main.tsx                # entry point
├── app/                    # router + layouts
├── components/
│   ├── canvas/             # three.js scene, OSM building geometry, fog/weather effects
│   ├── ui/                 # left rail (FixedToolSidebar) + shared chrome
│   └── ui/music/           # right rail, track rows, playlist views, NowPlayingBar
├── features/
│   ├── auth/               # Supabase auth flows + avatar resolver
│   └── profile/            # building resolver, my-music shortcuts
├── lib/
│   ├── geo/                # OSM loader, Plus Code, address utils
│   ├── music/              # iTunes Search wrapper, recommendation engine, genre palette
│   ├── ui/                 # design tokens (COLOR, FONT, SPACE, …)
│   └── share/              # Apple Music deep links, share URL encoder
├── pages/                  # landing, auth, mypage, share preview
└── stores/                 # zustand stores (time, weather, building)
```

---

## 🎨 Design system

The UI uses a strict token system (`src/lib/ui/tokens.ts`):

- **Colors** — single `COLOR.*` palette (no inline `rgba()` / `#hex`)
- **Typography** — 2-tier ladder: title 16, body 12 (all multiples of 4)
- **Spacing** — 4-pt grid via `SPACE` (4·8·12·16·24·32·48)
- **Radius** — `RADIUS` (s 6, m 10, l 14, xl 20, pill 999)
- **Chromatic accents** — only `appleRed`, `heartRed`, `liveGreen`, plus 3 medal hues

Right-rail layout uses symmetric 12-px gutters and a single trailing column at `panel-right − 24`. The 3D camera and the NowPlayingBar both react to live `--vbk-left-rail-w` / `--vbk-right-rail-w` CSS variables, so resizing either rail keeps the city centred under the bar.

---

## 🌐 Deployment

Designed for static + edge hosts (Vercel, Netlify, Cloudflare Pages). Out of the box:

```bash
npm run build
# → dist/ contains a static SPA, ~580 KB gzip total
```

For Vercel:

1. Import the repo at https://vercel.com/new
2. Framework preset: Vite (auto-detected)
3. Add environment variables (see `.env.example`)
4. Deploy

Then in the Supabase dashboard → **Authentication → URL Configuration**, add the deployed origin to **Site URL** and **Redirect URLs** (e.g. `https://vibloc.vercel.app/**`).

---

## 📜 License

Private project. Code licensing TBD.

---

## 🇰🇷 한국어 요약

> 도시 위에 음악을 쌓다. 3D 도시에서 건물마다 다른 음악을 발견하세요.

VIBLOC 은 3D 도시 지도 위 모든 건물에 자기만의 플레이리스트가 있는 웹 앱입니다.

**핵심 기능**
- 6개 도시(맨해튼·시부야·신주쿠·이태원·강남·LA)의 실제 3D 빌딩
- Apple Music 카탈로그에서 곡을 검색해 건물에 핀
- 다른 큐레이터가 같은 동네에 핀한 트랙 탐색
- AI 추천 — 도시 vibe + 입주 업종에 맞춘 플레이리스트
- 실시간 날씨 → 비/눈 입자 + 안개 톤
- Apple Music macOS 풍 좌·우 사이드 레일
- 30초 프리뷰 (Apple Music 구독 불필요)
- 한국어 / English / 日本語

**개발 시작**
```bash
npm install
cp .env.example .env.local   # Supabase URL + anon key 입력
npm run dev
```

**배포** — Vercel 등 정적 호스팅에 그대로 올리면 됩니다. 환경변수는 `.env.example` 참고.
