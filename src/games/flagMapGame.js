import { findCountryMatch, loadCountries, loadCountryGeoJson } from "../data/countryData.js";
import { createCountryLabel, updateCountryLabels } from "../map/countryLabels.js";
import { featureToPattersonPath, getInitialMapTransform, getPattersonBounds, MAP_VIEWBOX } from "../map/pattersonProjection.js";

const VIEWBOX = MAP_VIEWBOX;
const MAX_ZOOM = 45;
const MAIN_GEO_TYPES = new Set(["Sovereign country", "Country", "Disputed"]);

export async function mountFlagMapGame(stage) {
  return mountMapPromptGame(stage, {
    ariaLabel: "Flag map game",
    promptMode: "flag",
    intro: "Select the country that matches this flag.",
    hint: "Scroll to zoom. Drag to pan. Click the country matching the flag."
  });
}

export async function mountCountryMapGame(stage) {
  return mountMapPromptGame(stage, {
    ariaLabel: "Country map game",
    promptMode: "country",
    intro: "Select the named country on the map.",
    hint: "Scroll to zoom. Drag to pan. Click the named country."
  });
}

export async function mountCapitalMapGame(stage) {
  return mountMapPromptGame(stage, {
    ariaLabel: "Capital city map game",
    promptMode: "capital",
    intro: "Select the country whose capital city is shown.",
    hint: "Scroll to zoom. Drag to pan. Click the country with the named capital."
  });
}

async function mountMapPromptGame(stage, config) {
  stage.innerHTML = `
    <section class="map-game flag-map-game">
      <div class="map-canvas" data-map-canvas>
        <svg class="world-map-svg" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" role="img" aria-label="${config.ariaLabel}"></svg>
      </div>
      <aside class="flag-game-panel">
        <div class="flag-game-status">
          <div class="flag-game-score"><span data-score>0</span> / <span data-total>0</span></div>
          <div class="flag-game-timer" aria-label="Elapsed time" data-timer>00:00</div>
        </div>
        <div class="flag-game-card">
          <div class="flag-game-frame"><img data-flag alt="" /></div>
          <h2 data-prompt>Loading...</h2>
          <p data-feedback>${config.intro}</p>
        </div>
        <div class="flag-game-actions">
          <button class="text-button" type="button" data-skip>Skip</button>
          <button class="text-button" type="button" data-give-up>Give up</button>
        </div>
      </aside>
      <div class="globe-hint">${config.hint}</div>
    </section>
  `;

  const [allCountries, mainCountries, geoJson] = await Promise.all([
    loadCountries({ scope: "mapped", refresh: true }).catch(() => []),
    loadCountries({ scope: "main" }).catch(() => []),
    loadCountryGeoJson({ interactiveScope: "main" })
  ]);

  const game = new FlagMapGame(stage, geoJson, buildQuestionPool(allCountries, mainCountries, geoJson), config);
  game.mount();
  return () => game.dispose();
}

class FlagMapGame {
  constructor(stage, geoJson, countries, config) {
    this.stage = stage;
    this.geoJson = geoJson;
    this.countries = shuffle(
      countries.filter((country) => (config.promptMode === "capital" ? country.capital?.length : country.flag))
    );
    this.config = config;
    this.remaining = [...this.countries];
    this.correct = new Set();
    this.current = null;
    this.acceptingAnswer = true;
    this.svg = stage.querySelector("svg");
    this.content = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.mapBounds = getGeoJsonProjectedBounds(geoJson);
    this.transform = { x: 0, y: 0, scale: 1 };
    this.drag = { active: false, moved: false, x: 0, y: 0, target: null };
    this.velocity = { x: 0, y: 0 };
    this.momentumFrame = null;
    this.startedAt = Date.now();
    this.timerId = null;
    this.isFinished = false;
    this.countryFeatures = new Map();

    this.els = {
      score: stage.querySelector("[data-score]"),
      total: stage.querySelector("[data-total]"),
      timer: stage.querySelector("[data-timer]"),
      flagFrame: stage.querySelector(".flag-game-frame"),
      flag: stage.querySelector("[data-flag]"),
      prompt: stage.querySelector("[data-prompt]"),
      feedback: stage.querySelector("[data-feedback]"),
      actions: stage.querySelector(".flag-game-actions"),
      skip: stage.querySelector("[data-skip]"),
      giveUp: stage.querySelector("[data-give-up]")
    };

    this.onWheel = this.handleWheel.bind(this);
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onSkip = this.skipCurrent.bind(this);
    this.onGiveUp = this.giveUp.bind(this);
  }

