import { loadCountries, loadCountryGeoJson } from "../data/countryData.js";
import { featureToPattersonPath, getInitialMapTransform, getPattersonBounds, MAP_VIEWBOX } from "../map/pattersonProjection.js";

const VIEWBOX = MAP_VIEWBOX;
export async function mountCapitalTypingGame(stage) {
  return mountCapitalTypingGameWithScope(stage, { scope: "main", gameId: "capital-name-typing" });
}

export async function mountExtendedCapitalTypingGame(stage) {
  return mountCapitalTypingGameWithScope(stage, { scope: "extended", gameId: "extended-capital-name-typing" });
}

async function mountCapitalTypingGameWithScope(stage, options) {
  stage.innerHTML = `
    <section class="map-game flag-typing-game">
      <div class="map-canvas flag-typing-map">
        <svg class="world-map-svg static-world-map" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" role="img" aria-label="World map background"></svg>
      </div>
      <main class="flag-typing-hud" data-hud>
        <div class="flag-typing-topline">
          <span><strong data-score>0</strong> / <span data-total>0</span></span>
          <span data-timer>00:00</span>
        </div>
        <h2 class="capital-country-name" data-country-name>Loading...</h2>
        <div class="flag-typing-frame"><img data-flag alt="" /></div>
        <form class="flag-typing-form" data-answer-form>
          <input data-answer-input type="text" autocomplete="off" spellcheck="false" placeholder="Type the capital city..." aria-label="Capital city" />
          <button class="text-button primary" type="submit">Submit</button>
        </form>
        <p data-feedback>Type the capital city and press Enter.</p>
        <div class="flag-typing-actions">
          <button class="text-button" type="button" data-skip>Skip</button>
          <button class="text-button flag-typing-give-up" type="button" data-give-up>Give up</button>
        </div>
      </main>
    </section>
  `;

  const [countries, geoJson] = await Promise.all([
    loadCountries({ scope: options.scope, refresh: true }).catch(() => []),
    loadCountryGeoJson({ interactiveScope: options.scope }).catch(() => null)
  ]);

  const game = new CapitalTypingGame(stage, countries, geoJson, options.gameId);
  game.mount();
  return () => game.dispose();
}

class CapitalTypingGame {
  constructor(stage, countries, geoJson, gameId) {
    this.stage = stage;
    this.countries = shuffle(countries.filter((country) => country.flag && country.capital?.length));
    this.remaining = [...this.countries];
    this.correct = new Set();
    this.reviewCountries = new Map();
    this.current = null;
    this.startedAt = Date.now();
    this.timerId = null;
    this.isEnded = false;
    this.reviewIndex = 0;
    this.geoJson = geoJson;
    this.gameId = gameId;

    this.els = {
      svg: stage.querySelector("svg"),
      hud: stage.querySelector("[data-hud]"),
      score: stage.querySelector("[data-score]"),
      total: stage.querySelector("[data-total]"),
      timer: stage.querySelector("[data-timer]"),
      countryName: stage.querySelector("[data-country-name]"),
      flag: stage.querySelector("[data-flag]"),
      form: stage.querySelector("[data-answer-form]"),
      input: stage.querySelector("[data-answer-input]"),
      feedback: stage.querySelector("[data-feedback]"),
      skip: stage.querySelector("[data-skip]"),
      giveUp: stage.querySelector("[data-give-up]")
    };

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
    this.nextCountry();
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

    if (this.current.capital.map(normalizeGuess).includes(guess)) {
      const key = getCountryKey(this.current);
      this.correct.add(key);
      this.reviewCountries.delete(key);
      this.els.score.textContent = String(this.correct.size);
      this.els.input.value = "";
      this.flashHud("correct");
      this.els.feedback.textContent = `Correct: ${formatCapitals(this.current)}.`;
      window.setTimeout(() => this.nextCountry(), 420);
      return;
    }

    this.addReviewCountry(this.current);
    this.flashHud("wrong");
    this.els.feedback.textContent = "Not quite. Try again or skip it for later.";
  }

  nextCountry() {
    if (this.isEnded) return;
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

    this.els.countryName.textContent = this.current.name;
    this.els.flag.src = this.current.flag;
    this.els.flag.alt = `${this.current.name} flag`;
    fitFlagImage(this.els.flag);
    this.els.feedback.textContent = "Type the capital city and press Enter.";
  }

