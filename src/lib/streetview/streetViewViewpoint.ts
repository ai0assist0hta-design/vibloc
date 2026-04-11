/**
 * Pick a Street View viewpoint that is *outside* a building polygon.
 *
 * Why this exists
 * ---------------
 * Google's Street View embed (`cbll=lat,lon`) snaps to the closest panorama
 * to the supplied point. For mid-block towers in dense areas (Shinjuku,
 * Gangnam), the building centroid is often closest to an INTERIOR arcade or
 * lobby pano — so the inline preview opens "inside" the building, which is
 * disorienting for the user who clicked on a 3D facade.
 *
 * Strategy: march radially outward from the centroid in 16 directions until
 * each ray leaves the footprint, pick the direction whose wall is closest
 * (that's the front/short side, most likely to face a street), step a fixed
 * buffer past that wall, and aim the camera back toward the building center.
 *
 * No road network is consulted — we just guarantee the query point is
 * outside the polygon. Empirically that's enough to flip Google's snap
 * from interior to street-side panos in the vast majority of cases, with
 * zero new dependencies and zero API calls.
 */

import type { OSMBuilding, OSMRoad } from '../geo/osmLoader';

/** Standard ray-casting point-in-polygon test (footprint is meters x/z). */
function pointInPolygon(px: number, pz: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi || 1e-9) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export type SVViewpoint = {
  /** Offset point in the same meters frame as `building.center`. */
  x: number;
  z: number;
  /** Compass heading in degrees (0=N, 90=E) — point the camera toward the building. */
  headingDeg: number;
};

const RAY_COUNT = 16;
const STEP = 1.5;            // meters between samples along a ray
const MAX_R = 80;            // give up after 80m — anything bigger isn't worth the snap risk
const BASE_BUFFER = 12;      // meters past the wall — ~one car lane / sidewalk
const HEIGHT_BUFFER_RATIO = 0.08; // tall tower → push further out so SV doesn't snap onto facade

function bufferFor(height: number): number {
  return Math.max(BASE_BUFFER, height * HEIGHT_BUFFER_RATIO);
}

/**
 * Shortest distance from point P to line segment AB, plus the closest
 * point on the segment. Standard projection + clamping.
 */
function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number; dist: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) {
    const ddx = px - ax;
    const ddz = pz - az;
    return { x: ax, z: az, dist: Math.sqrt(ddx * ddx + ddz * ddz) };
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const x = ax + t * dx;
  const z = az + t * dz;
  const ddx = px - x;
  const ddz = pz - z;
  return { x, z, dist: Math.sqrt(ddx * ddx + ddz * ddz) };
}

/**
 * Snap a raw viewpoint to the nearest OSM road polyline.
 *
 * Why this is the decisive fix
 * ----------------------------
 * Google Street View panoramas live *on roads* — cars drove down them. So
 * the guaranteed way to avoid snapping into an interior/lobby pano is to
 * hand Google a query point that IS on a road. We find the nearest
 * highway-tagged way, project the viewpoint onto it, and return that as
 * the query location. The heading is then aimed from that road point
 * straight at the building center.
 *
 * Performance: `roads` can be ~10k segments for a dense district, but
 * we only call this on click (once per panel open). A bbox pre-reject
 * could be added later if it becomes a bottleneck.
 *
 * Returns `null` when no road is within `maxDist` — caller should fall
 * back to the polygon-based outside viewpoint in that case.
 */