  mount() {
    this.svg.append(this.content);
    this.drawCountries();
    this.centerInitialView();
    this.svg.addEventListener("wheel", this.onWheel, { passive: false });
    this.svg.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.els.skip.addEventListener("click", this.onSkip);
    this.els.giveUp.addEventListener("click", this.onGiveUp);
    this.els.total.textContent = String(this.countries.length);
    this.startedAt = Date.now();
    this.updateTimer();
    this.timerId = window.setInterval(() => this.updateTimer(), 1000);
    this.nextQuestion();
  }

  dispose() {
    cancelAnimationFrame(this.momentumFrame);
    clearInterval(this.timerId);
    this.svg.removeEventListener("wheel", this.onWheel);
    this.svg.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.els.skip.removeEventListener("click", this.onSkip);
    this.els.giveUp.removeEventListener("click", this.onGiveUp);
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
        path.setAttribute("class", "map-country flag-answer-country");
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

  nextQuestion() {
    if (this.isFinished) return;
    if (!this.remaining.length) {
      this.finishGame(false);
      return;
    }

    this.current = this.remaining.shift();
    this.acceptingAnswer = true;
    this.els.flag.src = this.current.flag;
    this.els.flag.alt = `${this.current.name} flag`;
    this.els.flagFrame.hidden = this.config.promptMode === "capital";
    if (this.config.promptMode !== "capital") fitFlagImage(this.els.flag);

    if (this.config.promptMode === "capital") {
      this.els.prompt.textContent = this.current.capital.join(" / ");
      this.els.feedback.textContent = "Select the country with this capital city.";
    } else {
      this.els.prompt.textContent = this.config.promptMode === "country" ? this.current.name : "Which country uses this flag?";
      this.els.feedback.textContent =
        this.config.promptMode === "country" ? "Select this country on the map." : "Select the matching country on the map.";
    }
  }

  handleCountryClick(path) {
    if (!this.current || !this.acceptingAnswer) return;

    const feature = this.geoJson.features[Number(path.dataset.countryIndex)];
    if (!feature.properties.isInteractive) return;
    const selectedCountry = findCountryMatch(feature.properties, this.countries);
    if (!selectedCountry) return;

    if (selectedCountry.code === this.current.code || selectedCountry.name === this.current.name) {
      this.acceptingAnswer = false;
      this.correct.add(this.current.code);
      this.markCountry(path.dataset.countryId, "correct", this.config.promptMode !== "country");
      this.els.score.textContent = String(this.correct.size);
      this.els.feedback.textContent = `Correct: ${this.current.name}`;
      window.setTimeout(() => this.nextQuestion(), 450);
      return;
    }

    this.acceptingAnswer = false;
    const current = this.current;
    this.flashCountry(path.dataset.countryId);
    this.els.feedback.textContent = `Not quite. That was ${selectedCountry.name}.`;
    window.setTimeout(() => {
      this.markCountry(this.getCountryMapId(current), "wrong");
      this.nextQuestion();
    }, 2000);
  }

  skipCurrent() {
    if (!this.current || this.isFinished) return;
    this.remaining.push(this.current);
    this.els.feedback.textContent = `Skipped ${this.current.name}. It will come back later.`;
    this.nextQuestion();
  }

  giveUp() {
    if (this.isFinished) return;
    this.countries.forEach((country) => {
      const status = this.correct.has(country.code) ? "correct" : "wrong";
      this.markCountry(this.getCountryMapId(country), status, this.config.promptMode !== "country", false);
    });
    this.updateLabels();
    this.finishGame(true);
  }

  finishGame(gaveUp) {
    this.isFinished = true;
    this.acceptingAnswer = false;
    this.current = null;
    this.remaining = [];
    clearInterval(this.timerId);
    const elapsed = this.updateTimer();
    this.els.prompt.textContent = gaveUp ? "Round ended" : "Finished";
    this.els.feedback.textContent = `${this.correct.size} of ${this.countries.length} correct in ${elapsed}.`;
    this.els.flagFrame.replaceChildren();
    this.els.skip.disabled = true;
    this.els.giveUp.disabled = true;
    if (gaveUp) {
      const returnButton = document.createElement("button");
      returnButton.className = "text-button primary";
      returnButton.type = "button";
      returnButton.textContent = "Return to hub";
      returnButton.addEventListener("click", navigateToHub, { once: true });
      this.els.actions.replaceChildren(returnButton);
    }
  }

  updateTimer() {
    const elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    this.els.timer.textContent = `${minutes}:${seconds}`;
    return this.els.timer.textContent;
  }

  markCountry(countryId, status, revealLabel = false, refreshLabels = true) {
    this.content.querySelectorAll(`.map-country[data-country-id="${cssEscape(countryId)}"]`).forEach((path) => {
      path.classList.remove("selected", "answer-flash");
      path.classList.add(status === "correct" ? "answer-correct" : "answer-wrong");
    });
    if (revealLabel) {
      this.content.querySelectorAll(`.typing-label[data-country-id="${cssEscape(countryId)}"]`).forEach((label) => {
        label.dataset.revealed = "true";
        label.classList.toggle("label-missed", status === "wrong");
      });
      if (refreshLabels) this.updateLabels();
    }
  }

  flashCountry(countryId) {
    this.content.querySelectorAll(`.map-country[data-country-id="${cssEscape(countryId)}"]`).forEach((path) => {
      path.classList.remove("answer-flash");
      path.classList.add("answer-flash");
    });
  }

  getCountryMapId(country) {
    const feature = this.countryFeatures.get(getCountryKey(country)) || this.findFeatureForCountry(country);

    return feature ? getFeatureId(feature.properties) : country.code;
  }

  findFeatureForCountry(country) {
    return this.geoJson.features.find((candidate) => {
      const match = findCountryMatch(candidate.properties, [country]);
      return match?.code === country.code || match?.name === country.name;
    });
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
      this.handleCountryClick(target);
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

function buildQuestionPool(allCountries, mainCountries, geoJson) {
  if (mainCountries.length > 150) return mainCountries;

  const byCode = new Map();
  geoJson.features
    .filter((feature) => MAIN_GEO_TYPES.has(feature.properties.type))
    .forEach((feature) => {
      const match = findCountryMatch(feature.properties, allCountries);
      if (match) byCode.set(match.code, match);
    });

  return [...byCode.values()];
}

function getGeoJsonProjectedBounds(geoJson) {
  return getPattersonBounds(geoJson);
}

function getFeatureId(properties) {
  return [properties.adm0_a3, properties.iso_a3, properties.brk_a3, properties.gu_a3, properties.name, properties.admin].find(isUsableId);
}

function getCountryKey(country) {
  return country.code || String(country.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isUsableId(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized && normalized !== "99" && normalized !== "999" && normalized !== "0";
}

function shuffle(values) {
  return values
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll("\"", "\\\"");
}

function fitFlagImage(img) {
  const applyFit = () => {
    const frame = img.closest(".flag-game-frame");
    if (!frame || !img.naturalWidth || !img.naturalHeight) return;

    const availableWidth = frame.clientWidth - 16;
    const availableHeight = frame.clientHeight - 16;
    const scale = Math.min(availableWidth / img.naturalWidth, availableHeight / img.naturalHeight);

    img.style.width = `${Math.floor(img.naturalWidth * scale)}px`;
    img.style.height = `${Math.floor(img.naturalHeight * scale)}px`;
  };

  if (img.complete) applyFit();
  else img.addEventListener("load", applyFit, { once: true });
}

function navigateToHub() {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "hub" } }));
}
