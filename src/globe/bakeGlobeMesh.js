import { createCurvedCountryGeometryData, createPolygonLineData } from "./geo.js";

export function bakeGlobeMesh(geoJson, options = {}) {
  const radius = options.radius || 5;
  const style = {
    palette: options.palette || ["#76a9c7", "#a1c181", "#f0b36a", "#9bb7d4", "#d6a4a4", "#8fb9a8", "#d8c76f"],
    outlineColor: parseColor(options.outlineColor || "#17211c"),
    outlineOpacity: Number(options.outlineOpacity ?? 0.45)
  };
  const quality = qualityOptions(options.quality || "balanced");

  const countries = geoJson.features
    .map((feature) => bakeCountry(feature, radius, style, quality))
    .filter(Boolean);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "assets/country-outlines.geo.json",
    radius,
    quality: options.quality || "balanced",
    style,
    countries
  };
}

function bakeCountry(feature, radius, style, quality) {
  if (!feature.geometry) return null;

  const color = pickColor(feature.properties.iso_a3 || feature.properties.name, style.palette);
  const meshes = [];
  const outlines = [];

  const processPolygon = (rings) => {
    const polygonRings = Array.isArray(rings[0]?.[0]) ? rings : [rings];
    const mesh = createCurvedCountryGeometryData(polygonRings, radius, quality);
    if (mesh) meshes.push(mesh);

    polygonRings.forEach((ring) => {
      const line = createPolygonLineData(ring, radius);
      if (line) outlines.push(line);
    });
  };

  if (feature.geometry.type === "Polygon") {
    processPolygon(feature.geometry.coordinates);
  }

  if (feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates.forEach(processPolygon);
  }

  if (!meshes.length && !outlines.length) return null;

  return {
    id: feature.properties.iso_a3 || feature.properties.adm0_a3 || feature.properties.name,
    properties: feature.properties,
    color,
    pickSize: getFeatureBoundsArea(feature),
    meshes,
    outlines
  };
}

function qualityOptions(quality) {
  if (quality === "fast") return { stepMultiplier: 1.7, maxInteriorPoints: 90 };
  if (quality === "high") return { stepMultiplier: 0.85, maxInteriorPoints: 360 };
  return { stepMultiplier: 1.15, maxInteriorPoints: 180 };
}

function pickColor(value = "", palette) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }

  return parseColor(palette[Math.abs(hash) % palette.length]);
}

function parseColor(value) {
  if (typeof value === "number") return value;
  return Number.parseInt(String(value).replace("#", ""), 16);
}

function getFeatureBoundsArea(feature) {
  const bounds = { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity };
  visitCoordinates(feature.geometry.coordinates, ([lon, lat]) => {
    bounds.minLon = Math.min(bounds.minLon, lon);
    bounds.maxLon = Math.max(bounds.maxLon, lon);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  });

  if (!Number.isFinite(bounds.minLon)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0.000001, (bounds.maxLon - bounds.minLon) * (bounds.maxLat - bounds.minLat));
}

function visitCoordinates(coordinates, visitor) {
  if (typeof coordinates?.[0] === "number") {
    visitor(coordinates);
    return;
  }

  coordinates?.forEach((child) => visitCoordinates(child, visitor));
}
