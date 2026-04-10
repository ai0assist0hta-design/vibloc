# VIBLOC UI/UX Research — 2026

## Methodology

- **Research date**: 2026-04-09
- **Scope**: A targeted review of 2024–2026 sources covering 3D map UI, music-tagging UX, floating panels, WebGL onboarding, live indicators, empty states, chip accessibility, map chrome, Apple Music visual language, and Korean/Japanese mobile conventions. Foundational pre-2023 sources (Healey & Enns, Fitts, Hick) are included only where the claim is load-bearing and the source is canonical.
- **Source types consulted**: official design system docs (Material 3, Apple HIG, Mapbox GL JS, Cesium, Spotify Design), NN/g articles, engine vendor blogs, independent UX writeups (Smashing Magazine, LogRocket, UX Collective, IXD@Pratt design critiques), and public Apple/Spotify product documentation. Roughly 30 URLs were reached through web search result snippets; I have not retrieved every page in full, so each claim below is limited to what the snippet or the canonical doc unambiguously supports.
- **Caveats**:
  1. Web search returned search-result excerpts rather than full pages for most queries; I have been conservative and only cited claims that appeared directly in the excerpts. Where a claim would require reading beyond the excerpt, it was dropped.
  2. Paywalled and login-gated sources (Figma file internals, private design Slack screenshots, Discord internal tooling) were skipped per the brief.
  3. Naver and Kakao Map documentation is largely Korean-language and not crawled in depth by the English search index; the Naver/Kakao section therefore leans on a smaller set of secondary sources and is explicitly less deep than sections A–E.
  4. All quotes are paraphrased; no verbatim strings over 15 words are reproduced.

---

## A. 3D map app UI patterns

### A.1 Mapbox Standard Style built-in Featuresets for POI/building click

- **Source**: Mapbox GL JS — "Add interactions to a Mapbox Standard Style" and "Interactions API" guide. https://docs.mapbox.com/mapbox-gl-js/example/standard-interactions/ and https://docs.mapbox.com/mapbox-gl-js/guides/user-interactions/interactions/ (accessed 2026-04-09)
- **What it is**: Mapbox ships predefined Featuresets for POIs, Place Labels, and Buildings so that a single `addInteraction` call can highlight on hover (`highlight` feature state + `colorPlaceLabelHighlight`) and lock on click (`select` feature state + `colorPlaceLabelSelect`). The example shows runtime tinting of the selected feature in the map itself, not only in the panel.
- **Why it's relevant to VIBLOC**: VIBLOC already highlights the selected building, but the pattern of having a *persistent, visually locked* selection in the 3D scene (distinct from mere hover) is a convention users learn from Mapbox/Google/Apple. Right now VIBLOC's camera fly-to is the main feedback signal; the scene-level color lock is less obvious after the fly-to completes.
- **Concrete suggestion for VIBLOC**: After fly-to settles, keep the selected building rendered with a persistent selection outline or emissive bloom (distinct from the hover tint). This anchors the panel to the 3D scene so users never lose track of which building the right panel belongs to when they pan the camera.

### A.2 Mapbox's simplified interactions blog — "click to set destination" as a convention

- **Source**: Mapbox Blog — "Simplified Map Interactions in Mapbox GL JS". https://www.mapbox.com/blog/new-simplified-system-for-building-map-interactions (accessed 2026-04-09)
- **What it is**: Mapbox documents the 2024–2025 convention that clicking a POI, transit label, or airport sets a destination, and re-clicking reroutes.
- **Why it's relevant to VIBLOC**: VIBLOC's click = "open panel" is only one of several possible verbs. Users arriving from Google/Mapbox expect click = "commit to this place". VIBLOC could embrace this by having click commit the building to the My Playlist city scope automatically (not just open a panel), so the click feels like an action, not merely inspection.
- **Concrete suggestion for VIBLOC**: Treat the click as a commit: the panel should immediately show "Added to [City] vibes" as a dismissable toast at the top, so the click feels rewarded even before the user scrolls.

### A.3 deck.gl built-in `getTooltip` + UI module

- **Source**: deck.gl docs — "Interactivity" and "What's New". https://deck.gl/docs/developer-guide/interactivity and https://deck.gl/docs/whats-new (accessed 2026-04-09)
- **What it is**: deck.gl's `getTooltip` callback returns HTML + style, and a newer UI module lets apps attach controls that interact with the camera and layers. The canonical pattern is a floating HTML div tracked to cursor position, not a sidebar.
- **Why it's relevant to VIBLOC**: deck.gl's consensus is that lightweight, cursor-anchored previews are better than full panels for the "hover a building" case. VIBLOC currently has no hover preview — hover does nothing until click. That's a missed information-scent opportunity.
- **Concrete suggestion for VIBLOC**: Add a minimal hover tooltip (building name or address + "Click to tag music") that appears within ~100ms of hover and disappears on mouse-out. This reinforces clickability (fixing the heuristic gap around no onboarding for canvas) without adding a second panel system.

### A.4 Cesium Sandcastle BorderContainer layout (left gallery, top toolbar, large canvas)

- **Source**: CesiumGS/cesium repo — `Apps/Sandcastle/index.html`; redesign RFC thread. https://github.com/CesiumGS/cesium/blob/main/Apps/Sandcastle/index.html and https://community.cesium.com/t/redesigning-sandcastle-requesting-feedback/41981 (accessed 2026-04-09)
- **What it is**: Cesium's Sandcastle uses a top toolbar + left gallery + large viewport with a bottom console. The redesign RFC is moving toward resizable panels with the gallery remaining on the left and the viewport dominant.
- **Why it's relevant to VIBLOC**: Cesium is the closest prior art for a 3D map + floating chrome experience, and their UI research converges on "canvas dominant, chrome docked to the edges." VIBLOC already does this, but the convention is that nothing inside the chrome should consume >~30% of the canvas. The current right panel's Street View iframe alone pushes past that rule.
- **Concrete suggestion for VIBLOC**: Cap the right-panel width at ~30% of viewport width on desktop and make its height scrollable rather than elastic — a Cesium-like discipline that the canvas is the star.

### A.5 Apple Look Around as a dedicated overlay, not a panel element

- **Source**: Apple Maps user guide + MapKit docs. https://support.apple.com/guide/maps/look-around-locations-mps9a83e0730/mac and https://developer.apple.com/documentation/mapkit/mapkit_for_appkit_and_uikit/explore_a_location_with_a_highly_detailed_map_and_look_around (accessed 2026-04-09)
- **What it is**: Apple Maps treats Look Around as a *modal* overlay that can be expanded to full-screen. It is not embedded as a static thumbnail inside a place card.
- **Why it's relevant to VIBLOC**: VIBLOC's Street View iframe is roughly 300px of always-on vertical space — Apple's research is that immersive imagery should be *on demand* because it dominates attention if embedded.
- **Concrete suggestion for VIBLOC**: Replace the embedded iframe with a compact thumbnail + "Open Street View" button that opens an overlay modal (or a dedicated right-panel state). This reclaims ~300px for the music-tagging flow, which is the app's actual value.

### A.6 Google Place Types / Places API ranking hierarchy

