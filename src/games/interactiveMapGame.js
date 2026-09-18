import { emptyCountryPanelText, renderCountryPanel } from "../components/countryPanel.js";
import { findCountryMatch, loadCountries, loadCountryGeoJson } from "../data/countryData.js";
import { featureToPattersonPath, getInitialMapTransform, getPattersonBounds, MAP_VIEWBOX } from "../map/pattersonProjection.js";

const VIEWBOX = MAP_VIEWBOX;
const MAX_ZOOM = 60;

export async function mountInteractiveMapGame(stage) {
  stage.innerHTML = `
    <section class="map-game">
      <div class="map-canvas" data-map-canvas>
        <svg class="world-map-svg" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" role="img" aria-label="Interactive world map"></svg>
      </div>
      <aside class="globe-side-panel" aria-live="polite">
        ${emptyCountryPanelText()}
      </aside>
      <div class="globe-hint">Scroll to zoom. Drag to pan. Click a country to open its profile.</div>
    </section>
  `;

  const [countries, geoJson] = await Promise.all([
    loadCountries({ scope: "mapped", refresh: true }).catch((error) => {
      console.warn(error);
      return [];
    }),
    loadCountryGeoJson({ interactiveScope: "mapped" })
  ]);

  const panel = stage.querySelector(".globe-side-panel");
  const map = new InteractiveMap(stage.querySelector("[data-map-canvas]"), geoJson, {
    onCountrySelected: (feature) => {
      const match = findCountryMatch(feature.properties, countries);
      renderCountryPanel(panel, feature.properties, match);
    }
  });

  map.mount();
  return () => map.dispose();
}

class InteractiveMap {
  constructor(container, geoJson, { onCountrySelected } = {}) {
    this.container = container;
    this.svg = container.querySelector("svg");
    this.geoJson = geoJson;
    this.onCountrySelected = onCountrySelected;
    this.content = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.mapBounds = getGeoJsonProjectedBounds(geoJson);
    this.selectedCountryId = null;
    this.transform = { x: 0, y: 0, scale: 1 };
    this.drag = { active: false, moved: false, x: 0, y: 0, target: null };
    this.velocity = { x: 0, y: 0 };
    this.momentumFrame = null;

    this.onWheel = this.handleWheel.bind(this);
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
  }

  mount() {
    this.svg.append(this.content);
    this.drawCountries();
    this.centerInitialView();
    this.svg.addEventListener("wheel", this.onWheel, { passive: false });
    this.svg.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.applyTransform();
  }

