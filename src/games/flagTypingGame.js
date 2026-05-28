import { loadCountries, loadCountryGeoJson } from "../data/countryData.js";

const VIEWBOX = { width: 1000, height: 520 };
const GAME_ID = "flag-name-typing";

export async function mountFlagTypingGame(stage) {
  stage.innerHTML = `
    <section class="map-game flag-typing-game">
      <div class="map-canvas flag-typing-map" data-map-canvas>
        <svg class="world-map-svg static-world-map" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" role="img" aria-label="World map background"></svg>
      </div>
      <main class="flag-typing-hud" data-hud>
        <div class="flag-typing-topline">
          <span><strong data-score>0</strong> / <span data-total>0</span></span>
          <span data-timer>00:00</span>
        </div>
        <div class="flag-typing-frame"><img data-flag alt="" /></div>
        <form class="flag-typing-form" data-answer-form>
          <input data-answer-input type="text" autocomplete="off" spellcheck="false" placeholder="Type the country..." />
          <button class="text-button primary" type="submit">Submit</button>
        </form>
        <p data-feedback>Type the country name and press Enter.</p>
        <div class="flag-typing-actions">
          <button class="text-button" type="button" data-skip>Skip</button>
          <button class="text-button flag-typing-give-up" type="button" data-give-up>Give up</button>
        </div>
      </main>
    </section>
  `;

  const [countries, geoJson] = await Promise.all([
    loadCountries({ scope: "main", refresh: true }).catch(() => []),
    loadCountryGeoJson({ interactiveScope: "main" }).catch(() => null)
  ]);

  const game = new FlagTypingGame(stage, countries, geoJson);
  game.mount();
  return () => game.dispose();
}

class FlagTypingGame {
  constructor(stage, countries, geoJson) {
    this.stage = stage;
    this.countries = shuffle(countries.filter((country) => country.flag));
    this.remaining = [...this.countries];
    this.correct = new Set();
    this.reviewCountries = new Map();
    this.current = null;
    this.startedAt = Date.now();
    this.timerId = null;
    this.isEnded = false;
    this.reviewIndex = 0;

    this.els = {
      svg: stage.querySelector("svg"),
      hud: stage.querySelector("[data-hud]"),
      score: stage.querySelector("[data-score]"),
      total: stage.querySelector("[data-total]"),
      timer: stage.querySelector("[data-timer]"),
      flag: stage.querySelector("[data-flag]"),
      form: stage.querySelector("[data-answer-form]"),
      input: stage.querySelector("[data-answer-input]"),
      feedback: stage.querySelector("[data-feedback]"),
      skip: stage.querySelector("[data-skip]"),
      giveUp: stage.querySelector("[data-give-up]")
    };

    this.geoJson = geoJson;
    this.onSubmit = this.handleSubmit.bind(this);
    this.onSkip = this.skipCurrent.bind(this);
    this.onGiveUp = this.giveUp.bind(this);
  }

  mount() {
    drawStaticMap(this.els.svg, this.geoJson);
    this.els.total.textContent = String(this.countries.length);
    this.els.form.addEventListener("submit", this.onSubmit);
    this.els.skip.addEventListener("click", this.onSkip);
    this.els.giveUp.addEventListener("click", this.onGiveUp);
    this.timerId = window.setInterval(() => this.updateTimer(), 1000);
    this.updateTimer();
    this.nextFlag();
    this.els.input.focus();
  }

  dispose() {
    clearInterval(this.timerId);
    this.els.form.removeEventListener("submit", this.onSubmit);
    this.els.skip.removeEventListener("click", this.onSkip);
    this.els.giveUp.removeEventListener("click", this.onGiveUp);
  }

  handleSubmit(event) {
    event.preventDefault();
    if (!this.current || this.isEnded) return;

    const guess = normalizeGuess(this.els.input.value);
    if (!guess) return;

    if (getCountryGuessKeys(this.current).includes(guess)) {
      const countryKey = getCountryKey(this.current);
      this.correct.add(countryKey);
      this.reviewCountries.delete(countryKey);
      this.els.score.textContent = String(this.correct.size);
      this.els.input.value = "";
      this.flashHud("correct");
      this.els.feedback.textContent = `Correct: ${this.current.name}`;
      window.setTimeout(() => this.nextFlag(), 420);
      return;
    }

    this.addReviewCountry(this.current);
    this.flashHud("wrong");
    this.els.feedback.textContent = "Not quite. Try again or skip it for later.";
  }

  nextFlag() {
    if (this.correct.size === this.countries.length) {
      this.endGame({ gaveUp: false });
      return;
    }

    this.current = this.remaining.find((country) => !this.correct.has(getCountryKey(country)));
    if (!this.current) {
      this.remaining = this.countries.filter((country) => !this.correct.has(getCountryKey(country)));
      this.current = this.remaining.shift();
    } else {
      this.remaining = this.remaining.filter((country) => country !== this.current);
    }

    if (!this.current) {
      this.endGame({ gaveUp: false });
      return;
    }

    this.showPlayHud();
    this.els.flag.src = this.current.flag;
    this.els.flag.alt = `${this.current.name} flag`;
    fitFlagImage(this.els.flag);
    this.els.feedback.textContent = "Type the country name and press Enter.";
  }

  skipCurrent() {
    if (!this.current || this.isEnded) return;
    this.remaining.push(this.current);
    this.els.input.value = "";
    this.els.feedback.textContent = `${this.current.name} skipped. It will come back later.`;
    this.nextFlag();
  }