  skipCurrent() {
    if (!this.current || this.isEnded) return;
    this.remaining.push(this.current);
    this.els.input.value = "";
    this.els.feedback.textContent = `${this.current.name} skipped. It will come back later.`;
    this.nextCountry();
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
    const overlay = document.createElement("div");
    overlay.className = "flag-typing-end-overlay";
    overlay.innerHTML = `
      <section class="flag-typing-end-card" role="dialog" aria-modal="true" aria-labelledby="capital-typing-end-title">
        <h2 id="capital-typing-end-title">${gaveUp ? "Run ended" : "Capitals complete"}</h2>
        <p>${this.correct.size} of ${this.countries.length} capitals in ${elapsed}</p>
        <div class="flag-typing-end-actions">
          <button class="text-button primary" type="button" data-retry>Retry</button>
          ${this.reviewCountries.size ? `<button class="text-button" type="button" data-review>Review incorrect</button>` : ""}
          <button class="text-button" type="button" data-hub>Return to hub</button>
        </div>
      </section>
    `;

    overlay.querySelector("[data-retry]").addEventListener("click", () => navigateToGame(this.gameId));
    overlay.querySelector("[data-hub]").addEventListener("click", navigateToHub);
    overlay.querySelector("[data-review]")?.addEventListener("click", () => {
      overlay.remove();
      this.reviewList = [...this.reviewCountries.values()];
      this.reviewIndex = 0;
      this.showReviewItem();
    });
    this.stage.querySelector(".flag-typing-game").append(overlay);
  }

  showReviewItem() {
    if (!this.reviewList?.length) return;
    const country = this.reviewList[this.reviewIndex];
    this.els.hud.innerHTML = `
      <div class="flag-typing-topline">
        <span>Review <strong>${this.reviewIndex + 1}</strong> / ${this.reviewList.length}</span>
        <span>${this.els.timer.textContent}</span>
      </div>
      <h2 class="capital-country-name">${country.name}</h2>
      <div class="flag-typing-frame"><img data-review-flag alt="${country.name} flag" /></div>
      <p><strong>${formatCapitals(country)}</strong></p>
      <p>${country.region || ""}</p>
      <div class="flag-typing-actions">
        <button class="text-button" type="button" data-prev>Previous</button>
        <button class="text-button" type="button" data-next>Next</button>
        <button class="text-button primary" type="button" data-retry>Retry</button>
        <button class="text-button" type="button" data-hub>Return to hub</button>
      </div>
    `;
    const image = this.els.hud.querySelector("[data-review-flag]");
    image.src = country.flag;
    fitFlagImage(image);
    this.els.hud.querySelector("[data-prev]").addEventListener("click", () => {
      this.reviewIndex = (this.reviewIndex - 1 + this.reviewList.length) % this.reviewList.length;
      this.showReviewItem();
    });
    this.els.hud.querySelector("[data-next]").addEventListener("click", () => {
      this.reviewIndex = (this.reviewIndex + 1) % this.reviewList.length;
      this.showReviewItem();
    });
    this.els.hud.querySelector("[data-retry]").addEventListener("click", () => navigateToGame(this.gameId));
    this.els.hud.querySelector("[data-hub]").addEventListener("click", navigateToHub);
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
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    this.els.timer.textContent = `${minutes}:${seconds}`;
    return this.els.timer.textContent;
  }
}

function drawStaticMap(svg, geoJson) {
  if (!geoJson?.features?.length) return;
  const content = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const transform = getInitialMapTransform(getPattersonBounds(geoJson));
  content.setAttribute("transform", `translate(${transform.x} ${transform.y}) scale(${transform.scale})`);
  const fragment = document.createDocumentFragment();
  geoJson.features.forEach((feature) => {
    if (!feature.geometry) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", featureToPattersonPath(feature));
    path.setAttribute("class", "map-country static-map-country");
    fragment.append(path);
  });
  content.append(fragment);
  svg.append(content);
}

function fitFlagImage(image) {
  const applyFit = () => {
    const frame = image.closest(".flag-typing-frame");
    if (!frame || !image.naturalWidth || !image.naturalHeight) return;
    const scale = Math.min((frame.clientWidth - 18) / image.naturalWidth, (frame.clientHeight - 18) / image.naturalHeight);
    image.style.width = `${Math.floor(image.naturalWidth * scale)}px`;
    image.style.height = `${Math.floor(image.naturalHeight * scale)}px`;
  };
  if (image.complete) applyFit();
  else image.addEventListener("load", applyFit, { once: true });
}

function formatCapitals(country) {
  return country.capital.join(" / ");
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
    .replace(/[^a-z0-9]+/g, "");
}

function shuffle(values) {
  return values
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function navigateToGame(gameId) {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "game", gameId } }));
}

function navigateToHub() {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "hub" } }));
}
