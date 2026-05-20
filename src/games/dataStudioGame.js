import { findCountryMatch, loadCompiledCountries, loadRemoteCountries } from "../data/countryData.js";

export async function mountDataStudioGame(stage) {
  stage.innerHTML = `
    <section class="data-studio">
      <div class="studio-toolbar">
        <button class="text-button primary" type="button" data-action="sync-rest">Sync REST Countries</button>
        <button class="text-button" type="button" data-action="sync-geo">Load GeoJSON</button>
        <button class="text-button" type="button" data-action="load-compiled">Load Compiled Dataset</button>
        <button class="text-button" type="button" data-action="compile">Compile Dataset</button>
        <button class="text-button" type="button" data-action="save">Save to Project</button>
        <span class="studio-status" data-status>Ready</span>
      </div>
      <div class="studio-layout">
        <aside class="studio-sidebar">
          <div class="studio-source">
            <strong>REST Countries</strong>
            <span data-rest-count>Not synced</span>
          </div>
          <div class="studio-source">
            <strong>GeoJSON Boundaries</strong>
            <span data-geo-count>Not loaded</span>
          </div>
          <div class="studio-source">
            <strong>Compiled Dataset</strong>
            <span data-compiled-count>Not compiled</span>
          </div>
          <input class="studio-search" type="search" placeholder="Search countries" data-search />
          <div class="country-list" data-country-list></div>
        </aside>
        <main class="studio-editor" data-editor>
          <div class="country-panel empty">
            <strong>Developer Data Studio</strong>
            <span>Sync sources, compile a local dataset, edit selected country fields, then save it for the games.</span>
          </div>
        </main>
      </div>
    </section>
  `;

  const state = {
    restCountries: [],
    geoFeatures: [],
    compiledCountries: [],
    selectedCode: null,
    dirty: false
  };

  const els = {
    status: stage.querySelector("[data-status]"),
    restCount: stage.querySelector("[data-rest-count]"),
    geoCount: stage.querySelector("[data-geo-count]"),
    compiledCount: stage.querySelector("[data-compiled-count]"),
    list: stage.querySelector("[data-country-list]"),
    editor: stage.querySelector("[data-editor]"),
    search: stage.querySelector("[data-search]")
  };

  stage.querySelector("[data-action='sync-rest']").addEventListener("click", () => syncRest(state, els));
  stage.querySelector("[data-action='sync-geo']").addEventListener("click", () => syncGeo(state, els));
  stage.querySelector("[data-action='load-compiled']").addEventListener("click", () => loadCompiledDataset(state, els));
  stage.querySelector("[data-action='compile']").addEventListener("click", () => compileDataset(state, els));
  stage.querySelector("[data-action='save']").addEventListener("click", () => saveDataset(state, els));
  els.search.addEventListener("input", () => renderCountryList(state, els));

  return () => {};
}

async function syncRest(state, els) {
  setStatus(els, "Syncing REST Countries...");
  state.restCountries = await loadRemoteCountries();
  els.restCount.textContent = `${state.restCountries.length} records`;
  applyRecognitionFlagsFromRest(state);
  renderEditor(state, els);
  setStatus(els, "REST Countries synced.");
}

async function syncGeo(state, els) {
  setStatus(els, "Loading local GeoJSON...");
  const response = await fetch("./assets/country-outlines.geo.json");
  const geoJson = await response.json();
  state.geoFeatures = geoJson.features || [];
  els.geoCount.textContent = `${state.geoFeatures.length} features`;
  setStatus(els, "GeoJSON loaded.");
}

async function loadCompiledDataset(state, els) {
  setStatus(els, "Loading assets/country-data.json...");

  try {
    state.compiledCountries = await loadCompiledCountries();
  } catch (error) {
    setStatus(els, "No compiled dataset found yet. Compile and save one first.");
    return;
  }

  state.compiledCountries.sort((a, b) => a.name.localeCompare(b.name));
  applyRecognitionFlagsFromRest(state);
  state.selectedCode = state.compiledCountries[0]?.id || null;
  state.dirty = false;
  els.compiledCount.textContent = `${state.compiledCountries.length} countries`;
  renderCountryList(state, els);
  renderEditor(state, els);
  setStatus(els, "Compiled dataset loaded.");
}

function applyRecognitionFlagsFromRest(state) {
  if (!state.restCountries.length || !state.compiledCountries.length) return;

  const restByCode = new Map(state.restCountries.map((country) => [country.code, country]));
  state.compiledCountries = state.compiledCountries.map((country) => {
    const match = restByCode.get(country.code);
    if (!match) return country;

    return {
      ...country,
      unMember: typeof country.unMember === "boolean" ? country.unMember : match.unMember,
      isMainRecognizedCountry:
        typeof country.isMainRecognizedCountry === "boolean" ? country.isMainRecognizedCountry : match.isMainRecognizedCountry
    };
  });
}

