import { createTopbar } from "./components/shell.js";
import { categories, games } from "./games/registry.js";

const app = document.querySelector("#app");
let currentCleanup = null;

function setView(node) {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  app.replaceChildren(node);
}

function renderHub() {
  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.append(createTopbar({ showHome: false }));

  const main = document.createElement("main");
  main.className = "hub";
  main.innerHTML = `
    <section class="hub-heading">
      <h1>Geography Games</h1>
      <p>Choose a section, then open a map, globe, quiz, or development tool.</p>
    </section>
    <section class="game-grid" aria-label="Geography game sections"></section>
  `;

  const grid = main.querySelector(".game-grid");
  categories.filter(shouldShowCategory).forEach((category) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "game-card available";
    card.innerHTML = `
      <span class="badge">${category.developerOnly ? "Developer" : "Section"}</span>
      <span>
        <h2>${category.title}</h2>
        <p>${category.description}</p>
      </span>
    `;
    card.addEventListener("click", () => renderCategory(category.id));

    grid.append(card);
  });

  shell.append(main);
  setView(shell);
}

function renderCategory(categoryId) {
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (!category || !shouldShowCategory(category)) {
    renderHub();
    return;
  }

  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.append(createTopbar({ title: category.title, showHome: true, onHome: renderHub }));

  const main = document.createElement("main");
  main.className = "hub";
  main.innerHTML = `
    <section class="hub-heading">
      <h1>${category.title}</h1>
      <p>${category.description}</p>
    </section>
    <section class="game-grid" aria-label="${category.title} apps"></section>
  `;

  const grid = main.querySelector(".game-grid");
  games.filter((game) => game.category === categoryId && shouldShowGame(game)).forEach((game) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `game-card ${game.enabled ? "available" : "disabled"}`;
    card.disabled = !game.enabled;
    card.innerHTML = `
      <span class="badge">${game.developerOnly ? "Developer" : game.enabled ? "Playable" : "Planned"}</span>
      <span>
        <h2>${game.title}</h2>
        <p>${game.description}</p>
      </span>
    `;

    if (game.enabled) {
      card.addEventListener("click", () => renderGame(game.id));
    }

    grid.append(card);
  });

  shell.append(main);
  setView(shell);
}

function shouldShowCategory(category) {
  if (!category.developerOnly) return true;
  return isDevMode();
}

function shouldShowGame(game) {
  if (!game.developerOnly) return true;
  return isDevMode();
}

function isDevMode() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1" || new URLSearchParams(location.search).has("dev");
}

async function renderGame(gameId) {
  const game = games.find((candidate) => candidate.id === gameId);
  if (!game || !game.enabled) {
    renderHub();
    return;
  }

  const screen = document.createElement("div");
  screen.className = "game-screen";
  screen.append(createTopbar({ title: game.title, showHome: true, onHome: () => renderCategory(game.category) }));

  const stage = document.createElement("main");
  stage.className = "game-stage";
  stage.innerHTML = `<div class="loading">Loading ${game.title}...</div>`;
  screen.append(stage);
  setView(screen);

  try {
    currentCleanup = await game.mount(stage);
  } catch (error) {
    console.error(error);
    stage.innerHTML = `
      <div class="error">
        <strong>That game could not load.</strong>
        <div>${error.message || "Please check the console for details."}</div>
      </div>
    `;
  }
}

window.addEventListener("geo:navigate", (event) => {
  const detail = event.detail || {};
  if (detail.view === "hub") {
    renderHub();
    return;
  }
  if (detail.view === "category") {
    renderCategory(detail.categoryId);
    return;
  }
  if (detail.view === "game") {
    renderGame(detail.gameId);
  }
});

renderHub();
