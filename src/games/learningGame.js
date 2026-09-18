import { findCountryMatch, loadCountries, loadCountryGeoJson } from "../data/countryData.js";
import { fitFlagImage } from "../components/fitFlagImage.js";
import { drawCountryOutline } from "../map/countryOutline.js";

const RECENT_QUESTION_LIMIT = 10;
const OPTION_COUNT = 4;

const MODES = {
  capital: {
    ariaLabel: "Capital city learning question",
    instruction: "Which country has this capital city?",
    isEligible: (country) => Boolean(country.capital?.length)
  },
  flag: {
    ariaLabel: "Flag learning question",
    instruction: "Which country uses this flag?",
    isEligible: (country) => Boolean(country.flag)
  },
  outline: {
    ariaLabel: "Country outline learning question",
    instruction: "Which country has this outline?",
    isEligible: (country, feature) => Boolean(feature)
  }
};

export function mountCapitalLearningGame(stage) {
  return mountLearningGame(stage, "capital");
}

export function mountFlagLearningGame(stage) {
  return mountLearningGame(stage, "flag");
}

export function mountOutlineLearningGame(stage) {
  return mountLearningGame(stage, "outline");
}

async function mountLearningGame(stage, modeName) {
  const mode = MODES[modeName];
  stage.innerHTML = `
    <section class="learning-game">
      <main class="learning-card">
        <div class="learning-status" aria-live="polite">
          <span><strong data-correct>0</strong> correct</span>
          <span><strong data-answered>0</strong> answered</span>
          <span>Streak <strong data-streak>0</strong></span>
        </div>
        <p class="learning-instruction">${mode.instruction}</p>
        <div class="learning-prompt" data-prompt role="img" aria-label="${mode.ariaLabel}"></div>
        <div class="learning-options" data-options aria-label="Country choices"></div>
        <p class="learning-feedback" data-feedback aria-live="polite">Choose one answer.</p>
      </main>
    </section>
  `;

  const [countries, geoJson] = await Promise.all([
    loadCountries({ scope: "extended", refresh: true }).catch(() => []),
    loadCountryGeoJson({ interactiveScope: "mapped" })
  ]);
  const questions = countries
    .map((country) => ({ country, feature: modeName === "outline" ? findFeature(country, geoJson) : null }))
    .filter(({ country, feature }) => mode.isEligible(country, feature));

  const game = new LearningGame(stage, questions, modeName);
  game.mount();
  return () => game.dispose();
}

class LearningGame {
  constructor(stage, questions, modeName) {
    this.stage = stage;
    this.questions = questions;
    this.modeName = modeName;
    this.current = null;
    this.recentQuestionKeys = [];
    this.correctCount = 0;
    this.answeredCount = 0;
    this.streak = 0;
    this.acceptingAnswer = false;
    this.nextQuestionTimer = null;
    this.els = {
      prompt: stage.querySelector("[data-prompt]"),
      options: stage.querySelector("[data-options]"),
      feedback: stage.querySelector("[data-feedback]"),
      correct: stage.querySelector("[data-correct]"),
      answered: stage.querySelector("[data-answered]"),
      streak: stage.querySelector("[data-streak]")
    };
    this.onOptionClick = this.handleOptionClick.bind(this);
  }

  mount() {
    this.els.options.addEventListener("click", this.onOptionClick);
    this.showNextQuestion();
  }

  dispose() {
    clearTimeout(this.nextQuestionTimer);
    this.els.options.removeEventListener("click", this.onOptionClick);
  }

  showNextQuestion() {
    const available = this.questions.filter(({ country }) => !this.recentQuestionKeys.includes(getCountryKey(country)));
    const pool = available.length ? available : this.questions;
    this.current = randomItem(pool);
    if (!this.current) {
      this.els.feedback.textContent = "No questions are available for this activity.";
      return;
    }

    this.rememberQuestion(this.current.country);
    this.renderPrompt();
    this.renderOptions();
    this.els.feedback.textContent = "Choose one answer.";
    this.acceptingAnswer = true;
  }

  rememberQuestion(country) {
    this.recentQuestionKeys.push(getCountryKey(country));
    if (this.recentQuestionKeys.length > RECENT_QUESTION_LIMIT) this.recentQuestionKeys.shift();
  }

  renderPrompt() {
    this.els.prompt.replaceChildren();
    if (this.modeName === "capital") {
      const capital = document.createElement("div");
      capital.className = "learning-capital-name";
      capital.textContent = randomItem(this.current.country.capital);
      this.els.prompt.append(capital);
      this.els.prompt.setAttribute("aria-label", `Capital city: ${capital.textContent}`);
      return;
    }

    if (this.modeName === "flag") {
      const image = document.createElement("img");
      image.src = this.current.country.flag;
      image.alt = "Mystery country flag";
      this.els.prompt.append(image);
      fitFlagImage(image, this.els.prompt, 34);
      this.els.prompt.setAttribute("aria-label", "Mystery country flag");
      return;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("role", "img");
    drawCountryOutline(svg, this.current.feature, "Mystery country outline");
    this.els.prompt.append(svg);
    this.els.prompt.setAttribute("aria-label", "Mystery country outline");
  }

  renderOptions() {
    const distractors = shuffle(this.questions.filter((question) => question !== this.current)).slice(0, OPTION_COUNT - 1);
    const options = shuffle([this.current, ...distractors]);
    this.els.options.replaceChildren(
      ...options.map(({ country }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "learning-option";
        button.dataset.countryKey = getCountryKey(country);
        button.textContent = country.name;
        return button;
      })
    );
  }

  handleOptionClick(event) {
    const selected = event.target.closest(".learning-option");
    if (!selected || !this.acceptingAnswer) return;
    this.acceptingAnswer = false;
    this.answeredCount += 1;
    const correctKey = getCountryKey(this.current.country);
    const isCorrect = selected.dataset.countryKey === correctKey;
    const correctOption = [...this.els.options.querySelectorAll(".learning-option")].find(
      (option) => option.dataset.countryKey === correctKey
    );

    this.els.options.querySelectorAll(".learning-option").forEach((option) => {
      option.disabled = true;
    });

    if (isCorrect) {
      this.correctCount += 1;
      this.streak += 1;
      selected.classList.add("answer-correct-flash");
      this.els.feedback.textContent = `Correct: ${this.current.country.name}`;
      this.nextQuestionTimer = window.setTimeout(() => this.showNextQuestion(), 850);
    } else {
      this.streak = 0;
      selected.classList.add("answer-wrong-flash");
      correctOption?.classList.add("answer-correct-reveal");
      this.els.feedback.textContent = `The correct answer is ${this.current.country.name}.`;
      this.nextQuestionTimer = window.setTimeout(() => this.showNextQuestion(), 1700);
    }

    this.els.correct.textContent = String(this.correctCount);
    this.els.answered.textContent = String(this.answeredCount);
    this.els.streak.textContent = String(this.streak);
  }
}

function findFeature(country, geoJson) {
  return geoJson.features.find((feature) => {
    const match = findCountryMatch(feature.properties, [country]);
    return match?.code === country.code || match?.name === country.name;
  });
}

function getCountryKey(country) {
  return country.code || country.name;
}

function randomItem(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function shuffle(values) {
  return values
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}