  dispose() {
    cancelAnimationFrame(this.momentumFrame);
    this.svg.removeEventListener("wheel", this.onWheel);
    this.svg.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  drawCountries() {
    const fragment = document.createDocumentFragment();

    [-VIEWBOX.width, 0, VIEWBOX.width].forEach((offset) => {
      const tile = document.createElementNS("http://www.w3.org/2000/svg", "g");
      tile.setAttribute("transform", `translate(${offset} 0)`);

      this.geoJson.features.forEach((feature, index) => {
        if (!feature.geometry) return;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", featureToPattersonPath(feature));
        path.setAttribute("class", "map-country");
        if (!feature.properties.isInteractive) path.classList.add("non-interactive");
        path.dataset.countryIndex = String(index);
        path.dataset.countryId = getFeatureId(feature.properties);
        path.style.setProperty("--country-color", colorFromString(feature.properties.iso_a3 || feature.properties.name));
        tile.append(path);
      });

      fragment.append(tile);
    });

    this.content.append(fragment);
  }

  selectCountry(path) {
    const feature = this.geoJson.features[Number(path.dataset.countryIndex)];
    if (!feature.properties.isInteractive) return;
    const countryId = path.dataset.countryId;
    this.selectedCountryId = countryId;

    this.content.querySelectorAll(".map-country.selected").forEach((selected) => selected.classList.remove("selected"));
    this.content.querySelectorAll(`.map-country[data-country-id="${cssEscape(countryId)}"]`).forEach((selected) => {
      selected.classList.add("selected");
    });

    this.onCountrySelected?.(feature);
  }

  handleWheel(event) {
    event.preventDefault();
    cancelAnimationFrame(this.momentumFrame);

    const pointer = this.clientToViewBox(event.clientX, event.clientY);
    const mapPoint = this.viewBoxToMap(pointer.x, pointer.y);
    const delta = event.deltaY > 0 ? 0.88 : 1.12;
    const nextScale = clamp(this.transform.scale * delta, 1, MAX_ZOOM);

    this.transform.scale = nextScale;
    this.transform.x = pointer.x - mapPoint.x * nextScale;
    this.transform.y = pointer.y - mapPoint.y * nextScale;
    this.applyTransform();
  }

  handlePointerDown(event) {
    cancelAnimationFrame(this.momentumFrame);
    const pointer = this.clientToViewBox(event.clientX, event.clientY);
    this.drag = {
      active: true,
      moved: false,
      x: pointer.x,
      y: pointer.y,
      target: event.target.closest?.(".map-country") || null
    };
    this.velocity = { x: 0, y: 0 };
  }

  handlePointerMove(event) {
    if (!this.drag.active) return;

    const pointer = this.clientToViewBox(event.clientX, event.clientY);
    const dx = pointer.x - this.drag.x;
    const dy = pointer.y - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
    this.drag.x = pointer.x;
    this.drag.y = pointer.y;
    this.velocity = { x: dx, y: dy };
    this.transform.x += dx;
    this.transform.y += dy;
    this.applyTransform();
  }

  handlePointerUp(event) {
    if (!this.drag.active) return;

    const target = this.drag.target || event.target.closest?.(".map-country");
    const moved = this.drag.moved;
    this.drag.active = false;

    if (!moved && target) {
      this.selectCountry(target);
      return;
    }

    this.startMomentum();
  }

  viewBoxToMap(x, y) {
    return {
      x: (x - this.transform.x) / this.transform.scale,
      y: (y - this.transform.y) / this.transform.scale
    };
  }

  clientToViewBox(clientX, clientY) {
    const point = this.svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const viewBoxPoint = point.matrixTransform(this.svg.getScreenCTM().inverse());
    return { x: viewBoxPoint.x, y: viewBoxPoint.y };
  }

  startMomentum() {
    const tick = () => {
      this.velocity.x *= 0.9;
      this.velocity.y *= 0.9;

      if (Math.abs(this.velocity.x) + Math.abs(this.velocity.y) < 0.04) return;

      this.transform.x += this.velocity.x;
      this.transform.y += this.velocity.y;
      this.applyTransform();
      this.momentumFrame = requestAnimationFrame(tick);
    };

    this.momentumFrame = requestAnimationFrame(tick);
  }

  applyTransform() {
    this.constrainTransform();
    this.content.setAttribute("transform", `translate(${this.transform.x} ${this.transform.y}) scale(${this.transform.scale})`);
  }

  constrainTransform() {
    const period = VIEWBOX.width * this.transform.scale;
    while (this.transform.x > 0) this.transform.x -= period;
    while (this.transform.x < -period) this.transform.x += period;

    const contentTop = this.mapBounds.minY * this.transform.scale;
    const contentBottom = this.mapBounds.maxY * this.transform.scale;
    const minY = VIEWBOX.height - contentBottom;
    const maxY = -contentTop;

    if (minY > maxY) {
      this.transform.y = (VIEWBOX.height - (contentBottom + contentTop)) / 2;
    } else {
      this.transform.y = clamp(this.transform.y, minY, maxY);
    }
  }

  centerInitialView() {
    this.transform = getInitialMapTransform(this.mapBounds);
    this.applyTransform();
  }
}

function getGeoJsonProjectedBounds(geoJson) {
  return getPattersonBounds(geoJson);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function colorFromString(value = "") {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }

  const palette = ["#76a9c7", "#a1c181", "#f0b36a", "#9bb7d4", "#d6a4a4", "#8fb9a8", "#d8c76f"];
  return palette[Math.abs(hash) % palette.length];
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll("\"", "\\\"");
}

function getFeatureId(properties) {
  return [
    properties.adm0_a3,
    properties.iso_a3,
    properties.brk_a3,
    properties.gu_a3,
    properties.name,
    properties.admin
  ].find((value) => isUsableId(value)) || properties.name || properties.admin || crypto.randomUUID();
}

function isUsableId(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized && normalized !== "99" && normalized !== "999" && normalized !== "0";
}