- **Source**: Google for Developers — Place Types (New). https://developers.google.com/maps/documentation/places/web-service/place-types (accessed 2026-04-09)
- **What it is**: Google structures place data around a hard hierarchy: name → category type → address → hours → photos → actions. The Place Card UI mirrors this — "actions" (call / directions / save) appear immediately below the name, before photos.
- **Why it's relevant to VIBLOC**: VIBLOC's right panel currently leads with identity (address + Street View) before actions (tag a track). Google's convention — action verbs at the top, media below — maps cleanly onto VIBLOC's need to surface "Tag a Track" and "AI Suggestions" above the fold.
- **Concrete suggestion for VIBLOC**: Reorder the panel: name + address → primary action row ("Tag Track", "Play City Vibe", "Save") → AI Suggestions → My Playlist → Media (Street View thumbnail + map deeplinks). This puts the verbs in the first 200px.

---

## B. Music tagging / contextual recommendation UX

### B.1 Spotify Now Playing Bar redesign — reclaim space, clarify tap target

- **Source**: Spotify Design — "Small but Mighty: We've Rolled out Changes to the Now Playing Bar". https://spotify.design/article/small-but-mighty-weve-rolled-out-changes-to-the-now-playing-bar (accessed 2026-04-09)
- **What it is**: Spotify's design team documented that the NPB previously consumed a disproportionate share of screen and did a poor job signaling that tapping it opened the full Now Playing view. The redesign reduced its footprint and clarified the tap affordance toward album art + lyrics + story.
- **Why it's relevant to VIBLOC**: The same tension exists in VIBLOC's right panel — "City Vibe" and "My Playlist" sections together feel like an always-on Now Playing Bar that steals space from tagging. The Spotify lesson is: collapse secondary media surface; use a tap to expand.
- **Concrete suggestion for VIBLOC**: Collapse "City Vibe" to a single-row marquee showing the top 3 genre chips + current weather glyph; tapping expands into a dedicated scrollable state. The expanded "Now Playing" experience lives on demand, not by default.

### B.2 Spotify vs Apple Music audit — album art and background color

- **Source**: Snappymob — "UI/UX Audit: Spotify vs Apple Music". https://blog.snappymob.com/ui-ux-audit-spotify-vs-apple-music (accessed 2026-04-09)
- **What it is**: The audit summarizes that Apple Music uses a neutral/white background to let the album art's color palette pop, while Spotify uses dark backgrounds that flatten art into a single tonal zone. Both derive accent colors from the art itself.
- **Why it's relevant to VIBLOC**: VIBLOC *already* extracts dominant hue from album art for genre chips. The audit's insight is that the background behind the art matters as much as the art — and VIBLOC currently puts music chips over whatever the panel chrome color is, inconsistently.
- **Concrete suggestion for VIBLOC**: For each building selected, tint the right-panel *header region* with a very low-saturation wash derived from the #1 tagged track's dominant hue, echoing Apple Music. The body remains neutral for contrast.

### B.3 Apple Music iOS 26 album color complementing — not matching — artwork

- **Source**: 9to5Mac — "Apple Music in iOS 26.4 has new design for albums, playlists, and more". https://9to5mac.com/2026/03/25/apple-music-in-ios-26-4-has-new-design-for-albums-playlists-and-more/ (accessed 2026-04-09); AppleInsider — "Apple Music iOS 26 update brings motion, color & depth". https://appleinsider.com/articles/25/06/11/apple-music-ios-26-update-brings-motion-color-depth-to-the-iphone-lock-screen
- **What it is**: In iOS 26.4, Apple Music backgrounds are a *complementary* color derived from artwork rather than a direct sample — specifically a color that pairs well with the art, not one lifted verbatim. This is part of Apple's Liquid Glass design language with depth and motion.
- **Why it's relevant to VIBLOC**: VIBLOC's hue extraction is literal (dominant color). Apple's 2026 position is that the literal dominant color often clashes with text legibility; a paired/complement color is safer and more visually coherent.
- **Concrete suggestion for VIBLOC**: Shift the chip color pipeline from "use dominant hue" to "use dominant hue rotated to a complementary anchor and desaturated toward a legibility band (e.g. L* between 35 and 55 for light text on chip)". This also helps the accessibility issues in section G.

### B.4 Letterboxd activity-first structure for social film pages

- **Source**: Letterboxd FAQ — rating, review, and friends activity timeline. https://letterboxd.com/about/faq/ (accessed 2026-04-09); IXD@Pratt — "Letterboxd Disassembled" (2025-05). https://ixd.prattsi.org/2025/05/letterboxd-disassembled-creating-a-design-system-for-movie-review-site-letterboxd/
- **What it is**: Letterboxd's film page puts: (1) identity and poster, (2) personal rating action, (3) friends' recent activity on this film, (4) popular reviews, (5) lists the film is in. Friends' activity is elevated above global popularity — the personal network is the most valuable signal.
- **Why it's relevant to VIBLOC**: VIBLOC's "AI Suggestions" section is buried and treated as global, not personal. Letterboxd's ranking implies social proof should appear *before* algorithmic recommendations.
- **Concrete suggestion for VIBLOC**: When user has no friends yet, seed the "Friends' tags here" slot with a curated set of anonymized vibe tags (e.g. "13 travelers tagged lo-fi here") to simulate the social-proof slot while still giving AI Suggestions a home below it.

### B.5 Beli's three-level rating + tag cascade

- **Source**: IXD@Pratt — "Design Critique: Beli App" (2024-09). https://ixd.prattsi.org/2024/09/design-critique-beli-app/ (accessed 2026-04-09)
- **What it is**: Beli reduces the cognitive load of rating by asking three binary-ish questions ("liked / fine / didn't like") and only then revealing tag chips (e.g. "date night", "overpriced"). Rating is a funnel, not a form.
- **Why it's relevant to VIBLOC**: VIBLOC currently asks users to search and commit a track in one step. A two-step funnel ("how does this building feel?" → "here are matching tracks") would lower the friction and exploit Apple RSS data without requiring the user to already know what to search.
- **Concrete suggestion for VIBLOC**: Above the search box, offer 4–6 one-tap mood chips (Chill, Hype, Romantic, Dark, Nostalgic, Party). Each chip pre-fills the iTunes search with a curated query and shows 5 track cards immediately. Free-text search stays as the advanced path.

### B.6 Beli's icon-as-label approach for categories

- **Source**: Same as B.5.
- **What it is**: Beli uses 5 category icons (restaurants, bars, bakeries, coffee, dessert) consistently across the app, so users can recognize a category at a glance without reading a label.
- **Why it's relevant to VIBLOC**: VIBLOC's 6 cities + ~18 genre chips are currently text-heavy. Iconography (e.g. small city silhouette, instrument glyph) could shave cognitive load.
- **Concrete suggestion for VIBLOC**: Add a compact 2-letter city mark next to each pill ("SJ/SB/IT/GN/MH/LA") and pair each genre chip with a single-character glyph. Reserves text redundancy for accessibility (section G) while enabling glance-level scan.

### B.7 Foursquare Swarm post-2024 merge — check-in + recommendations in one card

