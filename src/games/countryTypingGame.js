import { findCountryMatch, loadCountries, loadCountryGeoJson } from "../data/countryData.js";
import { featureToPattersonPath, getPattersonBounds, MAP_VIEWBOX, projectPatterson } from "../map/pattersonProjection.js";

const VIEWBOX = MAP_VIEWBOX;
const MAX_ZOOM = 45;
const GAME_ID = "country-name-typing";

export async function mountCountryTypingGame(stage) {
  stage.innerHTML = `
    <section class="map-game country-typing-game">
      <div class="map-canvas" data-map-canvas>
        <svg class="world-map-svg" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" role="img" aria-label="Countries typing game"></svg>
      </div>
      <aside class="typing-game-panel">
        <div class="typing-game-stats">
          <span><strong data-score>0</strong> / <span data-total>0</span></span>
          <span data-timer>00:00</span>
        </div>
        <input data-country-input type="text" autocomplete="off" spellcheck="false" placeholder="Type a country..." />
        <button class="text-button typing-give-up" type="button" data-give-up>Give up</button>
      </aside>
      <aside class="typing-review-actions" data-review-actions hidden>
        <button class="text-button primary" type="button" data-review-retry>Retry</button>
        <button class="text-button" type="button" data-review-hub>Return to hub</button>
      </aside>
      <div class="globe-hint">Type a country name and press Enter. Scroll to zoom. Drag to pan.</div>
    </section>
  `;

  const [countries, geoJson] = await Promise.all([
    loadCountries({ scope: "main", refresh: true }).catch(() => []),
    loadCountryGeoJson({ interactiveScope: "main" })
  ]);

  const game = new CountryTypingGame(stage, geoJson, countries);
  game.mount();
  return () => game.dispose();
}

