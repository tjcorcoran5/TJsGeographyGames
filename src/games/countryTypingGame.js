import { findCountryMatch, loadCountries, loadCountryGeoJson } from "../data/countryData.js";

const VIEWBOX = { width: 1000, height: 520 };
const MAX_ZOOM = 45;

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
      input: stage.querySelector("[data-country-input]")
    };

    this.onWheel = this.handleWheel.bind(this);
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onSubmit = this.handleSubmit.bind(this);
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
  }

  drawCountries() {
    const fragment = document.createDocumentFragment();

    [-VIEWBOX.width, 0, VIEWBOX.width].forEach((offset) => {
      const tile = document.createElementNS("http://www.w3.org/2000/svg", "g");
      tile.setAttribute("transform", `translate(${offset} 0)`);

      this.geoJson.features.forEach((feature, index) => {
        if (!feature.geometry) return;
        const id = getFeatureId(feature.properties);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", featureToPath(feature));
        path.setAttribute("class", "map-country typing-country");
        if (!feature.properties.isInteractive) path.classList.add("non-interactive");
        path.dataset.countryIndex = String(index);
        path.dataset.countryId = id;
        path.style.setProperty("--country-color", "#d8e4df");
        tile.append(path);
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
    this.markCountry(country);

    if (this.guessed.size === this.countries.length) {
      clearInterval(this.timerId);
      this.els.input.disabled = true;
      this.els.input.placeholder = "Complete";
    }
  }

  markCountry(country) {
    const feature = this.geoJson.features.find((candidate) => {
      const match = findCountryMatch(candidate.properties, [country]);
      return match?.code === country.code || match?.name === country.name;
    });
    if (!feature) return;

    const countryId = getFeatureId(feature.properties);
    this.content.querySelectorAll(`.map-country[data-country-id="${cssEscape(countryId)}"]`).forEach((path) => {
      path.classList.add("typed-correct");
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
    const rect = this.svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEWBOX.width,
      y: ((clientY - rect.top) / rect.height) * VIEWBOX.height
    };
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
    this.transform.y = minY > maxY ? (VIEWBOX.height - (contentBottom + contentTop)) / 2 : clamp(this.transform.y, minY, maxY);
  }

  centerInitialView() {
    const landHeight = this.mapBounds.maxY - this.mapBounds.minY;
    this.transform.y = (VIEWBOX.height - landHeight) / 2 - this.mapBounds.minY;
    this.applyTransform();
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

function featureToPath(feature) {
  if (feature.geometry.type === "Polygon") return polygonToPath(feature.geometry.coordinates);
  if (feature.geometry.type === "MultiPolygon") return feature.geometry.coordinates.map(polygonToPath).join(" ");
  return "";
}

function polygonToPath(rings) {
  return rings
    .map((ring) => {
      const commands = ring.map(([lon, lat], index) => {
        const point = project(lon, lat);
        return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      });
      return `${commands.join(" ")} Z`;
    })
    .join(" ");
}

function project(lon, lat) {
  const x = ((lon + 180) / 360) * VIEWBOX.width;
  const clippedLat = clamp(lat, -85, 85);
  const latRad = (clippedLat * Math.PI) / 180;
  const mercator = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = VIEWBOX.height / 2 - (VIEWBOX.width * mercator) / (2 * Math.PI);
  return { x, y };
}

function getGeoJsonProjectedBounds(geoJson) {
  const bounds = { minY: Infinity, maxY: -Infinity };
  geoJson.features.forEach((feature) => {
    visitCoordinates(feature.geometry?.coordinates, ([lon, lat]) => {
      const point = project(lon, lat);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxY = Math.max(bounds.maxY, point.y);
    });
  });
  return Number.isFinite(bounds.minY) ? bounds : { minY: 0, maxY: VIEWBOX.height };
}

function visitCoordinates(coordinates, visitor) {
  if (!coordinates) return;
  if (typeof coordinates[0] === "number") {
    visitor(coordinates);
    return;
  }
  coordinates.forEach((child) => visitCoordinates(child, visitor));
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
