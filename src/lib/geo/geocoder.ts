export type GeoResult = {
  lat: number;
  lon: number;
  displayName: string;
};

export async function geocodeAddress(query: string): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(query)}` +
    `&format=json&limit=5&addressdetails=1`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'VIBLOC/1.0' },
  });
  // Nominatim returns an array of result objects. We only consume
  // three fields, so a narrow shape is enough — keeps the function
  // usable even when Nominatim adds new properties in the future.
  type NominatimHit = {
    lat: string;
    lon: string;
    display_name: string;
  };
  const results = (await res.json()) as NominatimHit[] | null;

  if (!results || results.length === 0) return null;

  // Prefer results in Japan or South Korea
  const preferred = results.find((r) =>
    r.display_name?.includes('Japan') ||
    r.display_name?.includes('日本') ||
    r.display_name?.includes('South Korea') ||
    r.display_name?.includes('대한민국')
  );

  const best = preferred || results[0];

  return {
    lat: parseFloat(best.lat),
    lon: parseFloat(best.lon),
    displayName: best.display_name,
  };
}

// Convert lat/lon to meters relative to area reference
export function geoToLocalMeters(
  lat: number,
  lon: number,
  refLat: number,
  refLon: number
): [number, number] {
  const x = (lon - refLon) * 111320 * Math.cos((refLat * Math.PI) / 180);
  const z = (lat - refLat) * 110540;
  return [x, z];
}

