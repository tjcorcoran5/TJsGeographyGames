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
    <div class="hub-game-groups" data-game-groups></div>
  `;

  const groups = main.querySelector("[data-game-groups]");
  categories.filter(shouldShowCategory).forEach((category) => {
    const categoryGames = games
      .filter((game) => game.category === category.id && shouldShowGame(game))
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    if (!categoryGames.length) return;
    const section = document.createElement("section");
    section.className = "hub-game-group";
    section.setAttribute("aria-labelledby", `hub-${category.id}-heading`);
    section.innerHTML = `
      <div class="hub-group-heading">
        <h2 id="hub-${category.id}-heading">${category.title}</h2>
        <p>${category.description}</p>
      </div>
      <div class="game-grid"></div>
    `;
    const grid = section.querySelector(".game-grid");
    categoryGames.forEach((game) => grid.append(createGameCard(game)));
    groups.append(section);
  });

  shell.append(main);
  setView(shell);
}

function createGameCard(game) {
  const card = document.createElement("button");
  const kind = getGameKind(game);
  card.type = "button";
  card.className = `game-card ${game.enabled ? "available" : "disabled"}`;
  card.disabled = !game.enabled;
  card.innerHTML = `
    <span class="badge badge-${kind.id}">${kind.label}</span>
    <span>
      <h2>${game.title}</h2>
      <p>${game.description}</p>
    </span>
  `;
  if (game.enabled) card.addEventListener("click", () => renderGame(game.id));
  return card;
}

function getGameKind(game) {
  if (game.developerOnly) return { id: "developer", label: "Developer" };
  const kinds = {
    "Interactive Maps": { id: "interactive", label: "Interactive Maps" },
    Flags: { id: "flag", label: "Flags" },
    "Country Names": { id: "country", label: "Country Names" },
    "Capital Cities": { id: "capital", label: "Capital Cities" },
    "Country Outlines": { id: "outline", label: "Country Outlines" }
  };
  return kinds[game.section] || { id: "interactive", label: game.section || "Game" };
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
  screen.append(createTopbar({ title: game.title, showHome: true, onHome: renderHub }));

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
  if (detail.view === "game") {
    renderGame(detail.gameId);
  }
});

renderHub();
