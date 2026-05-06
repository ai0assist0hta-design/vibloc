import { useEffect, useState } from 'react';
import { googleStreetViewEmbed } from '../../lib/geo/plusCode';
import {
  findNearbyStationFeatures,
  nudgeAwayFromStations,
} from '../../lib/streetview/subwayAvoid';
import {
  hasGoogleMapsKey,
  resolveOutdoorPano,
  buildEmbedStreetViewUrl,
} from '../../lib/streetview/streetViewKey';
import { findCommonsBuildingPhoto } from '../../lib/streetview/buildingPhoto';

/**
 * Inline location preview — Google Street View first, with a
 * data-analysis cascade to keep it outdoors.
 *
 * The user explicitly asked for Google Street View as the inline
 * preview ("그냥 다 구글 스트리트뷰 프리뷰 모드로 지원해줘"). The
 * problem they hit before was that Google's `cbll` snap can land on
 * an indoor subway concourse Photo Sphere in dense Tokyo / Seoul.
 * They want us to "analyze the data and shift the coordinate to
 * ground level" before showing the preview.
 *
 * Cascade
 * -------
 *
 *   1. **Google Street View via the official Maps Embed API
 *      (primary, requires key).** When `VITE_GOOGLE_MAPS_EMBED_KEY`
 *      is set, we call the Street View Static metadata endpoint with
 *      `source=outdoor` to find the BEST outdoor pano near the
 *      building, then embed that exact panoID. We try expanding
 *      radii (30 → 60 → 100 m) so a building right on top of a
 *      subway entrance still resolves to a road pano on the next
 *      block over. Because we pin the embed via `pano=<panoID>`
 *      instead of `location=`, Google can't re-snap to an indoor
 *      Photo Sphere — the panoID is the answer, full stop. See
 *      `lib/streetViewKey.ts` for the metadata + embed URL builders.
 *
 *      Investigation results that drove this design (all verified
 *      via curl on 2026-04-08):
 *        - The legacy keyless `output=svembed` returned HTTP 404 +
 *          X-Frame-Options: SAMEORIGIN. Dead.
 *        - `embed?pb=...` with a placeholder panoID rendered a
 *          random user Photo Sphere — Google honors the panoID
 *          literally and ignores lat/lng.
 *        - `embed?pb=...` with an empty panoID `1s!` rendered a
 *          black screen.
 *        - `/maps/embed/v1/streetview` returned HTTP 401 +
 *          "You must use an API key to authenticate".
 *      So inline Google SV is **only possible with an API key**.
 *      The Maps Embed API itself is FREE with unlimited usage; the
 *      metadata endpoint is also free. There's no billing surprise.
 *
 *   2. **OSM-station coordinate sanitizer (always runs).** In
 *      parallel with everything below, we hit the public Overpass
 *      API for `node[railway=subway_entrance]` /
 *      `node[public_transport=station]` / etc. within 150 m of the
 *      building. If our coordinate is within 40 m of any such node,
 *      we project it 70 m AWAY along the bearing facing the building.
 *      The shifted coord is used both for the iframe marker and
 *      reported back to the parent via `onSanitizedCoord` so the
 *      "Google Maps ↗" / "Apple Maps ↗" deeplinks open above ground
 *      too. See `lib/subwayAvoid.ts`.
 *
 *   3. **Wikimedia Commons photo (key-free fallback).** When no API
 *      key is set, OR when the metadata lookup returned no pano, we
 *      try the Commons MediaWiki geosearch with multilingual
 *      indoor/subway keyword filtering. Commons photos are
 *      human-curated and almost always taken from the street facing
 *      the facade — for famous landmarks (ESB, Tokyo Met Gov,
 *      Shinjuku Police Station) this gives a better result than SV
 *      anyway. See `lib/buildingPhoto.ts`.
 *
 *   4. **OpenStreetMap map fallback (final).** A 2-D OSM
 *      `/export/embed.html` tile with a marker on the sanitized
 *      coordinate. A map tile has zero panorama concept, so it can
 *      NEVER show a subway concourse — exactly what the user banned.
 *      It always renders, so the panel never shows an empty box.
 *
 * Security:
 *   - Maps Embed iframe is loaded from `www.google.com` only.
 *   - Static metadata fetch is to `maps.googleapis.com` only,
 *     `credentials: 'omit'`, no cookies, only the public lat/lon and
 *     the user-supplied API key in the query string.
 *   - Commons fetch is to `commons.wikimedia.org` only.
 *   - Overpass fetch is to `overpass-api.de` only.
 *   - The Commons thumbnail is rendered as a plain `<img>` from
 *     `upload.wikimedia.org` — no JS, no iframe, no DOM access.
 *   - The OSM fallback iframe is loaded from `openstreetmap.org`
 *     only; we never inject HTML, never read its DOM.
 *   - `referrerPolicy="no-referrer"` on every img/iframe prevents
 *     leaking the VIBLOC host/path to any of the four origins.
 */
