export const COUNTRY_COORDS = {
  Ukraine: [49.0, 32.0],
  Sudan: [15.5, 30.5],
  Gaza: [31.4, 34.3],
  Yemen: [15.5, 48.5],
  DRC: [-4.0, 24.0],
  Myanmar: [17.0, 96.0],
  Mali: [17.0, -4.0],
  Venezuela: [8.0, -66.0],
  Haiti: [18.9, -72.3],
  Afghanistan: [33.9, 67.7],
  Niger: [17.6, 8.1],
  Ethiopia: [9.1, 40.5],
  Somalia: [5.2, 46.2],
};

export const COUNTRY_ALIASES = {
  DRC: [
    "Democratic Republic of the Congo",
    "Congo, Dem. Rep.",
    "DR Congo",
    "Congo-Kinshasa",
    "Congo, the Democratic Republic of the",
  ],
  Gaza: ["Palestine", "Palestinian Territory", "West Bank and Gaza", "Palestinian Territories"],
  Somalia: ["Federal Republic of Somalia"],
};

function normalizeName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function namesRoughlyMatch(needle, candidate) {
  if (!needle || !candidate) return false;

  if (needle === candidate) return true;

  const nNorm = normalizeName(needle);
  const cNorm = normalizeName(candidate);
  if (!nNorm || !cNorm) return false;
  if (nNorm === cNorm) return true;

  // Token-overlap fallback for reordered long names (e.g. DRC naming variants).
  const nTokens = nNorm.split(" ");
  const cTokenSet = new Set(cNorm.split(" "));
  if (nTokens.length < 2) return false;

  const overlap = nTokens.filter((t) => cTokenSet.has(t)).length;
  return overlap / nTokens.length >= 0.8;
}

export function findFeature(features, name) {
  if (!features?.length || !name) return null;

  const needles = [name, ...(COUNTRY_ALIASES[name] || [])]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  return (
    features.find((f) => {
      const p = f.properties || {};
      const hay = [p.NAME, p.name, p.ADMIN, p.NAME_LONG, p.SOVEREIGNT, p.BRK_NAME, p.NAME_EN]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

      return needles.some((n) => hay.some((h) => namesRoughlyMatch(n, h)));
    }) ?? null
  );
}

function eachLonLat(geometry, cb) {
  if (!geometry) return;

  const walkRing = (ring) => {
    if (!Array.isArray(ring)) return;
    for (const point of ring) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const lon = Number(point[0]);
      const lat = Number(point[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) cb(lon, lat);
    }
  };

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates || []) walkRing(ring);
    return;
  }

  if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates || []) {
      for (const ring of poly || []) walkRing(ring);
    }
  }
}

function featureBBoxCenterLatLon(feature) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  const lons = [];

  eachLonLat(feature?.geometry, (lon, lat) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);

    let normLon = lon;
    while (normLon > 180) normLon -= 360;
    while (normLon < -180) normLon += 360;
    lons.push(normLon);
  });

  if (!lons.length || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) return null;

  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  let lonCenter;
  if (maxLon - minLon <= 180) {
    lonCenter = (minLon + maxLon) / 2;
  } else {
    const shifted = lons.map((lo) => (lo < 0 ? lo + 360 : lo));
    const minS = Math.min(...shifted);
    const maxS = Math.max(...shifted);
    lonCenter = (minS + maxS) / 2;
    if (lonCenter > 180) lonCenter -= 360;
  }

  const latCenter = (minLat + maxLat) / 2;
  return [latCenter, lonCenter];
}

export function getCountryLatLon(name, features) {
  if (!name) return null;

  if (COUNTRY_COORDS[name]) return COUNTRY_COORDS[name];

  const feat = findFeature(features, name);
  if (!feat) return null;

  return featureBBoxCenterLatLon(feat);
}
