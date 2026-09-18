import { MAP_VIEWBOX, projectPatterson } from "./pattersonProjection.js";

export function createCountryLabel(country, feature) {
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  const metrics = getFeatureLabelMetrics(feature);
  label.setAttribute("x", metrics.x.toFixed(2));
  label.setAttribute("y", metrics.y.toFixed(2));
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "central");
  label.setAttribute("class", "typing-label");
  label.dataset.revealed = "false";
  label.dataset.minScale = String(getLabelMinScale(metrics.width, metrics.height));
  label.dataset.baseX = metrics.x.toFixed(2);
  label.dataset.baseY = metrics.y.toFixed(2);
  label.dataset.labelPriority = String(metrics.width * metrics.height);
  label.textContent = country.name;
  return label;
}

export function updateCountryLabels(content, transform) {
  const visibleLabels = [];
  content.querySelectorAll(".typing-label").forEach((label) => {
    const minScale = Number(label.dataset.minScale || 1);
    const isVisible = label.dataset.revealed === "true" && transform.scale >= minScale;
    label.classList.toggle("label-visible", isVisible);
    label.setAttribute("font-size", String(clamp(8 / transform.scale, 0.85, 8)));
    label.setAttribute("stroke-width", String(clamp(2.8 / transform.scale, 0.28, 2.8)));
    label.setAttribute("x", label.dataset.baseX);
    label.setAttribute("y", label.dataset.baseY);
    if (isVisible) visibleLabels.push(label);
  });
  resolveLabelCollisions(visibleLabels, transform);
}

function resolveLabelCollisions(labels, transform) {
  const placed = [];
  const visibleLabels = labels
    .map((label) => ({ label, box: getLabelBox(label, transform, 0) }))
    .filter((entry) => isBoxNearView(entry.box))
    .sort((a, b) => Number(b.label.dataset.labelPriority || 0) - Number(a.label.dataset.labelPriority || 0));

  visibleLabels.forEach(({ label }) => {
    const offsets = [0, -12, 12, -24, 24, -38, 38, -54, 54];
    let selectedOffset = offsets[offsets.length - 1];
    let selectedBox = getLabelBox(label, transform, selectedOffset);

    for (const offset of offsets) {
      const box = getLabelBox(label, transform, offset);
      if (!placed.some((placedBox) => boxesOverlap(box, placedBox))) {
        selectedOffset = offset;
        selectedBox = box;
        break;
      }
    }

    label.setAttribute("y", String(Number(label.dataset.baseY) + selectedOffset / transform.scale));
    placed.push(selectedBox);
  });
}

function getLabelBox(label, transform, yOffset) {
  const width = clamp(label.textContent.length * 4.4, 18, 150);
  const height = 10;
  const x = (Number(label.dataset.baseX) + Number(label.dataset.tileOffset || 0)) * transform.scale + transform.x;
  const y = Number(label.dataset.baseY) * transform.scale + transform.y + yOffset;
  return {
    left: x - width / 2 - 3,
    right: x + width / 2 + 3,
    top: y - height / 2 - 2,
    bottom: y + height / 2 + 2
  };
}

function isBoxNearView(box) {
  return box.right >= -80 && box.left <= MAP_VIEWBOX.width + 80 && box.bottom >= -50 && box.top <= MAP_VIEWBOX.height + 50;
}

function boxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function getFeatureLabelMetrics(feature) {
  const best = getPolygonRings(feature.geometry)
    .map((ring) => {
      const bounds = ring.map(([lon, lat]) => projectPatterson(lon, lat)).reduce(
        (next, point) => ({
          minX: Math.min(next.minX, point.x),
          maxX: Math.max(next.maxX, point.x),
          minY: Math.min(next.minY, point.y),
          maxY: Math.max(next.maxY, point.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );
      return {
        ...bounds,
        area: Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY)
      };
    })
    .sort((a, b) => b.area - a.area)[0];

  if (!best) return { x: MAP_VIEWBOX.width / 2, y: MAP_VIEWBOX.height / 2, width: 0, height: 0 };
  const labelLon = Number(feature.properties?.label_x);
  const labelLat = Number(feature.properties?.label_y);
  const labelPoint = Number.isFinite(labelLon) && Number.isFinite(labelLat) ? projectPatterson(labelLon, labelLat) : null;
  return {
    x: labelPoint?.x ?? (best.minX + best.maxX) / 2,
    y: labelPoint?.y ?? (best.minY + best.maxY) / 2,
    width: best.maxX - best.minX,
    height: best.maxY - best.minY
  };
}

function getPolygonRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function getLabelMinScale(width, height) {
  const size = Math.max(width, height);
  if (size >= 55) return 1;
  if (size >= 28) return 1.8;
  if (size >= 14) return 3.2;
  if (size >= 7) return 6;
  return 10;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