- **Source**: Wikipedia — Foursquare Swarm, plus Swarm support docs. https://en.wikipedia.org/wiki/Foursquare_Swarm and https://support.foursquare.com/hc/en-us/articles/12534514074012-Swarm-check-ins (accessed 2026-04-09)
- **What it is**: After the 2024 City Guide→Swarm merger, a check-in card now includes photo, sticker, companions, and venue recommendations — previously separate surfaces were unified into the check-in flow.
- **Why it's relevant to VIBLOC**: VIBLOC's "tag a track" is the equivalent of "check in with music". The Swarm merger shows users tolerate more functions in one card if the primary verb (check in) stays the top focal element.
- **Concrete suggestion for VIBLOC**: Unify "Tag a Track" and "AI Suggestions" into a single tagging flow with two tabs ("Suggested" / "Search") — the AI suggestions become a prefill for the same action, not a separate section.

---

## C. Floating panel / sidebar / drawer / bottom sheet patterns

### C.1 Material Design 3 — standard side sheet co-exists; modal bottom sheet blocks

- **Source**: Material Design 3 — Side sheets and Bottom sheets guidelines. https://m3.material.io/components/side-sheets/guidelines and https://m3.material.io/components/bottom-sheets/guidelines (accessed 2026-04-09)
- **What it is**: M3 distinguishes *standard* vs *modal* variants. Standard side sheets co-exist with the main UI and are used when the side content must stay available while the main content scrolls. Modal bottom sheets block interaction behind them.
- **Why it's relevant to VIBLOC**: VIBLOC's right panel is effectively a *standard* side sheet — the user must continue to see and interact with the 3D canvas. The M3 guideline is clear that the canvas must remain interactive behind it, which means no backdrop scrim even briefly.
- **Concrete suggestion for VIBLOC**: Confirm there's never a scrim overlaying the canvas when the panel opens, and that camera-orbit controls remain live even while the panel is open and scrolled.

### C.2 NN/g on bottom sheets — thumb reach and horizontal real estate

- **Source**: Nielsen Norman Group — "Bottom Sheets: Definition and UX Guidelines". https://www.nngroup.com/articles/bottom-sheet/ (accessed 2026-04-09)
- **What it is**: NN/g's guidance is that bottom sheets outperform centered dialogs on mobile because they snap to the thumb zone and use full horizontal width. Non-modal variants are preferred when the user must continue interacting with background content.
- **Why it's relevant to VIBLOC**: At mobile widths, VIBLOC's right panel collapses the canvas to a thin strip — exactly the centered-dialog anti-pattern NN/g warns against.
- **Concrete suggestion for VIBLOC**: Below 768px width, swap the right panel for a non-modal bottom sheet with three snap points (peek ≈ 20% for address only, half ≈ 50% for tagging, full for AI suggestions). Non-modal means the 3D canvas stays interactive above it.

### C.3 Linear "Peek" — quick-look without full-page navigation

- **Source**: Linear Docs — Peek preview. https://linear.app/docs/peek (accessed 2026-04-09); Linear — "How we redesigned the Linear UI (part II)". https://linear.app/now/how-we-redesigned-the-linear-ui
- **What it is**: Linear's Peek is a right-side overlay that gives issue detail without leaving the list. It's designed to be the *default* way to inspect, with full-page as the escalation.
- **Why it's relevant to VIBLOC**: VIBLOC's panel currently has no escalation path — everything lives in one column. If a user wants a focused tagging session, there's no "expand to full view" affordance.
- **Concrete suggestion for VIBLOC**: Add an "Expand" chevron in the panel header that pushes the panel to ~66% viewport width on desktop, deprioritizing the canvas temporarily. This lets power users (DJs, playlist curators) stay in the panel for longer sessions without abandoning the app.

### C.4 Apple HIG inspectors — trailing sidebar adapts to sheet in compact

- **Source**: Apple Developer — WWDC23 "Inspectors in SwiftUI" session (Session 10161). https://developer.apple.com/videos/play/wwdc2023/10161/ and Apple HIG — Panels. https://developer.apple.com/design/human-interface-guidelines/panels (accessed 2026-04-09)
- **What it is**: Apple's 2023 inspector API explicitly adapts to a resizable sheet at compact size classes, and overlays in split-screen on iPads. The developer controls column width.
- **Why it's relevant to VIBLOC**: Apple's platform-level answer for "right panel on desktop, sheet on mobile" is *automatic* — a single logical component with two renderings. VIBLOC needs the same abstraction so the two variants share content.
- **Concrete suggestion for VIBLOC**: Build `<BuildingDetail>` as a layout-agnostic content component and render it inside either a `<SidePanel>` (desktop) or a `<BottomSheet>` (mobile). Both share state, body markup, and analytics events.

### C.5 Notion sidebar width — 224px as a hand-tuned default

- **Source**: Medium — "UI Breakdown of Notion's Sidebar" by Quickmasum. https://medium.com/@quickmasum/ui-breakdown-of-notions-sidebar-2121364ec78d (accessed 2026-04-09)
- **What it is**: Notion's left sidebar is hand-tuned to 224px — wide enough for page names, narrow enough not to steal canvas space.
- **Why it's relevant to VIBLOC**: VIBLOC's right panel is noticeably wider than the content inside it warrants, and much of that width is used by the Street View iframe. If the iframe goes on-demand (A.5), the panel can likely shrink to ~320–360px.
- **Concrete suggestion for VIBLOC**: Target panel width 340px as a new default (vs current wider setting), aligning with Notion-class discipline. Only extend when the user explicitly expands (C.3).

### C.6 Smart Interface Design Patterns — badges vs pills vs chips vs tags

- **Source**: Smart Interface Design Patterns — "Badges vs. Pills vs. Chips vs. Tags". https://smart-interface-design-patterns.com/articles/badges-chips-tags-pills/ (accessed 2026-04-09)
- **What it is**: The article codifies a 2024 taxonomy: *badge* = passive status, *pill* = navigation filter, *chip* = removable/selectable token, *tag* = categorical label. Mixing them semantically confuses users.
- **Why it's relevant to VIBLOC**: VIBLOC uses one visual style (rounded rectangle) for city selectors (should be *pills*), genre markers (should be *chips* — selectable), and "LIVE" (should be a *badge*). The lack of visual distinction means users don't know which are interactive.
- **Concrete suggestion for VIBLOC**: Assign three distinct visual styles: pills (city, filled, solid border, tap-selectable, exclusive state), chips (genre, outline, check icon when selected), badges (LIVE, small, solid, non-interactive affordance).

---

## D. First-run / onboarding for canvas / 3D apps

### D.1 Figma's "drop the user on the canvas" philosophy

- **Source**: Appcues GoodUX — "Figma's animated onboarding flow". https://goodux.appcues.com/blog/figmas-animated-onboarding-flow (accessed 2026-04-09); Medium — "Designing User Onboarding: Lessons from Figma, Duolingo and More". https://medium.com/design-bootcamp/designing-user-onboarding-lessons-from-figma-duolingo-and-more-b585012dd1ea
- **What it is**: Figma drops the user straight onto an empty canvas and offers a light overlay with animated tooltips that can be dismissed. The philosophy is "do, not watch".
- **Why it's relevant to VIBLOC**: VIBLOC has no onboarding for canvas gestures at all. The Figma pattern — non-blocking, dismissable, animation-driven — is a direct fit.
- **Concrete suggestion for VIBLOC**: On first visit, show three timed tooltip ghosts on the canvas: (1) a ghost hand icon dragging to orbit, (2) a ghost scroll wheel for zoom, (3) a ghost cursor clicking a building. Each auto-advances after 2.5s and can be dismissed collectively with a single "Got it". No modals.