class CountryTypingGame {
  constructor(stage, geoJson, countries) {
    this.stage = stage;
    this.geoJson = geoJson;
    this.countries = countries;
    this.guessed = new Set();
    this.svg = stage.querySelector("svg");
    this.content = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.mapBounds = getGeoJsonProjectedBounds(geoJson);
    this.countryFeatures = new Map();
    this.transform = { x: 0, y: 0, scale: 1 };
    this.drag = { active: false, moved: false, x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.momentumFrame = null;
    this.startedAt = Date.now();
    this.timerId = null;

    this.els = {
      score: stage.querySelector("[data-score]"),
      total: stage.querySelector("[data-total]"),
      timer: stage.querySelector("[data-timer]"),
      input: stage.querySelector("[data-country-input]"),
      giveUp: stage.querySelector("[data-give-up]"),
      reviewActions: stage.querySelector("[data-review-actions]"),
      reviewRetry: stage.querySelector("[data-review-retry]"),
      reviewHub: stage.querySelector("[data-review-hub]")
    };

    this.onWheel = this.handleWheel.bind(this);
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onSubmit = this.handleSubmit.bind(this);
    this.onGiveUp = this.handleGiveUp.bind(this);
    this.onRetry = () => navigateToGame();
    this.onHub = () => navigateToHub();
  }

  mount() {
    this.svg.append(this.content);
    this.drawCountries();
    this.centerInitialView();
    this.svg.addEventListener("wheel", this.onWheel, { passive: false });
    this.svg.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.els.input.addEventListener("keydown", this.onSubmit);
    this.els.giveUp.addEventListener("click", this.onGiveUp);
    this.els.reviewRetry.addEventListener("click", this.onRetry);
    this.els.reviewHub.addEventListener("click", this.onHub);
    this.els.total.textContent = String(this.countries.length);
    this.timerId = window.setInterval(() => this.updateTimer(), 1000);
    this.updateTimer();
    this.els.input.focus();
  }

  dispose() {
    cancelAnimationFrame(this.momentumFrame);
    clearInterval(this.timerId);
    this.svg.removeEventListener("wheel", this.onWheel);
    this.svg.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.els.input.removeEventListener("keydown", this.onSubmit);
    this.els.giveUp.removeEventListener("click", this.onGiveUp);
    this.els.reviewRetry.removeEventListener("click", this.onRetry);
    this.els.reviewHub.removeEventListener("click", this.onHub);
  }

  drawCountries() {
    const fragment = document.createDocumentFragment();
    this.countries.forEach((country) => {
      const feature = this.findFeatureForCountry(country);
      if (feature) this.countryFeatures.set(getCountryKey(country), feature);
    });

    [-VIEWBOX.width, 0, VIEWBOX.width].forEach((offset) => {
      const tile = document.createElementNS("http://www.w3.org/2000/svg", "g");
      tile.setAttribute("transform", `translate(${offset} 0)`);
      tile.dataset.tileOffset = String(offset);

      this.geoJson.features.forEach((feature, index) => {
        if (!feature.geometry) return;
        const id = getFeatureId(feature.properties);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", featureToPattersonPath(feature));
        path.setAttribute("class", "map-country typing-country");
        if (!feature.properties.isInteractive) path.classList.add("non-interactive");
        path.dataset.countryIndex = String(index);
        path.dataset.countryId = id;
        path.style.setProperty("--country-color", "#d8e4df");
        tile.append(path);
      });

      this.countries.forEach((country) => {
        const feature = this.countryFeatures.get(getCountryKey(country));
        if (!feature) return;
        const label = createCountryLabel(country, feature);
        label.dataset.countryId = getFeatureId(feature.properties);
        label.dataset.tileOffset = String(offset);
        tile.append(label);
      });

      fragment.append(tile);
    });

    this.content.append(fragment);
  }

  handleSubmit(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();

    const guess = normalizeGuess(this.els.input.value);
    if (!guess) return;

    const country = this.countries.find((candidate) => getCountryGuessKeys(candidate).some((key) => key === guess));
    if (!country) {
      this.flashInput();
      return;
    }

    const countryKey = getCountryKey(country);
    if (this.guessed.has(countryKey)) {
      this.flashInput();
      return;
    }

    this.guessed.add(countryKey);
    this.els.input.value = "";
    this.els.score.textContent = String(this.guessed.size);
    this.markCountry(country, "correct");

    if (this.guessed.size === this.countries.length) {
      this.endGame({ gaveUp: false });
    }
  }

  handleGiveUp() {
    this.endGame({ gaveUp: true });
  }

  endGame({ gaveUp }) {
    clearInterval(this.timerId);
    this.els.input.disabled = true;
    this.els.giveUp.disabled = true;
    this.els.input.placeholder = gaveUp ? "Revealed" : "Complete";

    if (gaveUp) {
      this.countries.forEach((country) => {
        if (!this.guessed.has(getCountryKey(country))) this.markCountry(country, "missed");
      });
    }

    this.showEndScreen({ gaveUp });
  }

  markCountry(country, state) {
    const feature = this.countryFeatures.get(getCountryKey(country)) || this.findFeatureForCountry(country);
    if (!feature) return;

    const countryId = getFeatureId(feature.properties);
    this.content.querySelectorAll(`.map-country[data-country-id="${cssEscape(countryId)}"]`).forEach((path) => {
      path.classList.add(state === "missed" ? "typed-missed" : "typed-correct");
    });
    this.content.querySelectorAll(`.typing-label[data-country-id="${cssEscape(countryId)}"]`).forEach((label) => {
      label.dataset.revealed = "true";
      label.classList.toggle("label-missed", state === "missed");
    });
    this.updateLabels();
  }

  findFeatureForCountry(country) {
    return this.geoJson.features.find((candidate) => {
      const match = findCountryMatch(candidate.properties, [country]);
      return match?.code === country.code || match?.name === country.name;
    });
  }

  flashInput() {
    this.els.input.classList.remove("input-flash");
    void this.els.input.offsetWidth;
    this.els.input.classList.add("input-flash");
  }

  updateTimer() {
    const elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    this.els.timer.textContent = `${mins}:${secs}`;
    return this.els.timer.textContent;
  }

  showEndScreen({ gaveUp }) {
    this.stage.querySelector(".typing-end-overlay")?.remove();
    const elapsed = this.updateTimer();
    const missed = this.countries.length - this.guessed.size;
    const overlay = document.createElement("div");
    overlay.className = "typing-end-overlay";
    overlay.innerHTML = `
      <section class="typing-end-card" role="dialog" aria-modal="true" aria-labelledby="typing-end-title">
        <h2 id="typing-end-title">${gaveUp ? "Run ended" : "Map complete"}</h2>
        <p>${this.guessed.size} of ${this.countries.length} countries in ${elapsed}</p>
        ${gaveUp ? `<p>${missed} missed countries are highlighted in red.</p>` : ""}
        <div class="typing-end-actions">
          <button class="text-button primary" type="button" data-retry>Retry</button>
          <button class="text-button" type="button" data-review>Review map</button>
          <button class="text-button" type="button" data-hub>Return to hub</button>
        </div>
      </section>
    `;
    overlay.querySelector("[data-retry]").addEventListener("click", () => {
      navigateToGame();
    });
    overlay.querySelector("[data-hub]").addEventListener("click", () => {
      navigateToHub();
    });
    overlay.querySelector("[data-review]").addEventListener("click", () => {
      overlay.remove();
      this.showReviewActions();
    });
    this.stage.querySelector(".country-typing-game").append(overlay);
  }

  showReviewActions() {
    this.els.reviewActions.hidden = false;
  }

  handleWheel(event) {
    event.preventDefault();
    cancelAnimationFrame(this.momentumFrame);
    const pointer = this.clientToViewBox(event.clientX, event.clientY);
    const mapPoint = this.viewBoxToMap(pointer.x, pointer.y);
    const nextScale = clamp(this.transform.scale * (event.deltaY > 0 ? 0.88 : 1.12), 1, MAX_ZOOM);
    this.transform.scale = nextScale;
    this.transform.x = pointer.x - mapPoint.x * nextScale;
    this.transform.y = pointer.y - mapPoint.y * nextScale;
    this.applyTransform();
  }

  handlePointerDown(event) {
    cancelAnimationFrame(this.momentumFrame);
    const pointer = this.clientToViewBox(event.clientX, event.clientY);
    this.drag = { active: true, moved: false, x: pointer.x, y: pointer.y };
    this.velocity = { x: 0, y: 0 };
  }

  handlePointerMove(event) {
    if (!this.drag.active) return;
    const pointer = this.clientToViewBox(event.clientX, event.clientY);
    const dx = pointer.x - this.drag.x;
    const dy = pointer.y - this.drag.y;
    this.drag.x = pointer.x;
    this.drag.y = pointer.y;
    this.velocity = { x: dx, y: dy };
    this.transform.x += dx;
    this.transform.y += dy;
    this.applyTransform();
  }

  handlePointerUp() {
    if (!this.drag.active) return;
    this.drag.active = false;
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
    this.updateLabels();
  }

  constrainTransform() {
    const period = VIEWBOX.width * this.transform.scale;
    while (this.transform.x > 0) this.transform.x -= period;
    while (this.transform.x < -period) this.transform.x += period;

    const contentTop = this.mapBounds.minY * this.transform.scale;
    const contentBottom = this.mapBounds.maxY * this.transform.scale;
    const minY = VIEWBOX.height - contentBottom;
    const maxY = -contentTop;
    this.transform.y = minY > maxY ? (VIEWBOX.height - (contentBottom + contentTop)) / 2 : clamp(this.transform.y, minY, maxY);
  }

  centerInitialView() {
    const landHeight = this.mapBounds.maxY - this.mapBounds.minY;
    this.transform.y = (VIEWBOX.height - landHeight) / 2 - this.mapBounds.minY;
    this.applyTransform();
  }

  updateLabels() {
    const visibleLabels = [];
    this.content.querySelectorAll(".typing-label").forEach((label) => {
      const minScale = Number(label.dataset.minScale || 1);
      const isVisible = label.dataset.revealed === "true" && this.transform.scale >= minScale;
      label.classList.toggle("label-visible", isVisible);
      label.setAttribute("font-size", String(clamp(8 / this.transform.scale, 0.85, 8)));
      label.setAttribute("stroke-width", String(clamp(2.8 / this.transform.scale, 0.28, 2.8)));
      label.setAttribute("x", label.dataset.baseX);
      label.setAttribute("y", label.dataset.baseY);
      if (isVisible) visibleLabels.push(label);
    });
    resolveLabelCollisions(visibleLabels, this.transform);
  }
}

function getCountryGuessKeys(country) {
  return [country.name, country.officialName, ...(country.altSpellings || [])].map(normalizeGuess).filter(Boolean);
}

function getCountryKey(country) {
  return country.code || normalizeGuess(country.name);
}

function normalizeGuess(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function createCountryLabel(country, feature) {
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
  const textLength = label.textContent.length;
  const width = clamp(textLength * 4.4, 18, 150);
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
  return box.right >= -80 && box.left <= VIEWBOX.width + 80 && box.bottom >= -50 && box.top <= VIEWBOX.height + 50;
}

function boxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function getFeatureLabelMetrics(feature) {
  const rings = getPolygonRings(feature.geometry);
  const best = rings
    .map((ring) => {
      const points = ring.map(([lon, lat]) => projectPatterson(lon, lat));
      const bounds = points.reduce(
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

  if (!best) return { x: VIEWBOX.width / 2, y: VIEWBOX.height / 2, width: 0, height: 0 };
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

function getGeoJsonProjectedBounds(geoJson) {
  return getPattersonBounds(geoJson);
}

function getFeatureId(properties) {
  return [properties.adm0_a3, properties.iso_a3, properties.brk_a3, properties.gu_a3, properties.name, properties.admin]
    .find(isUsableId) || normalizeGuess(properties.name || properties.admin || "unknown");
}

function isUsableId(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized && normalized !== "99" && normalized !== "999" && normalized !== "0";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll("\"", "\\\"");
}

function navigateToGame() {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "game", gameId: GAME_ID } }));
}

function navigateToHub() {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "hub" } }));
}
