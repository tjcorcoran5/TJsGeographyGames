export function createTopbar({ title = "TJ's Geography Games", showHome = true, onHome } = {}) {
  const header = document.createElement("header");
  header.className = "topbar game-header";
  header.innerHTML = `
    <div class="brand">
      <div class="brand-title">${title}</div>
      <div class="brand-subtitle">Interactive maps, flags, and country challenges</div>
    </div>
    <nav class="nav-actions" aria-label="Navigation"></nav>
  `;

  const nav = header.querySelector(".nav-actions");
  if (showHome) {
    const home = document.createElement("button");
    home.className = "text-button";
    home.type = "button";
    home.textContent = "Hub";
    home.addEventListener("click", () => onHome?.());
    nav.append(home);
  }

  return header;
}