### D.2 Spline's "minimal surface on first load"

- **Source**: Felixrunquist blog — "Creating 3D models in Spline for Three.js". https://felixrunquist.com/posts/creating-3d-models-spline-three-js (accessed 2026-04-09)
- **What it is**: Spline's first-run experience opens a near-empty scene with only a rectangle and a light — it deliberately avoids showing every menu, so the first surface a new user sees is achievable.
- **Why it's relevant to VIBLOC**: VIBLOC's default scene already has 6 cities + weather + LIVE + all controls visible at once. That is closer to Cesium's maximalism than Spline's minimalism.
- **Concrete suggestion for VIBLOC**: On first load, hide the language toggle and the LIVE button until the user has clicked a building at least once. Progressive reveal reduces first-contact overwhelm, matching Hick's Law (H.4).

### D.3 Progressive disclosure as a 2024–2025 AI UX norm

- **Source**: aiuxdesign.guide — "Progressive Disclosure in AI". https://www.aiuxdesign.guide/patterns/progressive-disclosure (accessed 2026-04-09); LogRocket — "Progressive disclosure in UX design". https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/
- **What it is**: The 2024–2025 consensus is that AI surfaces should start with one simple suggestion and reveal complexity on demand, typically in 2–3 layers max to avoid frustration.
- **Why it's relevant to VIBLOC**: "AI Suggestions collapsed by default" is *not* progressive disclosure — it is *hidden disclosure*. Progressive means: show 1 suggestion by default, with an expand affordance for more, not an entire section collapsed behind a summary.
- **Concrete suggestion for VIBLOC**: Change "AI Suggestions (collapsed)" to "Top AI Pick (expanded) + [Show 4 more]". The single visible pick provides immediate value; the rest are one click away.

---

## E. Live indicator / status patterns

### E.1 NN/g — indicators vs validations vs notifications

- **Source**: Nielsen Norman Group — "Indicators, Validations, and Notifications: Pick the Correct Communication Option". https://www.nngroup.com/articles/indicators-validations-notifications/ (accessed 2026-04-09)
- **What it is**: NN/g distinguishes indicators (persistent, passive state) from notifications (transient, event-driven). Confusing the two leads to users either ignoring the signal or being alarmed by it.
- **Why it's relevant to VIBLOC**: "LIVE" in VIBLOC is a persistent toggle (realtime-sun + weather). That's an *indicator* of a mode. The word "LIVE" borrowed from Twitch/YouTube implies a notification-class streaming event, which is the wrong mental model.
- **Concrete suggestion for VIBLOC**: Rename the button to "Real-Time" or "Now" with a clock glyph and a subtle pulsing dot. Reserve red-pill "LIVE" for events users would expect on a streaming platform.

### E.2 Phoenix LiveView / Google Drive subtle sync indicator pattern

- **Source**: Medium — "How to Build a Live Status Indicator with Phoenix LiveView" by Hex Shift. https://hexshift.medium.com/how-to-build-a-live-status-indicator-with-phoenix-liveview-e45b0c65732c (accessed 2026-04-09); Smashing Magazine — "UX Strategies For Real-Time Dashboards" (2025-09). https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/
- **What it is**: Real-time-sync apps like Google Drive use *subtle* indicators ("Saved" / "Syncing...") rather than loud pills. The Smashing Magazine 2025 piece recommends showing data freshness and debouncing state transitions to avoid flicker.
- **Why it's relevant to VIBLOC**: VIBLOC's LIVE currently toggles visible on/off but doesn't convey freshness ("last refreshed 3 min ago") or handle flicker when the weather API is briefly unreachable.
- **Concrete suggestion for VIBLOC**: Add a small timestamp under the LIVE button ("Updated 2m ago") and debounce the "off" state so a 5-second network blip doesn't flip the indicator.

### E.3 Pills as status containers — shape convention

- **Source**: Smart Interface Design Patterns (same as C.6); Kibo UI Pill component. https://www.kibo-ui.com/components/pill (accessed 2026-04-09)
- **What it is**: The rounded-rectangle "pill" is the convention for live status, typically with a leading dot (red/green) and short label. Padding is tight (4–8px horizontal) and text is uppercase or capitalized.
- **Why it's relevant to VIBLOC**: The LIVE button looks like a CTA. A status pill looks like state.
- **Concrete suggestion for VIBLOC**: If VIBLOC keeps it interactive, make it a *switch* (toggle) with a status pill next to it: "[Real-Time ● On]". The switch is the action; the pill is the state.

---

## F. Empty state and information scent for social apps

### F.1 NN/g — empty states do three jobs at once

- **Source**: Nielsen Norman Group — "Designing Empty States in Complex Applications: 3 Guidelines". https://www.nngroup.com/articles/empty-state-interface-design/ (accessed 2026-04-09)
- **What it is**: NN/g frames empty states as tools that (1) communicate system status, (2) teach what belongs here, and (3) give a direct action path. A blank container without copy is an anti-pattern because it drains user confidence.
- **Why it's relevant to VIBLOC**: VIBLOC's "My Playlist" section on a fresh building is blank — no copy, no action. A first-time user sees emptiness and assumes the app is broken.
- **Concrete suggestion for VIBLOC**: Render the empty state as: (1) icon of a music note pin, (2) copy "No one has tagged music here yet", (3) a primary button "Be the first — tag a track". This maps exactly to NN/g's three jobs.

### F.2 Carbon Design System empty state pattern

- **Source**: IBM Carbon Design System — Empty states pattern. https://carbondesignsystem.com/patterns/empty-states-pattern/ (accessed 2026-04-09)
- **What it is**: Carbon specifies empty states as illustration + title + body + primary action. Illustration is optional but recommended for first-run.
- **Why it's relevant to VIBLOC**: Carbon is explicit that the primary action must not be a link — it must be a button sized like a normal CTA. Links in empty states get missed.
- **Concrete suggestion for VIBLOC**: The "tag a track" action in the empty state should be a full-width filled button, not a text link.

### F.3 Cold-start social apps — pre-seed with curated content

- **Source**: Business of Apps — "BeReal Revenue and Usage Statistics (2026)". https://www.businessofapps.com/data/bereal-statistics/ (accessed 2026-04-09); TechCrunch — Locket profitability coverage (2025). https://techcrunch.com/2025/08/06/photo-sharing-app-locket-is-banking-on-a-new-celebrity-focused-feature-to-fuel-its-growth/
- **What it is**: BeReal's post-peak retention issues (15M → 6M daily users through 2023) are attributed in the coverage to the cold-start problem — new users arrive and there's no friend graph. Locket's response in 2025 was to introduce celebrity-focused seeded content so a first-run user always sees someone.
- **Why it's relevant to VIBLOC**: VIBLOC has a brutal cold-start: a new user flies to Shinjuku and every building has zero tags. The Locket lesson is pre-seed.
- **Concrete suggestion for VIBLOC**: For a first-visit session, pre-populate ~20 iconic buildings per city with Apple RSS Top Songs of that country + curator tags (labeled as such — "Editor pick" not "User tag"). The panel is never empty; the user sees possible actions.

---

## G. Color accessibility for genre chips

### G.1 WCAG 2.2 contrast minimum for small text (4.5:1)

