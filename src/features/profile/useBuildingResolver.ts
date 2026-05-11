/**
 * Resolves a pinned building's OSM id → {cityKey, name} so MyPage and
 * the playlist detail page can show "신주쿠, 도쿄도청사" instead of
 * the raw "#23139021". Loads all 6 cities in parallel on mount; the
 * browser HTTP cache makes repeat hydrations near-free.
 */

import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/app/i18n';
import { CITY_AREAS, fetchOSMBuildings, type CityAreaKey } from '@/lib/geo/osmLoader';

export type BuildingInfo = { cityKey: CityAreaKey; name: string };

function shortBuildingId(id: string): string {
  if (id.startsWith('way/')) return `#${id.slice(4)}`;
  if (id.startsWith('node/')) return `#${id.slice(5)}`;
  if (id.startsWith('relation/')) return `#${id.slice(9)}`;
  if (id.length > 10) return `#${id.slice(-8)}`;
  return `#${id}`;
}

export type BuildingResolver = {
  /** Map<buildingId, info> — empty Map until hydrated. */
  index: Map<string, BuildingInfo>;
  /** Synchronous lookup. */
  info: (buildingId: string) => BuildingInfo | null;
  /** "신주쿠, 도쿄도청사" — i18n-translated city + OSM name (with id fallback). */
  format: (buildingId: string) => string;
  /** Just the translated city ("신주쿠") or null when unresolved. */
  cityLabel: (buildingId: string) => string | null;
  /** Just the building name ("도쿄도청사") or short id fallback. */
  name: (buildingId: string) => string;
  /** True once the 6-city payloads have all settled. */
  ready: boolean;
};

/* localStorage cache for the resolved id → {cityKey, name} index.
 *
 * The first time the user lands on MyPage / playlist detail we still
 * have to fetch the 6 OSM city payloads (~hundreds of KB each), and
 * during that ~1-3 s fallback IDs ("#155260654") flash before the
 * real names ("도쿄도청사") settle. Caching the index in localStorage
 * lets every subsequent visit render the final name instantly — no
 * async race, no flash.
 *
 * The cache is keyed by a small payload version so a city dataset
 * update can invalidate every client without a manual purge. */
const CACHE_KEY = 'vibloc.bldg-resolver.v1';

type CachedIndex = Array<[string, BuildingInfo]>;

function loadCachedIndex(): Map<string, BuildingInfo> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedIndex;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return new Map(parsed);
  } catch {
    return null;
  }
}

/** Read the user's pinned building IDs from the playlists store —
 *  these are the ONLY entries we need to cache. Caching the entire
 *  6-city OSM index ( > 5 MB ) blew localStorage quota; the user
 *  only ever needs the subset they've actually pinned, which is
 *  typically dozens, not 50,000+. */
function pinnedBuildingIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem('vibloc.playlists.v1');
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return new Set(Object.keys(parsed));
  } catch {
    return new Set();
  }
}

function saveCachedIndex(index: Map<string, BuildingInfo>): void {
  if (typeof window === 'undefined') return;
  // Debug breadcrumbs (writes to window) so we can verify execution
  // path during dev testing — these are pure side-effect tags and
  // get tree-shaken / no-op'd when not inspected.
  const w = window as unknown as { __vbResolverSave?: { state: string; idxSize?: number; pinned?: number; subset?: number; err?: string } };
  w.__vbResolverSave = { state: 'enter', idxSize: index.size };
  try {
    const pinned = pinnedBuildingIds();
    w.__vbResolverSave.pinned = pinned.size;
    if (pinned.size === 0) { w.__vbResolverSave.state = 'no-pinned'; return; }
    const subset: CachedIndex = [];
    for (const [id, info] of index) {
      if (pinned.has(id)) subset.push([id, info]);
    }
    w.__vbResolverSave.subset = subset.length;
    if (subset.length === 0) { w.__vbResolverSave.state = 'no-subset'; return; }
    localStorage.setItem(CACHE_KEY, JSON.stringify(subset));
    w.__vbResolverSave.state = 'saved';
  } catch (e) {
    w.__vbResolverSave!.state = 'error';
    w.__vbResolverSave!.err = e instanceof Error ? e.message : String(e);
  }
}

/* Module-level in-memory cache. Survives navigation within the same
 * session (MyPage → PlaylistDetail and back) so the second visit
 * resolves names instantly without re-fetching + re-parsing the
 * 6-city OSM payloads. Reset only on full page reload. */
let _memIndex: Map<string, BuildingInfo> | null = null;
let _memPromise: Promise<Map<string, BuildingInfo>> | null = null;

function loadFullIndex(): Promise<Map<string, BuildingInfo>> {
  if (_memIndex) return Promise.resolve(_memIndex);
  if (_memPromise) return _memPromise;
  const cityKeys = Object.keys(CITY_AREAS) as CityAreaKey[];
  _memPromise = Promise.all(
    cityKeys.map((cityKey) =>
      fetchOSMBuildings(cityKey)
        .then((buildings) => ({ cityKey, buildings }))
        .catch(() => ({ cityKey, buildings: [] as Awaited<ReturnType<typeof fetchOSMBuildings>> })),
    ),
  ).then((results) => {
    const next = new Map<string, BuildingInfo>();
    for (const { cityKey, buildings } of results) {
      for (const b of buildings) {
        if (!next.has(b.id)) next.set(b.id, { cityKey, name: b.name });
      }
    }
    _memIndex = next;
    return next;
  });
  return _memPromise;
}

export function useBuildingResolver(): BuildingResolver {
  const t = useT();
  // Three-tier hydration order — fastest first:
  //   1. In-memory module cache (survives same-session navigation)
  //   2. localStorage cache (survives full reloads)
  //   3. Async fetch (first visit / cache miss)
  const [index, setIndex] = useState<Map<string, BuildingInfo>>(
    () => _memIndex ?? loadCachedIndex() ?? new Map(),
  );
  const [ready, setReady] = useState<boolean>(
    () => _memIndex !== null || loadCachedIndex() !== null,
  );

  useEffect(() => {
    let cancelled = false;
    loadFullIndex().then((next) => {
      if (cancelled) return;
      setIndex((prev) => (next.size > prev.size ? next : prev));
      setReady(true);
      if (next.size > 0) saveCachedIndex(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo<BuildingResolver>(() => {
    const info = (buildingId: string): BuildingInfo | null =>
      index.get(buildingId) ?? null;

    const cityLabel = (buildingId: string): string | null => {
      const i = info(buildingId);
      return i ? t(`city.${i.cityKey}`) : null;
    };

    const name = (buildingId: string): string => {
      const i = info(buildingId);
      // While the OSM index is still loading we'd otherwise emit
      // "#155260654" — that's the ugly flash the user sees right
      // before the real name appears. Returning an empty string when
      // we KNOW the resolver hasn't finished yet keeps the header
      // calm (sub-text shows the meta line, the building title just
      // pops in once). After ready, the short-id fallback is still
      // the right thing for genuinely unresolved buildings.
      if (!i) return ready ? shortBuildingId(buildingId) : '';
      const raw = (i.name || '').trim();
      const isGeneric = !raw || raw === 'Building';
      return isGeneric ? shortBuildingId(buildingId) : raw;
    };

    const format = (buildingId: string): string => {
      const i = info(buildingId);
      if (!i) return ready ? shortBuildingId(buildingId) : '';
      const city = t(`city.${i.cityKey}`);
      const n = name(buildingId);
      return n ? `${city}, ${n}` : city;
    };

    return { index, info, format, cityLabel, name, ready };
  }, [index, ready, t]);
}