  giveUp() {
    this.countries.forEach((country) => {
      if (!this.correct.has(getCountryKey(country))) this.addReviewCountry(country);
    });
    this.endGame({ gaveUp: true });
  }

  endGame({ gaveUp }) {
    if (this.isEnded) return;
    this.isEnded = true;
    clearInterval(this.timerId);
    this.els.input.disabled = true;
    this.els.skip.disabled = true;
    this.els.giveUp.disabled = true;

    const elapsed = this.updateTimer();
    const reviewCount = this.reviewCountries.size;
    const overlay = document.createElement("div");
    overlay.className = "flag-typing-end-overlay";
    overlay.innerHTML = `
      <section class="flag-typing-end-card" role="dialog" aria-modal="true" aria-labelledby="flag-typing-end-title">
        <h2 id="flag-typing-end-title">${gaveUp ? "Run ended" : "Flags complete"}</h2>
        <p>${this.correct.size} of ${this.countries.length} flags in ${elapsed}</p>
        <div class="flag-typing-end-actions">
          <button class="text-button primary" type="button" data-retry>Retry</button>
          ${reviewCount ? `<button class="text-button" type="button" data-review>Review incorrect</button>` : ""}
          <button class="text-button" type="button" data-hub>Return to hub</button>
        </div>
      </section>
    `;

    overlay.querySelector("[data-retry]").addEventListener("click", () => navigateToGame());
    overlay.querySelector("[data-hub]").addEventListener("click", () => navigateToHub());
    overlay.querySelector("[data-review]")?.addEventListener("click", () => {
      overlay.remove();
      this.startReview();
    });
    this.stage.querySelector(".flag-typing-game").append(overlay);
  }

  startReview() {
    this.reviewList = [...this.reviewCountries.values()];
    this.reviewIndex = 0;
    this.showReviewItem();
  }

  showReviewItem() {
    if (!this.reviewList?.length) return;
    const country = this.reviewList[this.reviewIndex];
    this.els.hud.classList.add("review-mode");
    this.els.hud.innerHTML = `
      <div class="flag-typing-topline">
        <span>Review <strong>${this.reviewIndex + 1}</strong> / ${this.reviewList.length}</span>
        <span>${this.els.timer.textContent}</span>
      </div>
      <div class="flag-typing-frame"><img data-review-flag alt="${country.name} flag" /></div>
      <h2>${country.name}</h2>
      <p>${formatCountryDetail(country)}</p>
      <div class="flag-typing-actions">
        <button class="text-button" type="button" data-prev>Previous</button>
        <button class="text-button" type="button" data-next>Next</button>
        <button class="text-button primary" type="button" data-retry>Retry</button>
        <button class="text-button" type="button" data-hub>Return to hub</button>
      </div>
    `;
    const img = this.els.hud.querySelector("[data-review-flag]");
    img.src = country.flag;
    fitFlagImage(img);
    this.els.hud.querySelector("[data-prev]").addEventListener("click", () => {
      this.reviewIndex = (this.reviewIndex - 1 + this.reviewList.length) % this.reviewList.length;
      this.showReviewItem();
    });
    this.els.hud.querySelector("[data-next]").addEventListener("click", () => {
      this.reviewIndex = (this.reviewIndex + 1) % this.reviewList.length;
      this.showReviewItem();
    });
    this.els.hud.querySelector("[data-retry]").addEventListener("click", () => navigateToGame());
    this.els.hud.querySelector("[data-hub]").addEventListener("click", () => navigateToHub());
  }

  showPlayHud() {
    this.els.hud.classList.remove("review-mode");
  }

  addReviewCountry(country) {
    this.reviewCountries.set(getCountryKey(country), country);
  }

  flashHud(status) {
    this.els.hud.classList.remove("answer-correct-flash", "answer-wrong-flash");
    void this.els.hud.offsetWidth;
    this.els.hud.classList.add(status === "correct" ? "answer-correct-flash" : "answer-wrong-flash");
  }

  updateTimer() {
    const elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    this.els.timer.textContent = `${mins}:${secs}`;
    return this.els.timer.textContent;
  }
}

function drawStaticMap(svg, geoJson) {
  if (!geoJson?.features?.length) return;
  const content = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const fragment = document.createDocumentFragment();

  geoJson.features.forEach((feature) => {
    if (!feature.geometry) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", featureToPath(feature));
    path.setAttribute("class", "map-country static-map-country");
    fragment.append(path);
  });

  content.append(fragment);
  svg.append(content);
}

function getCountryGuessKeys(country) {
  return [country.name, country.officialName, ...(country.altSpellings || [])].map(normalizeGuess).filter(Boolean);
}

function getCountryKey(country) {
  return country.code || normalizeGuess(country.name);
}

function normalizeGuess(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function formatCountryDetail(country) {
  return [country.region, country.capital?.[0]].filter(Boolean).join(" / ");
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

function fitFlagImage(img) {
  const applyFit = () => {
    const frame = img.closest(".flag-typing-frame");
    if (!frame || !img.naturalWidth || !img.naturalHeight) return;

    const availableWidth = frame.clientWidth - 18;
    const availableHeight = frame.clientHeight - 18;
    const scale = Math.min(availableWidth / img.naturalWidth, availableHeight / img.naturalHeight);

    img.style.width = `${Math.floor(img.naturalWidth * scale)}px`;
    img.style.height = `${Math.floor(img.naturalHeight * scale)}px`;
  };

  if (img.complete) applyFit();
  else img.addEventListener("load", applyFit, { once: true });
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

function navigateToGame() {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "game", gameId: GAME_ID } }));
}

function navigateToHub() {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "hub" } }));
}