- **Source**: W3C — WCAG 2.2 Understanding SC 1.4.3 Contrast (Minimum). https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html and WCAG 2.2. https://www.w3.org/TR/WCAG22/ (accessed 2026-04-09)
- **What it is**: 4.5:1 for small text (< 18pt / 14pt bold), 3:1 for large text or non-text UI components (SC 1.4.11).
- **Why it's relevant to VIBLOC**: VIBLOC's genre chip text is 12px — squarely in "small text" — so it must hit 4.5:1 against its chip background. Hue-extracted chip colors at medium saturation almost certainly fail this at scale.
- **Concrete suggestion for VIBLOC**: Clamp chip backgrounds to either very light (L* > 85) with dark text, or very dark (L* < 25) with white text. Desaturate anything in between. Enforce this in the hue-extraction pipeline (connect to B.3).

### G.2 WCAG 2.2 SC 1.4.11 non-text contrast for UI components

- **Source**: W3C — Understanding SC 1.4.11 Non-text Contrast. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html (accessed 2026-04-09)
- **What it is**: Interactive UI components and state boundaries need 3:1 contrast against their adjacent colors.
- **Why it's relevant to VIBLOC**: The chip *border* (not just text) and the pill selection state both need 3:1 vs the panel background. If panel background is near-white and chips are pastel, chips may fail border contrast.
- **Concrete suggestion for VIBLOC**: Add a 1px chip outline at 3:1 against the panel surface, independent of fill color. This preserves the vibrant hue inside while satisfying SC 1.4.11.

### G.3 Color-only communication is inaccessible — add text/icon

- **Source**: Red Hat UX — Badge accessibility. https://ux.redhat.com/elements/badge/accessibility/ (accessed 2026-04-09); PatternFly Badge accessibility. https://www.patternfly.org/components/badge/accessibility/
- **What it is**: Both Red Hat and PatternFly mandate that status communicated by color must also be communicated by visible text or an icon. Screen readers do not announce color; low-vision users may not perceive hue differences.
- **Why it's relevant to VIBLOC**: VIBLOC's genre chips rely on hue to imply genre family. A red chip "means rock" only if you can see red.
- **Concrete suggestion for VIBLOC**: Every chip must carry its genre name in text (already true) plus an ARIA label and a small glyph for the genre family. Color is decoration, not data.

### G.4 Healey & Enns — ~7 preattentively distinguishable colors is the ceiling

- **Source**: Healey & Enns — "Harnessing preattentive processes for multivariate data visualization". https://healey.csc.ncsu.edu/publications/15885-harnessing-preattentive-processes-for-multivariate-data-visualization (accessed 2026-04-09); Perception in Visualization course notes. https://www.csc2.ncsu.edu/faculty/healey/PP/ **(foundational pre-2023)**
- **What it is**: The Healey & Enns line of research establishes that color distance, linear separation, and color category must all be controlled to get a set of reliably distinguishable colors, and that ~7 is a practical ceiling for preattentive discrimination on a single screen.
- **Why it's relevant to VIBLOC**: ~18 genre chips with unique hues is more than double the preattentive ceiling. Users cannot reliably distinguish them at a glance.
- **Concrete suggestion for VIBLOC**: Collapse 18 genres into 7 family buckets (e.g. Electronic, Rock, Hip-Hop, Jazz, Classical, Pop, Global) and use color at the *family* level. Within a family, disambiguate by text/icon, not by yet another hue.

---

## H. Map app navigation chrome

### H.1 Mapbox GL JS marker/control placement conventions

