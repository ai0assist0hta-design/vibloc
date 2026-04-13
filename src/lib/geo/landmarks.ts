/**
 * Landmark building silhouette definitions.
 *
 * Each entry describes how to modify the default box-extrusion to create
 * a recognizable skyline silhouette. Matched by building name from OSM.
 *
 * All shapes use stepped setbacks (층층이 단이 지는 방식).
 * No smooth tapers or cone shapes — everything is flat-topped tiers.
 */

export type SetbackTier = {
  /** Fraction of total height where this tier starts (0..1) */
  startFrac: number;
  /** Scale factor for footprint at this tier (1 = full width, 0.5 = half) */
  scale: number;
};

export type LandmarkShape = {
  /** Stepped setback tiers — sorted by startFrac ascending */
  setbacks: SetbackTier[];
  /** Spire on top: [radiusFraction, heightMeters] */
  spire?: [number, number];
  /** Override height if OSM data is wrong/missing */
  heightOverride?: number;
};

export type LandmarkEntry = {
  /** Possible OSM name matches (lowercase, checked via includes) */
  names: string[];
  shape: LandmarkShape;
};

/**
 * Landmark registry. Each city area's notable buildings.
 * Names are checked case-insensitively against OSM building names.
 *
 * All silhouettes are stepped tiers (세트백). Real building proportions.
 */