function compileDataset(state, els) {
  if (!state.restCountries.length || !state.geoFeatures.length) {
    setStatus(els, "Sync both sources before compiling.");
    return;
  }

  state.compiledCountries = state.geoFeatures.map((feature) => {
    const properties = feature.properties;
    const match = findCountryMatch(properties, state.restCountries);
    const code = match?.code || properties.iso_a3 || properties.adm0_a3 || properties.name;

    return {
      id: code,
      name: match?.name || properties.name || properties.admin,
      officialName: match?.officialName || properties.formal_en || "",
      code,
      cca2: match?.cca2 || properties.iso_a2 || "",
      capital: match?.capital || [],
      population: match?.population ?? properties.pop_est ?? null,
      unMember: Boolean(match?.unMember),
      isMainRecognizedCountry: Boolean(match?.isMainRecognizedCountry),
      area: match?.area ?? null,
      region: match?.region || properties.continent || "",
      subregion: match?.subregion || properties.subregion || "",
      flag: match?.flag || "",
      flagAlt: match?.flagAlt || "",
      borders: match?.borders || [],
      languages: match?.languages || {},
      currencies: match?.currencies || {},
      altSpellings: uniqueStrings([...(match?.altSpellings || []), properties.name, properties.admin, properties.name_long]),
      sources: {
        restCountries: Boolean(match),
        geoJsonName: properties.name || properties.admin || ""
      }
    };
  });

  state.compiledCountries.sort((a, b) => a.name.localeCompare(b.name));
  state.selectedCode = state.compiledCountries[0]?.id || null;
  state.dirty = false;
  els.compiledCount.textContent = `${state.compiledCountries.length} countries`;
  renderCountryList(state, els);
  renderEditor(state, els);
  setStatus(els, "Compiled dataset ready.");
}

async function saveDataset(state, els) {
  if (!state.compiledCountries.length) {
    setStatus(els, "Compile the dataset before saving.");
    return;
  }

  setStatus(els, "Saving assets/country-data.json...");
  const response = await fetch("/api/dev/country-data/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      countries: state.compiledCountries
    })
  });

  if (!response.ok) {
    setStatus(els, "Save failed. Run with node dev-server.mjs to enable project writes.");
    return;
  }

  state.dirty = false;
  setStatus(els, "Saved assets/country-data.json.");
}

function renderCountryList(state, els) {
  const query = els.search.value.trim().toLowerCase();
  const countries = state.compiledCountries.filter((country) => {
    return !query || country.name.toLowerCase().includes(query) || country.code.toLowerCase().includes(query);
  });

  els.list.replaceChildren(
    ...countries.map((country) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `country-list-item ${country.id === state.selectedCode ? "selected" : ""}`;
      button.innerHTML = `<strong>${country.name}</strong><span>${country.code}</span>`;
      button.addEventListener("click", () => {
        state.selectedCode = country.id;
        renderCountryList(state, els);
        renderEditor(state, els);
      });
      return button;
    })
  );
}

function renderEditor(state, els) {
  const country = state.compiledCountries.find((candidate) => candidate.id === state.selectedCode);
  if (!country) return;

  els.editor.innerHTML = `
    <form class="country-edit-form">
      <label>Name<input name="name" value="${escapeAttribute(country.name)}" /></label>
      <label>Official name<input name="officialName" value="${escapeAttribute(country.officialName)}" /></label>
      <label>Capital<input name="capital" value="${escapeAttribute(country.capital.join(", "))}" /></label>
      <label>Population<input name="population" type="number" value="${country.population ?? ""}" /></label>
      <label class="checkbox-field"><input name="isMainRecognizedCountry" type="checkbox" ${country.isMainRecognizedCountry ? "checked" : ""} /> Main recognized country</label>
      <label>Region<input name="region" value="${escapeAttribute(country.region)}" /></label>
      <label>Subregion<input name="subregion" value="${escapeAttribute(country.subregion)}" /></label>
      <label>Alternative spellings<textarea name="altSpellings">${country.altSpellings.join("\n")}</textarea></label>
      <label>Notes<textarea name="developerNotes">${country.developerNotes || ""}</textarea></label>
    </form>
    <pre class="raw-preview">${JSON.stringify(country, null, 2)}</pre>
  `;

  els.editor.querySelector(".country-edit-form").addEventListener("input", (event) => {
    const form = event.currentTarget;
    country.name = form.elements.name.value.trim();
    country.officialName = form.elements.officialName.value.trim();
    country.capital = splitList(form.elements.capital.value);
    country.population = form.elements.population.value ? Number(form.elements.population.value) : null;
    country.isMainRecognizedCountry = form.elements.isMainRecognizedCountry.checked;
    country.region = form.elements.region.value.trim();
    country.subregion = form.elements.subregion.value.trim();
    country.altSpellings = splitList(form.elements.altSpellings.value);
    country.developerNotes = form.elements.developerNotes.value.trim();
    state.dirty = true;
    els.editor.querySelector(".raw-preview").textContent = JSON.stringify(country, null, 2);
    renderCountryList(state, els);
  });
}

function setStatus(els, message) {
  els.status.textContent = message;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function splitList(value) {
  return uniqueStrings(value.split(/\n|,/));
}

function escapeAttribute(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}
