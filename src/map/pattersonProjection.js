export const MAP_VIEWBOX = Object.freeze({ width: 1000, height: 600 });

const K1 = 1.0148;
const K2 = 0.23185;
const K3 = -0.14499;
const K4 = 0.02406;
const SCALE = MAP_VIEWBOX.width / (2 * Math.PI);

export function projectPatterson(lon, lat) {
  const lambda = (clamp(lon, -180, 180) * Math.PI) / 180;
  const phi = (clamp(lat, -90, 90) * Math.PI) / 180;
  const phi2 = phi * phi;
  const rawY = phi * (K1 + phi2 * phi2 * (K2 + phi2 * (K3 + K4 * phi2)));

  return {
    x: MAP_VIEWBOX.width / 2 + SCALE * lambda,
    y: MAP_VIEWBOX.height / 2 - SCALE * rawY
  };
}

export function featureToPattersonPath(feature) {
  if (feature.geometry?.type === "Polygon") return polygonToPath(feature.geometry.coordinates);
  if (feature.geometry?.type === "MultiPolygon") return feature.geometry.coordinates.map(polygonToPath).join(" ");
  return "";
}

export function getPattersonBounds(geoJson) {
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

  geoJson.features.forEach((feature) => {
    visitCoordinates(feature.geometry?.coordinates, ([lon, lat]) => {
      const point = projectPatterson(lon, lat);
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxY = Math.max(bounds.maxY, point.y);
    });
  });

  return Number.isFinite(bounds.minY)
    ? bounds
    : { minX: 0, maxX: MAP_VIEWBOX.width, minY: 0, maxY: MAP_VIEWBOX.height };
}

export function getInitialMapTransform(bounds, padding = 2) {
  const landHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = (MAP_VIEWBOX.height - padding * 2) / landHeight;
  return {
    scale,
    x: (MAP_VIEWBOX.width - MAP_VIEWBOX.width * scale) / 2,
    y: padding - bounds.minY * scale
  };
}

function polygonToPath(rings) {
  return rings
    .map((ring) => {
      const commands = ring.map(([lon, lat], index) => {
        const point = projectPatterson(lon, lat);
        return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      });
      return `${commands.join(" ")} Z`;
    })
    .join(" ");
}

function visitCoordinates(coordinates, visitor) {
  if (!coordinates) return;
  if (typeof coordinates[0] === "number") {
    visitor(coordinates);
    return;
  }
  coordinates.forEach((child) => visitCoordinates(child, visitor));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
