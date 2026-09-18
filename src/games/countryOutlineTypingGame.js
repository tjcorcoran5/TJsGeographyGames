import { findCountryMatch, loadCountries, loadCountryGeoJson } from "../data/countryData.js";
import { drawCountryOutline } from "../map/countryOutline.js";
import { featureToPattersonPath, getInitialMapTransform, getPattersonBounds, MAP_VIEWBOX } from "../map/pattersonProjection.js";

export async function mountCountryOutlineTypingGame(stage) {
  return mountCountryOutlineTypingGameWithScope(stage, { scope: "main", gameId: "country-outline-typing" });
}

export async function mountExtendedCountryOutlineTypingGame(stage) {
  return mountCountryOutlineTypingGameWithScope(stage, { scope: "mapped", gameId: "extended-country-outline-typing" });
}

async function mountCountryOutlineTypingGameWithScope(stage, options) {
  stage.innerHTML = `
    <section class="map-game flag-typing-game">
      <div class="map-canvas flag-typing-map">
        <svg class="world-map-svg static-world-map" viewBox="0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}" role="img" aria-label="World map background"></svg>
      </div>
      <main class="flag-typing-hud" data-hud>
        <div class="flag-typing-topline">
          <span><strong data-score>0</strong> / <span data-total>0</span></span>
          <span data-timer>00:00</span>
        </div>
        <div class="country-outline-frame">
          <svg data-country-outline role="img" aria-label="Country outline"></svg>
        </div>
        <form class="flag-typing-form" data-answer-form>
          <input data-answer-input type="text" autocomplete="off" spellcheck="false" placeholder="Type the country..." aria-label="Country name" />
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
    loadCountries({ scope: options.scope, refresh: true }).catch(() => []),
    loadCountryGeoJson({ interactiveScope: options.scope })
  ]);
  const questions = countries
    .map((country) => ({ country, feature: findFeature(country, geoJson) }))
    .filter((question) => question.feature);
  const game = new CountryOutlineTypingGame(stage, questions, geoJson, options.gameId);
  game.mount();
  return () => game.dispose();
}

class CountryOutlineTypingGame {
  constructor(stage, questions, geoJson, gameId) {
    this.stage = stage;
    this.questions = shuffle(questions);
    this.remaining = [...this.questions];
    this.correct = new Set();
    this.reviewQuestions = new Map();
    this.current = null;
    this.startedAt = Date.now();
    this.timerId = null;
    this.isEnded = false;
    this.reviewIndex = 0;
    this.geoJson = geoJson;
    this.gameId = gameId;
    this.els = {
      background: stage.querySelector(".static-world-map"),
      hud: stage.querySelector("[data-hud]"),
      score: stage.querySelector("[data-score]"),
      total: stage.querySelector("[data-total]"),
      timer: stage.querySelector("[data-timer]"),
      outline: stage.querySelector("[data-country-outline]"),
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
    drawStaticMap(this.els.background, this.geoJson);
    this.els.total.textContent = String(this.questions.length);
    this.els.form.addEventListener("submit", this.onSubmit);
    this.els.skip.addEventListener("click", this.onSkip);
    this.els.giveUp.addEventListener("click", this.onGiveUp);
    this.timerId = window.setInterval(() => this.updateTimer(), 1000);
    this.updateTimer();
    this.nextQuestion();
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
    if (getCountryGuessKeys(this.current.country).includes(guess)) {
      const key = getCountryKey(this.current.country);
      this.correct.add(key);
      this.reviewQuestions.delete(key);
      this.els.score.textContent = String(this.correct.size);
      this.els.input.value = "";
      this.flashHud("correct");
      this.els.feedback.textContent = `Correct: ${this.current.country.name}`;
      window.setTimeout(() => this.nextQuestion(), 420);
      return;
    }
    this.addReviewQuestion(this.current);
    this.flashHud("wrong");
    this.els.feedback.textContent = "Not quite. Try again or skip it for later.";
  }

  nextQuestion() {
    if (this.isEnded) return;
    if (this.correct.size === this.questions.length) {
      this.endGame({ gaveUp: false });
      return;
    }
    this.current = this.remaining.find(({ country }) => !this.correct.has(getCountryKey(country)));
    if (!this.current) {
      this.remaining = this.questions.filter(({ country }) => !this.correct.has(getCountryKey(country)));
      this.current = this.remaining.shift();
    } else {
      this.remaining = this.remaining.filter((question) => question !== this.current);
    }
    if (!this.current) {
      this.endGame({ gaveUp: false });
      return;
    }
    drawCountryOutline(this.els.outline, this.current.feature, "Mystery country outline");
    this.els.feedback.textContent = "Type the country name and press Enter.";
  }

  skipCurrent() {
    if (!this.current || this.isEnded) return;
    this.remaining.push(this.current);
    this.els.input.value = "";
    this.els.feedback.textContent = "Country skipped. It will come back later.";
    this.nextQuestion();
  }

  giveUp() {
    this.questions.forEach((question) => {
      if (!this.correct.has(getCountryKey(question.country))) this.addReviewQuestion(question);
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
      <section class="flag-typing-end-card" role="dialog" aria-modal="true" aria-labelledby="outline-typing-end-title">
        <h2 id="outline-typing-end-title">${gaveUp ? "Run ended" : "Outlines complete"}</h2>
        <p>${this.correct.size} of ${this.questions.length} countries in ${elapsed}</p>
        <div class="flag-typing-end-actions">
          <button class="text-button primary" type="button" data-retry>Retry</button>
          ${this.reviewQuestions.size ? `<button class="text-button" type="button" data-review>Review incorrect</button>` : ""}
          <button class="text-button" type="button" data-hub>Return to hub</button>
        </div>
      </section>`;
    overlay.querySelector("[data-retry]").addEventListener("click", () => navigateToGame(this.gameId));
    overlay.querySelector("[data-hub]").addEventListener("click", navigateToHub);
    overlay.querySelector("[data-review]")?.addEventListener("click", () => {
      overlay.remove();
      this.reviewList = [...this.reviewQuestions.values()];
      this.reviewIndex = 0;
      this.showReviewItem();
    });
    this.stage.querySelector(".flag-typing-game").append(overlay);
  }

  showReviewItem() {
    if (!this.reviewList?.length) return;
    const question = this.reviewList[this.reviewIndex];
    this.els.hud.innerHTML = `
      <div class="flag-typing-topline">
        <span>Review <strong>${this.reviewIndex + 1}</strong> / ${this.reviewList.length}</span>
        <span>${this.els.timer.textContent}</span>
      </div>
      <h2 class="capital-country-name">${question.country.name}</h2>
      <div class="country-outline-frame"><svg data-review-outline role="img"></svg></div>
      <p>${question.country.region || ""}</p>
      <div class="flag-typing-actions">
        <button class="text-button" type="button" data-prev>Previous</button>
        <button class="text-button" type="button" data-next>Next</button>
        <button class="text-button primary" type="button" data-retry>Retry</button>
        <button class="text-button" type="button" data-hub>Return to hub</button>
      </div>`;
    drawCountryOutline(this.els.hud.querySelector("[data-review-outline]"), question.feature, `${question.country.name} outline`);
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

  addReviewQuestion(question) {
    this.reviewQuestions.set(getCountryKey(question.country), question);
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

function findFeature(country, geoJson) {
  return geoJson.features.find((feature) => findCountryMatch(feature.properties, [country]));
}

function drawStaticMap(svg, geoJson) {
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

function getCountryGuessKeys(country) {
  return [country.name, country.officialName, ...(country.altSpellings || [])].map(normalizeGuess).filter(Boolean);
}

function getCountryKey(country) {
  return country.code || normalizeGuess(country.name);
}

function normalizeGuess(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/^the\s+/, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function shuffle(values) {
  return values.map((value) => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ value }) => value);
}

function navigateToGame(gameId) {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "game", gameId } }));
}

function navigateToHub() {
  window.dispatchEvent(new CustomEvent("geo:navigate", { detail: { view: "hub" } }));
}
