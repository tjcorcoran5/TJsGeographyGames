import { findCountryMatch, loadCountries, loadCountryGeoJson } from "../data/countryData.js";
import { createCountryLabel, updateCountryLabels } from "../map/countryLabels.js";
import { featureToPattersonPath, getInitialMapTransform, getPattersonBounds, MAP_VIEWBOX } from "../map/pattersonProjection.js";

const VIEWBOX = MAP_VIEWBOX;
const MAX_ZOOM = 45;
export async function mountCountryTypingGame(stage) {
  return mountCountryTypingGameWithScope(stage, { scope: "main", gameId: "country-name-typing" });
}

export async function mountExtendedCountryTypingGame(stage) {
  return mountCountryTypingGameWithScope(stage, { scope: "mapped", gameId: "extended-country-name-typing" });
}

async function mountCountryTypingGameWithScope(stage, options) {
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
    loadCountries({ scope: options.scope, refresh: true }).catch(() => []),
    loadCountryGeoJson({ interactiveScope: options.scope })
  ]);

  const game = new CountryTypingGame(stage, geoJson, countries, options.gameId);
  game.mount();
  return () => game.dispose();
}

class CountryTypingGame {
  constructor(stage, geoJson, countries, gameId) {
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
    this.activePointers = new Map();
    this.pinch = null;
    this.velocity = { x: 0, y: 0 };
    this.momentumFrame = null;
    this.startedAt = Date.now();
    this.timerId = null;
    this.gameId = gameId;

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
    this.onRetry = () => navigateToGame(this.gameId);
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
    window.addEventListener("pointercancel", this.onPointerUp);
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
    window.removeEventListener("pointercancel", this.onPointerUp);
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
      navigateToGame(this.gameId);
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
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activePointers.size === 2) {
      this.beginPinch();
      return;
    }
    if (this.activePointers.size > 1) return;
    const pointer = this.clientToViewBox(event.clientX, event.clientY);
    this.drag = { active: true, moved: false, x: pointer.x, y: pointer.y };
    this.velocity = { x: 0, y: 0 };
  }

  handlePointerMove(event) {
    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (this.activePointers.size >= 2) {
      this.updatePinch();
      return;
    }
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

  handlePointerUp(event) {
    const wasPinching = Boolean(this.pinch);
    this.activePointers.delete(event.pointerId);
    if (wasPinching) {
      this.pinch = null;
      this.drag.active = false;
      this.velocity = { x: 0, y: 0 };
      return;
    }
    if (!this.drag.active) return;
    this.drag.active = false;
    this.startMomentum();
  }

  beginPinch() {
    const [first, second] = [...this.activePointers.values()];
    const midpoint = this.clientToViewBox((first.x + second.x) / 2, (first.y + second.y) / 2);
    this.pinch = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      scale: this.transform.scale,
      mapPoint: this.viewBoxToMap(midpoint.x, midpoint.y)
    };
    this.drag.active = false;
    this.velocity = { x: 0, y: 0 };
  }

  updatePinch() {
    if (!this.pinch) this.beginPinch();
    const [first, second] = [...this.activePointers.values()];
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const midpoint = this.clientToViewBox((first.x + second.x) / 2, (first.y + second.y) / 2);
    const scale = clamp(this.pinch.scale * (distance / this.pinch.distance), 1, MAX_ZOOM);
    this.transform.scale = scale;
    this.transform.x = midpoint.x - this.pinch.mapPoint.x * scale;
    this.transform.y = midpoint.y - this.pinch.mapPoint.y * scale;
    this.applyTransform();
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
    this.transform = getInitialMapTransform(this.mapBounds);
    this.applyTransform();
  }

  updateLabels() {
    updateCountryLabels(this.content, this.transform);
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

function navigateToGame(gameId) {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "game", gameId } }));
}

function navigateToHub() {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "hub" } }));
}
