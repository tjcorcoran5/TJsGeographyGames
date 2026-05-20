export function renderCountryPanel(panel, properties, country) {
  const geoName = properties.name || properties.admin || properties.name_long || "Selected country";
  const name = country?.name || geoName;
  const capital = country?.capital?.join(", ") || properties.admin || "Not available";
  const population = formatNumber(country?.population ?? properties.pop_est);
  const region = [country?.region || properties.continent, country?.subregion || properties.subregion]
    .filter(Boolean)
    .join(" / ");
  const area = country?.area ? `${formatNumber(country.area)} km2` : "Not available";
  const languages = country?.languages ? Object.values(country.languages).join(", ") : "Not available";
  const currencies = country?.currencies
    ? Object.values(country.currencies).map((currency) => currency.name).join(", ")
    : "Not available";
  const flag = country?.flag;

  panel.innerHTML = `
    <div class="country-panel">
      <div class="country-panel-header">
        <div class="flag-frame">
          ${flag ? `<img src="${flag}" alt="${name} flag" />` : `<span>${properties.iso_a2 || ""}</span>`}
        </div>
        <div>
          <h2>${name}</h2>
          <p class="region">${region || "Region not available"}</p>
        </div>
      </div>
      <div class="stat-grid">
        ${stat("Capital", capital)}
        ${stat("Population", population)}
        ${stat("Area", area)}
        ${stat("Code", country?.code || properties.iso_a3 || "N/A")}
        ${stat("Languages", languages)}
        ${stat("Currency", currencies)}
      </div>
    </div>
  `;

  fitFlagImage(panel.querySelector(".flag-frame img"));
}

export function emptyCountryPanelText() {
  return `
    <div class="country-panel empty">
      <strong>Select a country</strong>
      <span>Move around the map, then click any country for details.</span>
    </div>
  `;
}

function stat(label, value) {
  return `
    <div class="stat">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value || "Not available"}</div>
    </div>
  `;
}

function formatNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Not available";
  return new Intl.NumberFormat("en").format(value);
}

function fitFlagImage(img) {
  if (!img) return;

  const applyFit = () => {
    const frame = img.closest(".flag-frame");
    if (!frame || !img.naturalWidth || !img.naturalHeight) return;

    const availableWidth = frame.clientWidth - 2;
    const availableHeight = frame.clientHeight - 2;
    const scale = Math.min(availableWidth / img.naturalWidth, availableHeight / img.naturalHeight);

    img.style.width = `${Math.floor(img.naturalWidth * scale)}px`;
    img.style.height = `${Math.floor(img.naturalHeight * scale)}px`;
  };

  if (img.complete) applyFit();
  else img.addEventListener("load", applyFit, { once: true });
}