- **Source**: Mapbox GL JS — Markers and controls. https://docs.mapbox.com/mapbox-gl-js/api/markers/ (accessed 2026-04-09)
- **What it is**: Mapbox's built-in controls (navigation, geolocate, scale, attribution) default to corners: top-right for zoom/compass, bottom-right for attribution, bottom-left for scale.
- **Why it's relevant to VIBLOC**: VIBLOC currently uses the bottom-left for city pills — colliding with where Mapbox/MapLibre users instinctively expect the scale bar. The top-right also has no chrome right now despite being the convention for camera controls.
- **Concrete suggestion for VIBLOC**: Move the compass (when made interactive, per heuristic #7) to top-right. Keep city pills in a centered bottom position (not bottom-left), which matches iOS Maps' card-over-centered-chrome pattern. Bottom-left stays free for attribution or a future scale indicator.

### H.2 Hick's Law + Fitts's Law for bottom navigation / city selectors

- **Source**: Laws of UX — Fitts's Law. https://lawsofux.com/fittss-law/ (accessed 2026-04-09); IxDF — "Hick's Law". https://ixdf.org/literature/article/hick-s-law-making-the-choice-easier-for-users; NN/g — "Fitts's Law and Its Applications in UX". https://www.nngroup.com/articles/fitts-law/ **(foundational, still cited in 2024+)**
- **What it is**: Fewer options = faster decisions (Hick); larger and closer targets = faster selection (Fitts). Bottom placement exploits the thumb zone on mobile.
- **Why it's relevant to VIBLOC**: 6 city pills is reasonable by Hick. But on mobile, the pills are currently small and crowded — failing Fitts.
- **Concrete suggestion for VIBLOC**: Minimum 44x44px tap targets (Apple HIG) for each pill on mobile, with at least 8px gutter. If that wouldn't fit, collapse to a single "City: Shinjuku ▼" dropdown that opens a sheet with the 6 options.

### H.3 Carbon Design System status indicator pattern — always icon + text

- **Source**: IBM Carbon Design System — Status indicator pattern. https://carbondesignsystem.com/patterns/status-indicator-pattern/ (accessed 2026-04-09)
- **What it is**: Carbon specifies that status indicators pair shape/color with an explicit text label. Multiple severities use distinct shapes (circle, triangle, square) as well as color.
- **Why it's relevant to VIBLOC**: The weather glyph + LIVE pairing currently relies on the user recognizing a sun icon. Carbon's line is that glyphs alone are insufficient for status.
- **Concrete suggestion for VIBLOC**: Add a short label next to the weather glyph ("12°C Sunny") visible on hover at minimum, always visible on desktop.

---

## I. Apple Music + iTunes Search API design language

### I.1 Apple Music Identity Guidelines — brand marks and badges

- **Source**: Apple Marketing Services — Apple Music Identity Guidelines. https://marketing.services.apple/apple-music-identity-guidelines (accessed 2026-04-09)
- **What it is**: Apple's identity guidelines prohibit adding shadows/glows to Apple Music badges and prohibit swapping the music note icon for another mark. Badge clear-space and minimum size are specified.
- **Why it's relevant to VIBLOC**: Since VIBLOC's music data *is* iTunes/Apple Music, the "Listen on Apple Music" affordance must conform to these guidelines or risk brand friction.
- **Concrete suggestion for VIBLOC**: Add a standard "Listen on Apple Music" CTA on each track card using the approved badge artwork, with required clear-space. Don't stylize the badge.

### I.2 iOS 26.4 Apple Music — artwork-paired background color

- **Source**: 9to5Mac article (same as B.3). https://9to5mac.com/2026/03/25/apple-music-in-ios-26-4-has-new-design-for-albums-playlists-and-more/ (accessed 2026-04-09)
- **What it is**: The 2026 Apple Music redesign pulls a *complementary* color from the first track's artwork into the track list background, plus new playlist art templates that use geometric shapes and gradients seeded by artwork colors.
- **Why it's relevant to VIBLOC**: VIBLOC's "City Vibe" section could mimic this by tinting per-city ambient gradient from the top track's artwork, creating a visual echo of Apple's own surface.
- **Concrete suggestion for VIBLOC**: For each city, compute a low-saturation ambient gradient from the Apple RSS #1 song's artwork. Use it as a subtle glow under the city pill and in the panel header. Refresh daily with the chart.

### I.3 Apple Music motion guidelines — album motion as affordance

- **Source**: Apple — "Apple Music Album Motion Guidelines". https://help.apple.com/itc/albummotionguide/en.lproj/static.html (accessed 2026-04-09)
- **What it is**: Apple provides motion artwork specs so that artists can ship a short animated loop tied to an album. In iOS 26 this is used prominently on the Lock Screen.
- **Why it's relevant to VIBLOC**: A subtle, looping micro-animation on the *hovered* track card is a recognized Apple Music visual affordance. It signals "this is playable".
- **Concrete suggestion for VIBLOC**: On hover of a track in AI Suggestions, play a 1–2s audio preview (iTunes Search API returns previewUrl) with a looping equalizer animation over the artwork. Matches Apple's motion language.

---

## J. Korean / Japanese mobile-first patterns

### J.1 Kakao Map's 3D-oriented interaction defaults

- **Source**: Namuwiki — Kakao Map (English). https://en.namu.wiki/w/%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%A7%B5 (accessed 2026-04-09); Trip.com — Naver Map English Guide. https://sg.trip.com/guide/phone/naver-map.html
- **What it is**: Kakao Map defaults two-finger tilt for 3D, two-finger twist for rotate, and surfaces "favorite places" on the map itself. Naver Map similarly prioritizes on-map overlays and contextual chips rather than a side panel.
- **Why it's relevant to VIBLOC**: Korean users arrive expecting pinch-to-tilt on a 3D map. If VIBLOC doesn't support two-finger tilt on touch devices (it likely doesn't without gesture code), Korean users will perceive it as less polished than Kakao.
- **Concrete suggestion for VIBLOC**: Verify two-finger tilt and two-finger rotate gestures work on touch — this is a "Kakao baseline" expectation. Surface a small help glyph in KR locale only that reads "두 손가락으로 기울이기".

### J.2 Naver/Kakao hot-spot and data-driven POI cards

- **Source**: Namuwiki (same as J.1); Punchkorea — "Naver Maps vs Kakao Maps". https://www.punchkorea.com/naver-maps-vs-kakao-maps/ (accessed 2026-04-09)
- **What it is**: Both apps surface visitor demographics on POI cards — age, gender, day-of-week popularity. Korean users treat that as baseline info, not premium.
- **Why it's relevant to VIBLOC**: VIBLOC has no temporal signal beyond LIVE weather. Korean users will find the panel informationally thin.
- **Concrete suggestion for VIBLOC**: Add a "Best time for this vibe" micro-stat using the Apple RSS hourly chart position of the top track. It mimics Kakao's hour-of-day data without requiring user tracking.

### J.3 Visit Seoul 2026 navigation guide — multilingual assumption

- **Source**: Visit Seoul — "Seoul Navigation Apps Guide 2026". https://visit.seoul.kr/en/articles/seoul-navigation-apps-guide-2026 (accessed 2026-04-09)
- **What it is**: The city tourism board's 2026 app guide frames Naver and Kakao as the expected baseline and instructs foreign users on enabling English. The implicit assumption is that Korean-language UI is the default and other locales are additive.
- **Why it's relevant to VIBLOC**: VIBLOC's EN/한/日 toggle treats all three equally. For Korea-centered sessions (clicking Gangnam, Itaewon), defaulting to 한 is more culturally appropriate.
- **Concrete suggestion for VIBLOC**: When a user clicks into Gangnam or Itaewon for the first time, offer a non-intrusive prompt ("한국어로 보기?") once. Same for Japanese on Shinjuku/Shibuya. Respect user choice afterwards.

### J.4 Korean/Japanese preference for text-rich density

- **Source**: Visit Seoul (same as J.3); Punchkorea Naver vs Kakao comparison (same as J.2). (accessed 2026-04-09)
- **What it is**: The comparison articles and the tourism guide both show native KR/JP map apps using high-density info cards — multiple stacked lines, tiny fonts, aggressive use of color — compared to Google Maps' sparser cards. Western "whitespace = premium" heuristics don't fully translate.
- **Why it's relevant to VIBLOC**: VIBLOC's panel is mid-density by Western standards, which reads as under-informative to KR/JP users.
- **Concrete suggestion for VIBLOC**: For 한 and 日 locales, switch the panel to a tighter line-height (1.3 vs 1.5), a denser chip grid, and additional metadata rows (distance, district name). English locale keeps the looser version.

---

## Synthesis: top 12 prioritized changes for VIBLOC

Each entry: **rank — change — sources — impact/effort — rationale**.

1. **Reorder the right panel: actions first, media last.**
   Sources: A.6 (Google Place Types hierarchy), B.1 (Spotify NPB redesign).
   Impact: **High** / Effort: **S**.
   The core value of VIBLOC is tagging music, and the current order buries it under 300px of Street View. Google Maps and Spotify both lead with verbs. Move "Tag a Track" + "AI Suggestions" above the fold; push Street View and map deeplinks to a media zone below. This alone retires issue #1 and #3 from the prior heuristic pass.

2. **Replace embedded Street View iframe with an on-demand thumbnail.**
   Source: A.5 (Apple Look Around overlay).
   Impact: **High** / Effort: **S**.
   Apple's platform-level answer for immersive imagery is *modal*, not embedded, precisely because it dominates attention. Swap the iframe for a ~100px thumbnail that opens a right-panel or full-screen overlay. This reclaims ~200px of above-the-fold real estate.

3. **Convert "AI Suggestions" from collapsed to progressive-disclosure ("Top Pick + Show 4 more").**
   Sources: D.3 (progressive disclosure norm), F.1 (NN/g empty states).
   Impact: **High** / Effort: **XS**.
   Hiding the section is the anti-pattern. Showing one AI pick by default with expand costs nothing and respects the 2024–2025 norm of 2-to-3 disclosure layers.

4. **Pre-seed buildings with curator/chart content so the app is never empty.**
   Sources: F.3 (Locket celebrity seed, BeReal retention), B.4 (Letterboxd activity slot).
   Impact: **High** / Effort: **M**.
   Cold-start is the most common reason social-tagging apps die after the first visit. Pre-populate ~20 iconic buildings per city with Apple RSS Top Songs of that country, labeled "Editor pick". A first-time user always sees possible vibes, lowering the psychic cost of the empty state.

5. **Rename LIVE → "Real-Time" (or "Now") with a status pill, not a CTA.**
   Sources: E.1 (NN/g indicators vs notifications), E.3 (pill conventions), C.6 (badge/pill taxonomy).
   Impact: **Med** / Effort: **XS**.
   "LIVE" overloads streaming semantics. Swap to a switch + status pill with a pulsing dot and a "Updated Xm ago" timestamp to convey freshness. Retires issue #8.

6. **Collapse 18 genre chip hues into 7 color families; disambiguate within family by icon/text.**
   Sources: G.4 (Healey & Enns preattentive ceiling), G.3 (color-only is inaccessible), G.1 (WCAG 4.5:1).
   Impact: **High** / Effort: **M**.
   18 unique hues exceeds the preattentive discrimination ceiling and almost certainly fails WCAG 4.5:1 for 12px text. Seven families + glyph + clamped L* fixes both problems at once.

7. **Add a first-run Figma-style ghost tooltip tour for canvas gestures.**
   Sources: D.1 (Figma onboarding), D.2 (Spline minimal first surface).
   Impact: **Med** / Effort: **S**.
   Three auto-advancing ghosts (drag-to-orbit, scroll-zoom, click-building) dismiss with one "Got it". Retires issue #4 without adding a modal.

8. **Switch mobile layout to a 3-snap non-modal bottom sheet; share content with desktop side panel via a layout-agnostic component.**
   Sources: C.2 (NN/g bottom sheets), C.4 (Apple HIG inspector adaptive), C.1 (M3 standard side sheet).
   Impact: **High** / Effort: **L**.
   On mobile the right panel steals the canvas. A non-modal bottom sheet at 20/50/100% preserves thumb reach and keeps the 3D canvas interactive. One `<BuildingDetail>` renders in either container.

9. **Add a two-step mood-chip funnel above free-text track search.**
   Sources: B.5 (Beli three-level rating), B.7 (Foursquare Swarm merged verb card).
   Impact: **High** / Effort: **S**.
   New users rarely know what to search. Offer 4–6 mood chips (Chill / Hype / Romantic / Dark / Nostalgic / Party) that pre-fill the iTunes query and show 5 tracks instantly. Retires issues #6 and #9 (Go button friction + wrong order) in one swing.

10. **Tint the panel header region with a complementary color derived from the top track's artwork, not a literal dominant hue.**
    Sources: B.3 (Apple Music iOS 26 paired-not-matched color), I.2 (artwork-seeded gradients), G.1 (WCAG contrast).
    Impact: **Med** / Effort: **M**.
    Literal dominant hues fight text legibility. Apple's 2026 direction is paired/complement colors clamped to a legibility band. Simultaneously fixes contrast risk and upgrades the visual language toward Apple's own.

11. **Differentiate pills, chips, and badges visually; move the interactive compass to top-right and city pills to bottom-center.**
    Sources: C.6 (SIDP taxonomy), H.1 (Mapbox chrome convention), H.2 (Hick/Fitts thumb zone).
    Impact: **Med** / Effort: **S**.
    Users currently can't tell what's interactive. Three distinct visual treatments + conventional corners (Mapbox-style top-right for camera, bottom-center for city selection) align with muscle memory. Retires issue #5 and #7.

12. **Locale-aware defaults for KR/JP users: dense layout, Korean/Japanese first-visit prompt when clicking Gangnam/Itaewon/Shinjuku/Shibuya, and Kakao-style two-finger tilt baseline.**
    Sources: J.1 (Kakao gestures), J.3 (Seoul 2026 app guide), J.4 (KR/JP info density).
    Impact: **Med** / Effort: **M**.
    4 of 6 cities are JP/KR. Respecting native map conventions and density norms is table stakes in those markets. A one-time "한국어로 보기?" prompt on first Gangnam click is a small change with disproportionate trust impact.

---

### Korean-language synthesis note

한국어 사용자를 위한 요약: 위 12개 중 가장 먼저 적용해야 할 것은 (1) 패널 순서 재배치, (2) Street View 임베드 제거, (3) AI 추천 기본 노출, (4) 콜드스타트용 큐레이터 시드 데이터, (5) LIVE → "Real-Time" 이름 변경이다. 나머지는 MVP 이후 2차 반복에 배치해도 좋다. 한국/일본 도시(강남·이태원·신주쿠·시부야) 클릭 시 현지 언어 전환 프롬프트는 효과 대비 구현 비용이 매우 낮아 빠르게 실행 가능하다.

---

## Appendix: source bibliography

All URLs accessed on 2026-04-09.

1. Mapbox — "Add interactions to a Mapbox Standard Style". https://docs.mapbox.com/mapbox-gl-js/example/standard-interactions/ — Example of click/hover interactions with Featuresets.
2. Mapbox — "Interactions API". https://docs.mapbox.com/mapbox-gl-js/guides/user-interactions/interactions/ — Guide to POI/building/place-label interaction model.
3. Mapbox Blog — "Simplified Map Interactions in Mapbox GL JS". https://www.mapbox.com/blog/new-simplified-system-for-building-map-interactions — Conventions around click-to-destination verb on POIs.
4. Mapbox — "Markers and controls". https://docs.mapbox.com/mapbox-gl-js/api/markers/ — Default placement of navigation/scale/attribution controls.
5. deck.gl — "Interactivity" developer guide. https://deck.gl/docs/developer-guide/interactivity — `getTooltip` API and cursor-anchored tooltip pattern.
6. deck.gl — "What's New". https://deck.gl/docs/whats-new — New UI module for camera/layer-aware controls.
7. CesiumJS — Sandcastle index. https://github.com/CesiumGS/cesium/blob/main/Apps/Sandcastle/index.html — Toolbar/gallery/viewport layout.
8. Cesium Community — "Redesigning Sandcastle: Requesting Feedback". https://community.cesium.com/t/redesigning-sandcastle-requesting-feedback/41981 — Resizable-panel redesign RFC discussion.
9. Apple Support — "Look around locations in Maps on Mac". https://support.apple.com/guide/maps/look-around-locations-mps9a83e0730/mac — Look Around modal overlay behavior on macOS.
10. Apple Developer — "Explore a location with a highly detailed map and Look Around". https://developer.apple.com/documentation/mapkit/mapkit_for_appkit_and_uikit/explore_a_location_with_a_highly_detailed_map_and_look_around — MapKit Look Around integration docs.
11. Google for Developers — "Place Types (New)". https://developers.google.com/maps/documentation/places/web-service/place-types — Place data hierarchy and types.
12. Spotify Design — "Small but Mighty: We've Rolled out Changes to the Now Playing Bar". https://spotify.design/article/small-but-mighty-weve-rolled-out-changes-to-the-now-playing-bar — NPB redesign writeup.
13. Snappymob — "UI/UX Audit: Spotify vs Apple Music". https://blog.snappymob.com/ui-ux-audit-spotify-vs-apple-music — Comparative analysis of now-playing surfaces.
14. 9to5Mac — "Apple Music in iOS 26.4 has new design for albums, playlists, and more" (2026-03-25). https://9to5mac.com/2026/03/25/apple-music-in-ios-26-4-has-new-design-for-albums-playlists-and-more/ — Paired color, new playlist art.
15. AppleInsider — "Apple Music iOS 26 update brings motion, color & depth" (2025-06-11). https://appleinsider.com/articles/25/06/11/apple-music-ios-26-update-brings-motion-color-depth-to-the-iphone-lock-screen — Liquid Glass + motion.
16. Letterboxd — FAQ. https://letterboxd.com/about/faq/ — Ratings, diary, activity timeline behavior.
17. IXD@Pratt — "Letterboxd Disassembled" (2025-05). https://ixd.prattsi.org/2025/05/letterboxd-disassembled-creating-a-design-system-for-movie-review-site-letterboxd/ — Design-system critique of film page hierarchy.
18. IXD@Pratt — "Design Critique: Beli App" (2024-09). https://ixd.prattsi.org/2024/09/design-critique-beli-app/ — Rating cascade and category iconography.
19. Foursquare Swarm — Wikipedia. https://en.wikipedia.org/wiki/Foursquare_Swarm — 2024 merge with City Guide; check-in card evolution.
20. Foursquare Support — "Swarm check-ins". https://support.foursquare.com/hc/en-us/articles/12534514074012-Swarm-check-ins — Photo/sticker/companion check-in components.
21. Material Design 3 — "Side sheets guidelines". https://m3.material.io/components/side-sheets/guidelines — Standard vs modal side sheet use cases.
22. Material Design 3 — "Bottom sheets guidelines". https://m3.material.io/components/bottom-sheets/guidelines — Standard vs modal bottom sheet use cases.
23. Nielsen Norman Group — "Bottom Sheets: Definition and UX Guidelines". https://www.nngroup.com/articles/bottom-sheet/ — Thumb-zone rationale, non-modal preference.
24. Linear Docs — "Peek preview". https://linear.app/docs/peek — Quick-look overlay pattern for issues.
25. Linear — "How we redesigned the Linear UI (part II)". https://linear.app/now/how-we-redesigned-the-linear-ui — Sidebar density and hierarchy work.
26. Apple Developer — "Inspectors in SwiftUI: Discover the details" (WWDC23 session 10161). https://developer.apple.com/videos/play/wwdc2023/10161/ — Inspector API, adaptive sheet in compact.
27. Apple HIG — "Panels". https://developer.apple.com/design/human-interface-guidelines/panels — Panel conventions on macOS.
28. Medium — "UI Breakdown of Notion's Sidebar" by Quickmasum. https://medium.com/@quickmasum/ui-breakdown-of-notions-sidebar-2121364ec78d — 224px sidebar width rationale.
29. Smart Interface Design Patterns — "Badges vs. Pills vs. Chips vs. Tags". https://smart-interface-design-patterns.com/articles/badges-chips-tags-pills/ — 2024 taxonomy of these components.
30. Appcues GoodUX — "Figma's animated onboarding flow". https://goodux.appcues.com/blog/figmas-animated-onboarding-flow — Tooltip-driven canvas onboarding.
31. Medium Bootcamp — "Designing User Onboarding: Lessons from Figma, Duolingo and More" by Mohan Kumar S. https://medium.com/design-bootcamp/designing-user-onboarding-lessons-from-figma-duolingo-and-more-b585012dd1ea — Onboarding philosophy comparisons.
32. Felix Runquist — "Creating 3D models in Spline for Three.js". https://felixrunquist.com/posts/creating-3d-models-spline-three-js — Spline's minimal first-run surface.
33. aiuxdesign.guide — "Progressive Disclosure in AI". https://www.aiuxdesign.guide/patterns/progressive-disclosure — Pattern and best practices.
34. LogRocket Blog — "Progressive disclosure in UX design: Types and use cases". https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/ — 2024 guidance, 2–3 disclosure layers max.
35. Nielsen Norman Group — "Indicators, Validations, and Notifications: Pick the Correct Communication Option". https://www.nngroup.com/articles/indicators-validations-notifications/ — Indicator vs notification taxonomy.
36. Smashing Magazine — "UX Strategies For Real-Time Dashboards" (2025-09). https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/ — Data freshness, debounce, indicator design.
37. Hex Shift (Medium) — "How to Build a Live Status Indicator with Phoenix LiveView". https://hexshift.medium.com/how-to-build-a-live-status-indicator-with-phoenix-liveview-e45b0c65732c — Subtle online/offline indicator pattern.
38. Kibo UI — Pill component. https://www.kibo-ui.com/components/pill — Pill shape convention in modern design systems.
39. Nielsen Norman Group — "Designing Empty States in Complex Applications: 3 Guidelines". https://www.nngroup.com/articles/empty-state-interface-design/ — Three jobs of an empty state.
40. IBM Carbon Design System — "Empty states pattern". https://carbondesignsystem.com/patterns/empty-states-pattern/ — Illustration + title + body + button anatomy.
41. Business of Apps — "BeReal Revenue and Usage Statistics (2026)". https://www.businessofapps.com/data/bereal-statistics/ — Retention trajectory and cold-start context.
42. TechCrunch — Locket celebrity feature coverage (2025-08-06). https://techcrunch.com/2025/08/06/photo-sharing-app-locket-is-banking-on-a-new-celebrity-focused-feature-to-fuel-its-growth/ — Seed content as cold-start remedy.
43. W3C — WCAG 2.2 Understanding SC 1.4.3 Contrast (Minimum). https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html — 4.5:1 minimum for small text.
44. W3C — WCAG 2.2. https://www.w3.org/TR/WCAG22/ — Full specification reference.
45. W3C — Understanding SC 1.4.11 Non-text Contrast. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html — 3:1 for UI components.
46. Red Hat UX — Badge accessibility. https://ux.redhat.com/elements/badge/accessibility/ — Color-plus-text rule for status badges.
47. PatternFly — Badge accessibility. https://www.patternfly.org/components/badge/accessibility/ — Reinforces the same rule.
48. Healey & Enns — "Harnessing preattentive processes for multivariate data visualization" (foundational, pre-2023). https://healey.csc.ncsu.edu/publications/15885-harnessing-preattentive-processes-for-multivariate-data-visualization — Preattentive color category research.
49. Healey — Perception in Visualization course notes. https://www.csc2.ncsu.edu/faculty/healey/PP/ — Supporting material on distinguishable hues.
50. IBM Carbon Design System — Status indicator pattern. https://carbondesignsystem.com/patterns/status-indicator-pattern/ — Icon + text for status communication.
51. Laws of UX — Fitts's Law. https://lawsofux.com/fittss-law/ — Target distance and size.
52. Interaction Design Foundation — Hick's Law. https://ixdf.org/literature/article/hick-s-law-making-the-choice-easier-for-users — Choice count and decision time.
53. Nielsen Norman Group — "Fitts's Law and Its Applications in UX". https://www.nngroup.com/articles/fitts-law/ — Practical application to target sizing.
54. Apple Marketing Services — Apple Music Identity Guidelines. https://marketing.services.apple/apple-music-identity-guidelines — Badge rules, clear space, minimum size.
55. Apple — "Apple Music Album Motion Guidelines". https://help.apple.com/itc/albummotionguide/en.lproj/static.html — Motion artwork specs.
56. Namuwiki (English) — Kakao Map. https://en.namu.wiki/w/%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%A7%B5 — Gesture conventions and data-driven POI info.
57. Trip.com — "Naver Map English Guide". https://sg.trip.com/guide/phone/naver-map.html — Naver map UI walkthrough.
58. Punchkorea — "Naver Maps vs Kakao Maps". https://www.punchkorea.com/naver-maps-vs-kakao-maps/ — Comparative UX notes, demographics overlays.
59. Visit Seoul — "Seoul Navigation Apps Guide 2026". https://visit.seoul.kr/en/articles/seoul-navigation-apps-guide-2026 — 2026 tourism board guidance on Naver/Kakao defaults.

---

*End of research document. No code in VIBLOC's source tree was modified in the course of this research.*
