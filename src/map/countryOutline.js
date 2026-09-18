import { MAP_VIEWBOX, projectPatterson } from "./pattersonProjection.js";

const X_SCALE = MAP_VIEWBOX.width / 360;

export function drawCountryOutline(svg, feature, accessibleName) {
  svg.replaceChildren();
  if (!feature?.geometry) return;

  const longitudes = [];
  visitCoordinates(feature.geometry.coordinates, ([lon]) => longitudes.push(normalizeLongitude(lon)));
  const seam = findBestSeam(longitudes);
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", geometryToPath(feature.geometry, seam, bounds));
  path.setAttribute("class", "country-outline-shape");
  svg.setAttribute("viewBox", paddedViewBox(bounds));
  svg.setAttribute("aria-label", accessibleName);
  svg.append(path);
}

function geometryToPath(geometry, seam, bounds) {
  if (geometry.type === "Polygon") return polygonToPath(geometry.coordinates, seam, bounds);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygonToPath(polygon, seam, bounds)).join(" ");
  return "";
}

function polygonToPath(rings, seam, bounds) {
  return rings
    .map((ring) => {
      const commands = ring.map(([lon, lat], index) => {
        const unwrappedLon = unwrapLongitude(normalizeLongitude(lon), seam);
        const point = { x: unwrappedLon * X_SCALE, y: projectPatterson(0, lat).y };
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.minY = Math.min(bounds.minY, point.y);
        bounds.maxY = Math.max(bounds.maxY, point.y);
        return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      });
      return `${commands.join(" ")} Z`;
    })
    .join(" ");
}

function paddedViewBox(bounds) {
  if (!Number.isFinite(bounds.minX)) return "0 0 100 100";
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const padding = Math.max(width, height) * 0.1;
  return `${bounds.minX - padding} ${bounds.minY - padding} ${width + padding * 2} ${height + padding * 2}`;
}

function findBestSeam(longitudes) {
  const sorted = [...new Set(longitudes)].sort((a, b) => a - b);
  if (sorted.length < 2) return 0;
  let largestGap = -1;
  let seam = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = index === sorted.length - 1 ? sorted[0] + 360 : sorted[index + 1];
    if (next - current > largestGap) {
      largestGap = next - current;
      seam = next % 360;
    }
  }
  return seam;
}

function unwrapLongitude(lon, seam) {
  return lon < seam ? lon + 360 : lon;
}

function normalizeLongitude(lon) {
  return ((lon % 360) + 360) % 360;
}

function visitCoordinates(coordinates, visitor) {
  if (!coordinates) return;
  if (typeof coordinates[0] === "number") {
    visitor(coordinates);
    return;
  }
  coordinates.forEach((child) => visitCoordinates(child, visitor));
}