export function snapToNearestRoad(
  vpX: number,
  vpZ: number,
  buildingCenter: [number, number],
  roads: readonly OSMRoad[],
  maxDist = 60,
): SVViewpoint | null {
  if (!roads || roads.length === 0) return null;

  // Major-road only. We deliberately exclude `service`, `living_street`,
  // and `road` because those are the way-types under which Google's
  // pano coverage tends to be parking-garage / station-entrance /
  // arcade indoor captures rather than open road. Restricting to true
  // surface streets is the single biggest factor that stopped the
  // "지하철 내부" snaps in Tokyo and Seoul.
  const drivable = new Set([
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'unclassified',
    'residential',
    'motorway_link',
    'trunk_link',
    'primary_link',
    'secondary_link',
    'tertiary_link',
  ]);

  // Track the nearest segment overall, but record the segment endpoints
  // too — we need them to push the snap point AWAY from the projected
  // foot of perpendicular and toward the segment's MIDPOINT. Subway
  // stair entrances cluster at intersections (= segment endpoints), so
  // biasing toward the middle of a segment lands us on a clean stretch
  // of open road where Google's nearest pano is virtually always the
  // car-pano on the centreline.
  let best: {
    x: number; z: number; dist: number;
    ax: number; az: number; bx: number; bz: number;
  } | null = null;
  for (const r of roads) {
    if (!drivable.has(r.type)) continue;
    if (r.isTunnel) continue; // no street view in tunnels
    const pts = r.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const hit = closestPointOnSegment(vpX, vpZ, ax, az, bx, bz);
      if (hit.dist > maxDist) continue;
      if (!best || hit.dist < best.dist) {
        best = { x: hit.x, z: hit.z, dist: hit.dist, ax, az, bx, bz };
      }
    }
  }

  if (!best) return null;

  // Slide the snap point along the segment toward the midpoint, but
  // only as far as ~25 m (cap so we don't pull the camera into a
  // totally different stretch of street that no longer faces the
  // building). 25 m is roughly the distance from a typical metro
  // stair entrance to the nearest open lane, which is what we need to
  // clear.
  {
    const segDx = best.bx - best.ax;
    const segDz = best.bz - best.az;
    const segLen = Math.hypot(segDx, segDz);
    if (segLen > 0.5) {
      const mx = (best.ax + best.bx) * 0.5;
      const mz = (best.az + best.bz) * 0.5;
      const towardMidX = mx - best.x;
      const towardMidZ = mz - best.z;
      const towardMidLen = Math.hypot(towardMidX, towardMidZ);
      if (towardMidLen > 0.5) {
        const slide = Math.min(25, towardMidLen);
        best.x += (towardMidX / towardMidLen) * slide;
        best.z += (towardMidZ / towardMidLen) * slide;
      }
    }
  }

  const [cx, cz] = buildingCenter;
  const dx = cx - best.x;
  const dz = cz - best.z;
  // Compass bearing from road point toward building: atan2(east, -north).
  // In our frame east=+x, north=-z, so heading = atan2(dx, -dz).
  const headingRad = Math.atan2(dx, -dz);
  const headingDeg = (((headingRad * 180) / Math.PI) + 360) % 360;

  return { x: best.x, z: best.z, headingDeg };
}

export function pickOutsideViewpoint(building: OSMBuilding): SVViewpoint {
  const [cx, cz] = building.center;
  const fp = building.footprint;
  if (fp.length < 3) {
    return { x: cx, z: cz, headingDeg: 0 };
  }

  // Concave footprints (L-shape, courtyards) can leave the geometric centroid
  // OUTSIDE the polygon. In that case marching outward is meaningless — the
  // first sample exits immediately and we'd pick a point right next to the
  // center. Just use the center itself; Google will snap to whatever pano is
  // closest, which from outside the polygon is already the right answer.
  if (!pointInPolygon(cx, cz, fp)) {
    return { x: cx, z: cz, headingDeg: 0 };
  }

  let best: { ang: number; dist: number } | null = null;
  for (let i = 0; i < RAY_COUNT; i++) {
    const ang = (i / RAY_COUNT) * Math.PI * 2;
    // 0 rad = north (−z in our local frame); clockwise positive.
    const dx = Math.sin(ang);
    const dz = -Math.cos(ang);
    let d = STEP;
    let exited = false;
    while (d < MAX_R) {
      if (!pointInPolygon(cx + dx * d, cz + dz * d, fp)) {
        exited = true;
        break;
      }
      d += STEP;
    }
    if (!exited) continue;
    if (!best || d < best.dist) best = { ang, dist: d };
  }

  if (!best) return { x: cx, z: cz, headingDeg: 0 };

  const dx = Math.sin(best.ang);
  const dz = -Math.cos(best.ang);
  const buffer = bufferFor(building.height);
  // Final safety: extend the buffer until we're definitively outside the
  // polygon. Concave shapes (notch facing the picked direction) can otherwise
  // re-enter the footprint after the initial exit. Cap iterations so a
  // pathological footprint can't loop forever.
  let reach = best.dist + buffer;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!pointInPolygon(cx + dx * reach, cz + dz * reach, fp)) break;
    reach += buffer;
  }
  const x = cx + dx * reach;
  const z = cz + dz * reach;

  // Heading from the viewpoint back toward the building = best.ang + 180°.
  const headingDeg = (((best.ang * 180) / Math.PI) + 180 + 360) % 360;
  return { x, z, headingDeg };
}
