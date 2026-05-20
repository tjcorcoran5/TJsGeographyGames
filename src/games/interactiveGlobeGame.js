import { loadCountries, findCountryMatch } from "../data/countryData.js";
import { InteractiveGlobe } from "../globe/InteractiveGlobe.js";

export async function mountInteractiveGlobeGame(stage) {
  stage.innerHTML = `
    <section class="globe-game">
      <div class="globe-canvas" data-globe-canvas></div>
      <aside class="globe-side-panel" aria-live="polite">
        <div class="country-panel empty">
          <strong>Select a country</strong>
          <span>Drag the globe to rotate it, scroll to zoom, then click any country for details.</span>
        </div>
      </aside>
      <div class="globe-hint">Drag to orbit. Scroll to zoom. Click a country to open its profile.</div>
    </section>
  `;

  const [countriesResult, outlines] = await Promise.all([
    loadCountries({ onlyUN: false }).catch((error) => {
      console.warn(error);
      return [];
    }),
    fetch("./assets/country-outlines.geo.json").then((response) => response.json())
  ]);

  const countries = countriesResult;

  const panel = stage.querySelector(".globe-side-panel");
  const globe = new InteractiveGlobe(stage.querySelector("[data-globe-canvas]"), {
    onCountrySelected: (feature) => {
      const match = findCountryMatch(feature.properties, countries);
      renderCountryPanel(panel, feature.properties, match);
    }
  });

  await globe.loadGeoJson(outlines);
  globe.start();

  return () => globe.dispose();
}

function renderCountryPanel(panel, properties, country) {
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
