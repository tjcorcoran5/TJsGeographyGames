import * as THREE from "three";
import Delaunator from "https://cdn.skypack.dev/delaunator@5.0.0";

export function latLonToVector3(lat, lon, radius) {
  if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 90) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

export function createPolygonLineData(polygon, radius) {
  const points = polygon.map(([lon, lat]) => latLonToVector3(lat, lon, radius + 0.012)).filter(Boolean);

  if (points.length < 2) return null;

  return points.flatMap((point) => [round(point.x), round(point.y), round(point.z)]);
}

export function createPolygonLine(polygon, radius, material) {
  const positions = createPolygonLineData(polygon, radius);
  if (!positions) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Line(geometry, material);
}

export function createCurvedCountryGeometryData(rings, radius, options = {}) {
  const exterior = cleanRing(rings[0]);
  const holes = rings
    .slice(1)
    .map(cleanRing)
    .filter((ring) => ring.length >= 3);
  if (exterior.length < 3) return null;

  const step = getAdaptiveStep(exterior) * (options.stepMultiplier || 1);
  const boundaryPoints = [exterior, ...holes].flat();
  const interiorSample = generateInteriorPoints(exterior, holes, step, options.maxInteriorPoints || 190);
  const interiorPoints = interiorSample.points;
  const points2D = boundaryPoints.concat(interiorPoints);
  if (points2D.length < 3) return null;

  const triangles = Delaunator.from(points2D, (point) => point[0], (point) => point[1]).triangles;
  const vertices3D = points2D.map(([lon, lat]) => latLonToVector3(lat, lon, radius + 0.009));
  const indices = [];

  for (let i = 0; i < triangles.length; i += 3) {
    let a = triangles[i];
    let b = triangles[i + 1];
    let c = triangles[i + 2];

    if (!triangleIsInsidePolygon(a, b, c, points2D, exterior, holes, interiorSample.step, interiorPoints.length > 0)) continue;

    const vA = vertices3D[a];
    const vB = vertices3D[b];
    const vC = vertices3D[c];
    const normal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(vB, vA),
      new THREE.Vector3().subVectors(vC, vA)
    );

    if (normal.dot(vA) < 0) {
      [b, c] = [c, b];
    }

    indices.push(a, b, c);
  }

  if (!indices.length) return null;

  const positions = vertices3D.flatMap((vertex) => [round(vertex.x), round(vertex.y), round(vertex.z)]);
  return { positions, indices };
}

export function createCurvedCountryMesh(rings, radius, material, options = {}) {
  const geometryData = createCurvedCountryGeometryData(rings, radius, options);
  if (!geometryData) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(geometryData.positions, 3));
  geometry.setIndex(geometryData.indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function cleanRing(ring = []) {
  const cleaned = ring.filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (cleaned.length > 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      cleaned.pop();
    }
  }

  return cleaned;
}

function getAdaptiveStep(polygon) {
  const bounds = getBounds(polygon);
  const width = bounds.maxLon - bounds.minLon;
  const height = bounds.maxLat - bounds.minLat;
  const span = Math.max(width, height);

  if (span > 90) return 5;
  if (span > 45) return 4;
  if (span > 18) return 3;
  if (span > 8) return 2;
  return 1.4;
}

function generateInteriorPoints(exterior, holes, step, maxInteriorPoints) {
  const bounds = getBounds(exterior);
  const width = bounds.maxLon - bounds.minLon;
  const height = bounds.maxLat - bounds.minLat;
  const estimatedPoints = (width / step) * (height / step);
  let sampleStep = step;

  if (estimatedPoints > maxInteriorPoints) {
    sampleStep = step * Math.sqrt(estimatedPoints / maxInteriorPoints);
  }

  const points = [];

  for (let lon = bounds.minLon + sampleStep; lon < bounds.maxLon; lon += sampleStep) {
    for (let lat = bounds.minLat + sampleStep; lat < bounds.maxLat; lat += sampleStep) {
      const point = { x: lon, y: lat };
      if (!pointInPolygon(point, exterior)) continue;
      if (holes.some((hole) => pointInPolygon(point, hole))) continue;
      points.push([lon, lat]);
    }
  }

  return { points, step: sampleStep };
}

function triangleIsInsidePolygon(i0, i1, i2, points, exterior, holes, step, hasInteriorPoints) {
  const a = points[i0];
  const b = points[i1];
  const c = points[i2];
  const centroid = { x: (a[0] + b[0] + c[0]) / 3, y: (a[1] + b[1] + c[1]) / 3 };
  if (!pointInPolygon(centroid, exterior)) return false;
  if (holes.some((hole) => pointInPolygon(centroid, hole))) return false;

  if (!hasInteriorPoints) return true;

  const maxEdge = Math.max(step * 5, 10);
  return getEdgeLength(a, b) <= maxEdge && getEdgeLength(b, c) <= maxEdge && getEdgeLength(c, a) <= maxEdge;
}

function getEdgeLength(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}

function getBounds(polygon) {
  return polygon.reduce(
    (bounds, [lon, lat]) => ({
      minLon: Math.min(bounds.minLon, lon),
      maxLon: Math.max(bounds.maxLon, lon),
      minLat: Math.min(bounds.minLat, lat),
      maxLat: Math.max(bounds.maxLat, lat)
    }),
    { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity }
  );
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}
