import { loadCountries, findCountryMatch, loadCountryGeoJson } from "../data/countryData.js";
import { emptyCountryPanelText, renderCountryPanel } from "../components/countryPanel.js";
import { InteractiveGlobe } from "../globe/InteractiveGlobe.js";

export async function mountInteractiveGlobeGame(stage) {
  stage.innerHTML = `
    <section class="globe-game">
      <div class="globe-canvas" data-globe-canvas></div>
      <aside class="globe-side-panel" aria-live="polite">
        ${emptyCountryPanelText()}
      </aside>
      <div class="globe-hint">Drag to orbit. Scroll to zoom. Click a country to open its profile.</div>
    </section>
  `;

  const [countriesResult, globeAsset] = await Promise.all([
    loadCountries({ scope: "mapped", refresh: true }).catch((error) => {
      console.warn(error);
      return [];
    }),
    loadGlobeAsset()
  ]);

  const countries = countriesResult;

  const panel = stage.querySelector(".globe-side-panel");
  const globe = new InteractiveGlobe(stage.querySelector("[data-globe-canvas]"), {
    onCountrySelected: (feature) => {
      const match = findCountryMatch(feature.properties, countries);
      renderCountryPanel(panel, feature.properties, match);
    }
  });

  if (globeAsset.type === "baked") {
    await globe.loadBakedMesh(filterBakedMesh(globeAsset.data, countries));
  } else {
    await globe.loadGeoJson(globeAsset.data);
  }
  globe.start();

  return () => globe.dispose();
}

function filterBakedMesh(bakedMesh, countries) {
  return {
    ...bakedMesh,
    countries: bakedMesh.countries.map((country) => ({
      ...country,
      properties: {
        ...country.properties,
        isInteractive: Boolean(findCountryMatch(country.properties, countries))
      }
    }))
  };
}

async function loadGlobeAsset() {
  try {
    const response = await fetch("./assets/globe-mesh.json", { cache: "no-store" });
    if (response.ok) {
      return { type: "baked", data: await response.json() };
    }
  } catch (error) {
    console.warn(error);
  }

  return { type: "geojson", data: await loadCountryGeoJson({ interactiveScope: "mapped" }) };
}