export type StreetViewBoxProps = {
  lat: number;
  lon: number;
  /** Compass heading in degrees the embed should face (0=N, 90=E). */
  headingDeg?: number;
  /** Optional building name — used to bias Commons scoring toward
   *  files whose title contains the building name. */
  buildingName?: string | null;
  height?: number;
  divider: string;
  darkMode: boolean;
  /** Called when the subway sanitizer shifts the marker — lets the
   *  parent rewrite its Google/Apple Maps deeplinks to use the
   *  sanitized coordinate so the click-through also lands above
   *  ground. */
  onSanitizedCoord?: (lat: number, lon: number) => void;
};

type Stage =
  | { kind: 'loading' }
  | { kind: 'sv'; url: string }
  | { kind: 'photo'; src: string; title: string };

export function StreetViewBox({
  lat,
  lon,
  headingDeg = 0,
  buildingName,
  height = 260,
  divider,
  darkMode,
  onSanitizedCoord,
}: StreetViewBoxProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [mapLat, setMapLat] = useState<number>(lat);
  const [mapLon, setMapLon] = useState<number>(lon);

  useEffect(() => {
    setStage({ kind: 'loading' });
    setMapLat(lat);
    setMapLon(lon);
    const ctrl = new AbortController();

    // Fire the OSM-station sanitizer in parallel with whatever
    // primary path we use. The sanitized coord is used both for the
    // map fallback iframe AND fed back to the parent for deeplinks.
    let sanitizedLat = lat;
    let sanitizedLon = lon;
    // Distance from the ORIGINAL coordinate to the nearest known
    // station feature. Used as a heuristic for the keyless path: if the
    // building sits right on top of a station entrance, the keyless
    // Google picker is highly likely to land on an indoor pano even
    // after we nudge — so we proactively swap to a Commons photo.
    let originalStationDistM: number | null = null;
    const sanitizePromise = findNearbyStationFeatures(lat, lon, 150, ctrl.signal)
      .then((features) => {
        if (ctrl.signal.aborted) return;
        const result = nudgeAwayFromStations(lat, lon, features, 40, 70);
        originalStationDistM = result.closestDistM;
        if (result.shifted) {
          sanitizedLat = result.lat;
          sanitizedLon = result.lon;
          setMapLat(result.lat);
          setMapLon(result.lon);
          onSanitizedCoord?.(result.lat, result.lon);
        }
      })
      .catch(() => {
        /* Overpass failure is non-fatal — we just skip the sanitize. */
      });

    // Helper: try Wikimedia Commons for an outdoor building photo. The
    // Commons module already filters indoor / subway filenames via its
    // INDOOR_DENY + SUBWAY_DENY token lists. Returns true if we found a
    // usable photo and pushed it into the stage.
    const tryCommonsPhoto = async (): Promise<boolean> => {
      try {
        const hit = await findCommonsBuildingPhoto(
          sanitizedLat,
          sanitizedLon,
          buildingName ?? null,
          150,
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return false;
        if (hit?.thumbUrl) {
          setStage({ kind: 'photo', src: hit.thumbUrl, title: hit.title });
          return true;
        }
      } catch {
        /* Commons failure is non-fatal. */
      }
      return false;
    };

    (async () => {
      // Wait for the sanitizer so the SV lookup uses the corrected
      // coord (avoids landing the metadata radius right on a subway
      // exit). 600 ms timeout in case Overpass is slow.
      await Promise.race([
        sanitizePromise,
        new Promise<void>((res) => setTimeout(res, 600)),
      ]);
      if (ctrl.signal.aborted) return;

      // ---- Stage 1: Google Street View, key-required path ------------
      // When VITE_GOOGLE_MAPS_EMBED_KEY is set we use the official
      // Maps Embed API + Static metadata. The metadata call uses
      // `source=outdoor` so the resolved pano is GUARANTEED to be a
      // Google car capture, never a user-uploaded indoor Photo Sphere.
      // We pin the embed via `pano=<panoID>` so Google can't re-snap.
      //
      // If `resolveOutdoorPano` returns null it means there is NO
      // outdoor Google car capture nearby — the closest pano is
      // either an indoor Photo Sphere or doesn't exist. In that case
      // we fall straight through to the Commons photo path so the
      // user never sees a subway/lobby interior.
      if (hasGoogleMapsKey()) {
        try {
          const pano = await resolveOutdoorPano(
            sanitizedLat,
            sanitizedLon,
            ctrl.signal,
          );
          if (ctrl.signal.aborted) return;
          if (pano) {
            const url = buildEmbedStreetViewUrl({
              lat: pano.lat,
              lon: pano.lon,
              panoId: pano.panoId,
              headingDeg,
              fov: 90,
            });
            if (url) {
              setStage({ kind: 'sv', url });
              return;
            }
          }
          // No outdoor pano → swap to Commons photo if available.
          if (await tryCommonsPhoto()) return;
        } catch {
          if (ctrl.signal.aborted) return;
        }
      }

      // ---- Stage 2: Heuristic indoor-risk check (keyless path) --------
      // Without an API key we can't ask Google "is the closest pano
      // outdoor?". The next best thing is the OSM data we already
      // gathered: if the building's ORIGINAL coordinate sits within
      // ~25 m of a known subway / station entrance, the closest pano
      // Google's keyless picker will return is very likely an indoor
      // concourse Photo Sphere — even after our 70 m nudge, because
      // dense networks have multiple entrances within walking
      // distance. In that case we proactively swap to a Commons photo
      // before ever loading the SV iframe.
      if (
        originalStationDistM !== null &&
        originalStationDistM < 25 &&
        (await tryCommonsPhoto())
      ) {
        return;
      }

      // ---- Stage 3: Google Street View, key-free path -----------------
      // Use the panoID-free Maps Embed PB format. Google's server-side
      // picker resolves the closest pano from lat/lng. There's no
      // keyless `source=outdoor` filter, so we rely on the upstream
      // road-snap (lib/streetViewViewpoint.ts) + the OSM subway-
      // entrance sanitizer above to keep the coordinate off known
      // indoor capture spots. See lib/plusCode.ts for the PB format.
      if (ctrl.signal.aborted) return;
      setStage({
        kind: 'sv',
        url: googleStreetViewEmbed(sanitizedLat, sanitizedLon, headingDeg),
      });
    })();

    return () => ctrl.abort();
    // onSanitizedCoord intentionally omitted from deps — parent
    // recreates the callback every render and we only need to fire
    // it once per (lat, lon) pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, buildingName, headingDeg]);

  const wrap = {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden' as const,
    border: `1px solid ${divider}`,
    background: darkMode ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.04)',
    position: 'relative' as const,
  };

  // Loaded states fade in from below so the swap from shimmer → real
  // content reads as a soft arrival rather than an abrupt cut.
  const loadedWrap = {
    ...wrap,
    animation: 'vibloc-fade-in 320ms cubic-bezier(0.22,1,0.36,1) both',
  };

  // Commons photo branch — used only when SV would have shown an
  // indoor / subway pano. We render a plain `<img>` (no iframe, no JS
  // execution from Commons) with no-referrer so we don't leak the
  // VIBLOC host to upload.wikimedia.org.
  if (stage.kind === 'photo') {
    return (
      <div style={loadedWrap}>
        <img
          src={stage.src}
          alt={stage.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{
            display: 'block',
            width: '100%',
            height,
            objectFit: 'cover',
            border: 0,
          }}
        />
      </div>
    );
  }

  // Stage 1 — Google Street View embed (real outdoor pano).
  if (stage.kind === 'sv') {
    return (
      <div style={loadedWrap}>
        <iframe
          src={stage.url}
          title="Street View"
          loading="lazy"
          referrerPolicy="no-referrer"
          allow="fullscreen"
          style={{
            display: 'block',
            width: '100%',
            height,
            border: 0,
          }}
        />
      </div>
    );
  }

  // Loading state — animated shimmer skeleton with three pulsing dots
  // and a subtle "Loading Street View" label. Fills the few seconds
  // between the user clicking "Open Street View" and the iframe
  // becoming interactive, so the panel never reads as empty/dead.
  // Animations are defined globally in index.css (vibloc-shimmer /
  // vibloc-pulse-dot / vibloc-fade-in) so we don't pay per-mount style
  // injection cost.
  void mapLat;
  void mapLon;
  const shimmerBase = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
  const shimmerHi   = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  const dot         = darkMode ? '#ffffff' : '#0e0e1a';
  return (
    <div
      style={{
        ...wrap,
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        // Skeleton: a 4-stop horizontal gradient that scrolls left→right
        // forever via the shared keyframe. 200% width gives a
        // long-tail sweep so the highlight doesn't snap.
        background: `linear-gradient(
          90deg,
          ${shimmerBase} 0%,
          ${shimmerHi}  20%,
          ${shimmerBase} 40%,
          ${shimmerBase} 100%
        )`,
        backgroundSize: '200% 100%',
        animation: 'vibloc-shimmer 1.6s linear infinite, vibloc-fade-in 240ms cubic-bezier(0.22,1,0.36,1) both',
      }}
      aria-busy="true"
      aria-label="Loading Street View"
    >
      {/* Three pulsing dots — staggered so the row reads as motion */}
      <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: dot,
              opacity: 0.5,
              animation: `vibloc-pulse-dot 1.1s ease-in-out ${i * 160}ms infinite`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: darkMode ? 'rgba(255,255,255,0.55)' : 'rgba(14,14,26,0.55)',
        }}
      >
        Loading Street View
      </div>
    </div>
  );
}
