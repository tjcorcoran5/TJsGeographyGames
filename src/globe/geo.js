import * as THREE from "three";

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

export function createPolygonLine(polygon, radius, material) {
  const points = polygon
    .map(([lon, lat]) => latLonToVector3(lat, lon, radius + 0.012))
    .filter(Boolean);

  if (points.length < 2) return null;

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, material);
}

export function createCurvedCountryMesh(rings, radius, material) {
  const exterior = cleanRing(rings[0]);
  const holes = rings.slice(1).map(cleanRing).filter((ring) => ring.length >= 3);
  if (exterior.length < 3) return null;

  const contour = exterior.map(([lon, lat]) => new THREE.Vector2(lon, lat));
  const holePoints = holes.map((ring) => ring.map(([lon, lat]) => new THREE.Vector2(lon, lat)));
  const faces = THREE.ShapeUtils.triangulateShape(contour, holePoints);

  if (!faces.length) return null;

  const points2D = [...exterior, ...holes.flat()];
  const vertices3D = points2D.map(([lon, lat]) => latLonToVector3(lat, lon, radius + 0.009));
  const indices = [];

  faces.forEach((face) => {
    let [a, b, c] = face;
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
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(vertices3D);
  geometry.setIndex(indices);
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