export const LANDMARKS: LandmarkEntry[] = [
  // === SHINJUKU ===
  {
    // Tokyo Metropolitan Government Building — twin towers with upper notch
    names: ['東京都庁第一本庁舎', '東京都庁第二本庁舎', 'tokyo metropolitan government main building'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.33, scale: 0.92 },
        { startFrac: 0.75, scale: 0.82 },
      ],
      heightOverride: 243,
    },
  },
  {
    // NTT Docomo Yoyogi Building — stepped tower with narrowing upper section
    names: ['nttドコモ代々木', 'ntt docomo yoyogi', 'ドコモタワー'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.55, scale: 0.85 },
        { startFrac: 0.72, scale: 0.68 },
        { startFrac: 0.85, scale: 0.50 },
        { startFrac: 0.93, scale: 0.30 },
      ],
      spire: [0.02, 20],
      heightOverride: 272,
    },
  },
  {
    // Mode Gakuen Cocoon Tower — stepped narrowing tiers (not a smooth taper)
    names: ['コクーンタワー', 'cocoon tower', 'モード学園'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.2, scale: 0.95 },
        { startFrac: 0.4, scale: 0.88 },
        { startFrac: 0.6, scale: 0.82 },
        { startFrac: 0.8, scale: 0.75 },
        { startFrac: 0.92, scale: 0.68 },
      ],
      heightOverride: 204,
    },
  },
  {
    // Shinjuku Park Tower — three stepped tiers at top
    names: ['新宿パークタワー', 'shinjuku park tower'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.70, scale: 0.88 },
        { startFrac: 0.82, scale: 0.72 },
        { startFrac: 0.92, scale: 0.55 },
      ],
      heightOverride: 235,
    },
  },
  {
    // Sompo Japan Building — slight upper setback
    names: ['損保ジャパン', 'sompo japan', 'sompo'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.85, scale: 0.90 },
      ],
      heightOverride: 200,
    },
  },

  // === SHIBUYA ===
  {
    // Shibuya Scramble Square — tallest in Shibuya, clean slab with slight top setback
    names: ['渋谷スクランブルスクエア', 'scramble square'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.90, scale: 0.93 },
      ],
      heightOverride: 230,
    },
  },
  {
    // Shibuya Hikarie — stepped profile getting narrower
    names: ['渋谷ヒカリエ', 'hikarie'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.50, scale: 0.90 },
        { startFrac: 0.75, scale: 0.80 },
        { startFrac: 0.90, scale: 0.70 },
      ],
      heightOverride: 183,
    },
  },
  {
    // Cerulean Tower — slight upper tier
    names: ['セルリアンタワー', 'cerulean tower'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.80, scale: 0.92 },
      ],
      heightOverride: 184,
    },
  },

  // === GANGNAM ===
  {
    // Lotte World Tower — many stepped tiers narrowing toward top
    names: ['롯데월드타워', 'lotte world tower'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.15, scale: 0.92 },
        { startFrac: 0.30, scale: 0.84 },
        { startFrac: 0.45, scale: 0.75 },
        { startFrac: 0.60, scale: 0.65 },
        { startFrac: 0.75, scale: 0.55 },
        { startFrac: 0.85, scale: 0.45 },
        { startFrac: 0.93, scale: 0.35 },
      ],
      heightOverride: 555,
    },
  },
  {
    // Trade Tower (COEX) — clean slab with antenna
    names: ['트레이드타워', 'trade tower', 'coex'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.92, scale: 0.90 },
      ],
      spire: [0.02, 15],
      heightOverride: 228,
    },
  },
  {
    // Gangnam Finance Center — with antenna
    names: ['강남파이낸스센터', 'gangnam finance'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.88, scale: 0.92 },
      ],
      spire: [0.03, 20],
      heightOverride: 152,
    },
  },

  // === ITAEWON ===
  {
    // N Seoul Tower — stepped narrowing shaft
    names: ['n서울타워', '남산타워', 'namsan tower', 'n seoul tower', 'nseoultower'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.10, scale: 0.70 },
        { startFrac: 0.25, scale: 0.45 },
        { startFrac: 0.60, scale: 0.40 },
        { startFrac: 0.72, scale: 0.55 },  // observation deck widens
        { startFrac: 0.82, scale: 0.35 },
        { startFrac: 0.92, scale: 0.25 },
      ],
      spire: [0.015, 25],
      heightOverride: 236,
    },
  },

  // === MANHATTAN ===
  {
    // Empire State Building — classic Art Deco stepped setbacks + spire
    names: ['empire state'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.25, scale: 0.88 },
        { startFrac: 0.50, scale: 0.72 },
        { startFrac: 0.65, scale: 0.55 },
        { startFrac: 0.78, scale: 0.38 },
        { startFrac: 0.88, scale: 0.22 },
      ],
      spire: [0.015, 65],
      heightOverride: 443,
    },
  },
  {
    // Chrysler Building — Art Deco stepped + spire
    names: ['chrysler'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.60, scale: 0.82 },
        { startFrac: 0.72, scale: 0.65 },
        { startFrac: 0.82, scale: 0.48 },
        { startFrac: 0.90, scale: 0.30 },
        { startFrac: 0.95, scale: 0.15 },
      ],
      spire: [0.012, 40],
      heightOverride: 319,
    },
  },
  {
    // One Vanderbilt — stepped angular top
    names: ['one vanderbilt'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.55, scale: 0.88 },
        { startFrac: 0.70, scale: 0.72 },
        { startFrac: 0.82, scale: 0.52 },
        { startFrac: 0.92, scale: 0.30 },
      ],
      heightOverride: 427,
    },
  },
  {
    // 432 Park Avenue — ultra-slender square tube (no setbacks, just height)
    names: ['432 park'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
      ],
      heightOverride: 426,
    },
  },
  {
    // Bank of America Tower — stepped upper section + spire
    names: ['bank of america tower'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.70, scale: 0.82 },
        { startFrac: 0.82, scale: 0.60 },
        { startFrac: 0.92, scale: 0.35 },
      ],
      spire: [0.015, 30],
      heightOverride: 366,
    },
  },
  {
    // One World Trade Center (Freedom Tower) — stepped narrowing + tall spire
    names: ['one world trade', 'freedom tower', '1 world trade'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.25, scale: 0.95 },
        { startFrac: 0.50, scale: 0.88 },
        { startFrac: 0.70, scale: 0.78 },
        { startFrac: 0.85, scale: 0.65 },
        { startFrac: 0.93, scale: 0.50 },
      ],
      spire: [0.012, 124],
      heightOverride: 541,
    },
  },

  // === LOS ANGELES ===
  {
    // Wilshire Grand Center — stepped upper section + tall spire
    names: ['wilshire grand'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.80, scale: 0.85 },
        { startFrac: 0.92, scale: 0.65 },
      ],
      spire: [0.02, 50],
      heightOverride: 335,
    },
  },
  {
    // US Bank Tower — stepped upper crown
    names: ['u.s. bank tower', 'us bank tower', 'library tower'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.82, scale: 0.85 },
        { startFrac: 0.90, scale: 0.70 },
        { startFrac: 0.96, scale: 0.50 },
      ],
      heightOverride: 310,
    },
  },
  {
    // LA City Hall — Art Deco ziggurat steps
    names: ['los angeles city hall', 'la city hall'],
    shape: {
      setbacks: [
        { startFrac: 0.0, scale: 1.0 },
        { startFrac: 0.35, scale: 0.72 },
        { startFrac: 0.55, scale: 0.52 },
        { startFrac: 0.72, scale: 0.35 },
        { startFrac: 0.85, scale: 0.22 },
      ],
      heightOverride: 138,
    },
  },
];

/**
 * Find a landmark shape definition for a building by name.
 * Returns null if the building is not a known landmark.
 */
export function findLandmarkShape(buildingName: string): LandmarkShape | null {
  if (!buildingName || buildingName === 'Building') return null;
  const lower = buildingName.toLowerCase();
  for (const entry of LANDMARKS) {
    for (const name of entry.names) {
      if (lower.includes(name)) return entry.shape;
    }
  }
  return null;
}
