import { findCountryMatch, loadCompiledCountries, loadRemoteCountries } from "../data/countryData.js";

const REGIONS = ["Africa", "Americas", "Antarctic", "Asia", "Europe", "Oceania", ""];
const CORE_SYNC_FIELDS = ["name", "capital", "population", "region", "subregion", "flag", "isMainRecognizedCountry"];

export async function mountDataStudioGame(stage) {
  stage.innerHTML = `
    <section class="data-studio data-studio-wide">
      <div class="studio-toolbar">
        <button class="text-button primary" type="button" data-action="load-compiled">Load Compiled Dataset</button>
        <button class="text-button" type="button" data-action="sync-rest">Sync REST Countries</button>
        <button class="text-button" type="button" data-action="sync-geo">Sync GeoJSON</button>
        <button class="text-button" type="button" data-action="save">Save Updated Dataset</button>
        <span class="studio-status" data-status>Ready</span>
      </div>
      <div class="dataset-summary">
        <div><strong data-total>0</strong><span>Total records</span></div>
        <div><strong data-usable>0</strong><span>Using in dataset</span></div>
        <div><strong data-main>0</strong><span>Main countries</span></div>
        <div><strong data-geo>0</strong><span>Mapped countries</span></div>
        <div><strong data-missing>0</strong><span>Needs review</span></div>
      </div>
      <div class="dataset-tools">
        <input class="studio-search" type="search" placeholder="Search countries, codes, capitals, regions" data-search />
      </div>
      <div class="dataset-table" data-country-list></div>
    </section>
  `;

  const state = {
    compiledCountries: [],
    restCountries: [],
    geoFeatures: [],
    restDiffs: new Map(),
    expanded: new Set(),
    sort: { field: "name", direction: "asc" },
    dirty: false
  };

  const els = {
    status: stage.querySelector("[data-status]"),
    list: stage.querySelector("[data-country-list]"),
    search: stage.querySelector("[data-search]"),
    total: stage.querySelector("[data-total]"),
    usable: stage.querySelector("[data-usable]"),
    main: stage.querySelector("[data-main]"),
    geo: stage.querySelector("[data-geo]"),
    missing: stage.querySelector("[data-missing]")
  };

  stage.querySelector("[data-action='load-compiled']").addEventListener("click", () => loadCompiledDataset(state, els));
  stage.querySelector("[data-action='sync-rest']").addEventListener("click", () => syncRest(state, els));
  stage.querySelector("[data-action='sync-geo']").addEventListener("click", () => syncGeo(state, els));
  stage.querySelector("[data-action='save']").addEventListener("click", () => saveDataset(state, els));
  els.search.addEventListener("input", () => renderDataset(state, els));

  return () => {};
}

async function loadCompiledDataset(state, els) {
  setStatus(els, "Loading assets/country-data.json...");

  try {
    const countries = await loadCompiledCountries();
    state.compiledCountries = countries.map(normalizeDatasetCountry);
  } catch (error) {
    state.compiledCountries = [];
    setStatus(els, "No compiled dataset found yet. Sync REST Countries to create one.");
  }

  sortCountries(state.compiledCountries);
  state.restDiffs.clear();
  state.expanded.clear();
  state.dirty = false;
  renderDataset(state, els);
  if (state.compiledCountries.length) setStatus(els, "Compiled dataset loaded.");
}

async function syncRest(state, els) {
  setStatus(els, "Syncing REST Countries...");
  try {
    state.restCountries = await loadRemoteCountries();
  } catch (error) {
    console.error(error);
    setStatus(els, `REST Countries sync failed: ${error.message || "Unknown error"}`);
    return;
  }

  const existingByCode = new Map(state.compiledCountries.map((country) => [country.code, country]));
  state.restCountries.forEach((restCountry) => {
    const normalized = normalizeDatasetCountry({ ...restCountry, sources: { restCountries: true } });
    const existing = existingByCode.get(normalized.code);

    if (!existing) {
      normalized.includeInDataset = true;
      normalized.needsReview = hasMissingCoreData(normalized);
      state.compiledCountries.push(normalized);
      state.restDiffs.set(normalized.code, { isNew: true, fields: {} });
      return;
    }

    const fields = diffRestFields(existing, normalized);
    if (Object.keys(fields).length) {
      state.restDiffs.set(existing.code, { isNew: false, fields, restCountry: normalized });
    }
  });

  sortCountries(state.compiledCountries);
  state.dirty = true;
  renderDataset(state, els);
  setStatus(els, `REST Countries synced. ${state.restDiffs.size} records need review.`);
}

async function syncGeo(state, els) {
  setStatus(els, "Syncing GeoJSON...");
  const response = await fetch("/api/dev/country-outlines");
  if (!response.ok) {
    setStatus(els, "GeoJSON sync failed. Run with node dev-server.mjs.");
    return;
  }
  const payload = await response.json();
  const geoJson = payload.geoJson;
  state.geoFeatures = geoJson.features || [];

  state.compiledCountries = state.compiledCountries.map((country) => {
    const feature = state.geoFeatures.find((candidate) => {
      const match = findCountryMatch(candidate.properties, [country]);
      return match?.code === country.code || match?.name === country.name;
    });

    return {
      ...country,
      hasGeoJsonData: Boolean(feature),
      geoJson: feature
        ? {
            properties: feature.properties,
            geometry: feature.geometry
          }
        : country.geoJson || null
    };
  });

  state.dirty = true;
  renderDataset(state, els);
  setStatus(els, `GeoJSON synced from ${payload.source}.`);
}

async function saveDataset(state, els) {
  if (!state.compiledCountries.length) {
    setStatus(els, "Load or sync countries before saving.");
    return;
  }

  setStatus(els, "Saving assets/country-data.json...");
  const response = await fetch("/api/dev/country-data/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      countries: state.compiledCountries.map((country) => ({
        ...withDatasetMembership(country),
        needsReview: hasMissingCoreData(country)
      }))
    })
  });

  if (!response.ok) {
    setStatus(els, "Save failed. Run with node dev-server.mjs to enable project writes.");
    return;
  }

  state.dirty = false;
  setStatus(els, "Saved updated compiled dataset.");
}

function renderDataset(state, els) {
  updateSummary(state, els);
  const scrollTop = els.list.scrollTop;
  const scrollLeft = els.list.scrollLeft;

  const query = els.search.value.trim().toLowerCase();
  const countries = sortForDisplay(
    state.compiledCountries.filter((country) => {
      const haystack = [country.name, country.code, country.cca2, country.capital?.join(", "), country.region, country.subregion]
        .join(" ")
        .toLowerCase();
      return !query || haystack.includes(query);
    }),
    state.sort
  );

  const header = document.createElement("div");
  header.className = "dataset-row dataset-header";
  header.innerHTML = `
    <span>Flag</span>
    ${sortableHeader("name", "Name", state)}
    ${sortableHeader("capital", "Capital", state)}
    ${sortableHeader("population", "Population", state)}
    ${sortableHeader("region", "Region", state)}
    ${sortableHeader("isMainRecognizedCountry", "Main", state)}
    ${sortableHeader("hasGeoJsonData", "GeoJSON", state)}
    ${sortableHeader("includeInDataset", "Use", state)}
  `;
  header.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.sort;
      state.sort = {
        field,
        direction: state.sort.field === field && state.sort.direction === "asc" ? "desc" : "asc"
      };
      renderDataset(state, els);
    });
  });

  els.list.replaceChildren(header, ...countries.map((country) => renderCountryRow(country, state, els)));
  els.list.scrollTop = scrollTop;
  els.list.scrollLeft = scrollLeft;
}

function renderCountryRow(country, state, els) {
  const row = document.createElement("article");
  const diff = state.restDiffs.get(country.code);
  const missing = hasMissingCoreData(country);
  const expanded = state.expanded.has(country.id);
  row.className = `dataset-row country-data-row ${missing ? "needs-review" : ""} ${diff ? "has-sync-diff" : ""}`;
  row.dataset.countryId = country.id;

  row.innerHTML = `
    <button class="dataset-expand" type="button" aria-label="Expand ${escapeAttribute(country.name)}">${expanded ? "-" : "+"}</button>
    <span class="dataset-flag">${country.flag ? `<img src="${country.flag}" alt="${escapeAttribute(country.name)} flag" />` : "Missing"}</span>
    <input data-field="name" value="${escapeAttribute(country.name)}" />
    <input data-field="capital" value="${escapeAttribute((country.capital || []).join(", "))}" />
    <input data-field="population" type="number" value="${country.population ?? ""}" />
    <select data-field="region">
      ${REGIONS.map((region) => `<option value="${region}" ${region === (country.region || "") ? "selected" : ""}>${region || "Unknown"}</option>`).join("")}
    </select>
    <label class="mini-toggle"><input data-field="isMainRecognizedCountry" type="checkbox" ${country.isMainRecognizedCountry ? "checked" : ""} /></label>
    <span class="geo-pill ${country.hasGeoJsonData ? "yes" : "no"}">${country.hasGeoJsonData ? "Yes" : "No"}</span>
    <label class="mini-toggle"><input data-field="includeInDataset" type="checkbox" ${country.includeInDataset !== false ? "checked" : ""} /></label>
    <div class="dataset-expanded" ${expanded ? "" : "hidden"}></div>
  `;

  row.querySelector(".dataset-expand").addEventListener("click", () => {
    const scrollTop = els.list.scrollTop;
    const scrollLeft = els.list.scrollLeft;
    if (state.expanded.has(country.id)) state.expanded.delete(country.id);
    else state.expanded.add(country.id);
    renderDataset(state, els);
    requestAnimationFrame(() => {
      els.list.scrollTop = scrollTop;
      els.list.scrollLeft = scrollLeft;
    });
  });

  row.querySelectorAll("input, select, textarea").forEach((input) => {
    input.addEventListener("change", () => updateCountryFromRow(country, row, state, els));
  });
  row.querySelectorAll("input[data-field='name'], input[data-field='capital'], input[data-field='population']").forEach((input) => {
    input.addEventListener("input", () => updateCountryFromRow(country, row, state, els));
  });

  if (expanded) {
    row.querySelector(".dataset-expanded").replaceChildren(renderExpandedPanel(country, diff, state, els));
  }

  return row;
}

function renderExpandedPanel(country, diff, state, els) {
  const panel = document.createElement("div");
  panel.className = "dataset-detail-panel";
  panel.innerHTML = `
    <div class="detail-grid">
      <label>Official name<input data-detail="officialName" value="${escapeAttribute(country.officialName || "")}" /></label>
      <label>Subregion<input data-detail="subregion" value="${escapeAttribute(country.subregion || "")}" /></label>
      <label>Area<input data-detail="area" type="number" value="${country.area ?? ""}" /></label>
      <label>Flag URL<input data-detail="flag" value="${escapeAttribute(country.flag || "")}" /></label>
      <label>Flag alt text<textarea data-detail="flagAlt">${country.flagAlt || ""}</textarea></label>
      <label>Alternative spellings<textarea data-detail="altSpellings">${(country.altSpellings || []).join("\n")}</textarea></label>
      <label>Languages<textarea data-detail="languages">${JSON.stringify(country.languages || {}, null, 2)}</textarea></label>
      <label>Currencies<textarea data-detail="currencies">${JSON.stringify(country.currencies || {}, null, 2)}</textarea></label>
      <label>Borders<textarea data-detail="borders">${(country.borders || []).join(", ")}</textarea></label>
      <label>Developer notes<textarea data-detail="developerNotes">${country.developerNotes || ""}</textarea></label>
    </div>
    <div class="sync-diff-panel">
      ${renderDiffHtml(diff)}
    </div>
  `;

  panel.querySelectorAll("[data-detail]").forEach((input) => {
    input.addEventListener("change", () => updateCountryDetails(country, panel, state, els));
    input.addEventListener("input", () => updateCountryDetails(country, panel, state, els));
  });

  const apply = panel.querySelector("[data-apply-sync]");
  if (apply) {
    apply.addEventListener("click", () => {
      applyRestDiff(country, diff);
      state.restDiffs.delete(country.code);
      state.dirty = true;
      renderDataset(state, els);
    });
  }

  return panel;
}

function updateCountryFromRow(country, row, state, els) {
  country.name = row.querySelector("[data-field='name']").value.trim();
  country.capital = splitList(row.querySelector("[data-field='capital']").value);
  country.population = row.querySelector("[data-field='population']").value ? Number(row.querySelector("[data-field='population']").value) : null;
  country.region = row.querySelector("[data-field='region']").value;
  country.isMainRecognizedCountry = row.querySelector("[data-field='isMainRecognizedCountry']").checked;
  country.includeInDataset = row.querySelector("[data-field='includeInDataset']").checked;
  country.needsReview = hasMissingCoreData(country);
  state.dirty = true;
  updateSummary(state, els);
}

function updateCountryDetails(country, panel, state, els) {
  country.officialName = panel.querySelector("[data-detail='officialName']").value.trim();
  country.subregion = panel.querySelector("[data-detail='subregion']").value.trim();
  country.area = panel.querySelector("[data-detail='area']").value ? Number(panel.querySelector("[data-detail='area']").value) : null;
  country.flag = panel.querySelector("[data-detail='flag']").value.trim();
  country.flagAlt = panel.querySelector("[data-detail='flagAlt']").value.trim();
  country.altSpellings = splitList(panel.querySelector("[data-detail='altSpellings']").value);
  country.languages = parseJsonObject(panel.querySelector("[data-detail='languages']").value, country.languages || {});
  country.currencies = parseJsonObject(panel.querySelector("[data-detail='currencies']").value, country.currencies || {});
  country.borders = splitList(panel.querySelector("[data-detail='borders']").value);
  country.developerNotes = panel.querySelector("[data-detail='developerNotes']").value.trim();
  country.needsReview = hasMissingCoreData(country);
  state.dirty = true;
  updateSummary(state, els);
}

function updateSummary(state, els) {
  const withMembership = state.compiledCountries.map(withDatasetMembership);
  const included = withMembership.filter((country) => country.isExtendedCountry);
  els.total.textContent = String(state.compiledCountries.length);
  els.usable.textContent = String(included.length);
  els.main.textContent = String(included.filter((country) => country.isMainRecognizedCountry).length);
  els.geo.textContent = String(included.filter((country) => country.isMappedCountry).length);
  els.missing.textContent = String(withMembership.filter(hasMissingCoreData).length);
}

function diffRestFields(current, rest) {
  const fields = {};
  CORE_SYNC_FIELDS.forEach((field) => {
    const oldValue = normalizeComparable(field === "flag" ? current.remoteFlag || current.flag : current[field]);
    const newValue = normalizeComparable(rest[field]);
    if (oldValue !== newValue) fields[field] = { oldValue: current[field], newValue: rest[field] };
  });
  return fields;
}

function renderDiffHtml(diff) {
  if (!diff) return `<p>No pending REST sync differences.</p>`;
  if (diff.isNew) return `<p class="sync-new">New country from REST Countries.</p>`;

  const rows = Object.entries(diff.fields)
    .map(([field, values]) => {
      return `<tr><th>${field}</th><td>${formatDiffValue(values.oldValue)}</td><td>${formatDiffValue(values.newValue)}</td></tr>`;
    })
    .join("");

  return `
    <strong>REST sync differences</strong>
    <table class="sync-diff-table">
      <thead><tr><th>Field</th><th>Current</th><th>REST</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button class="text-button" type="button" data-apply-sync>Apply REST values</button>
  `;
}

function applyRestDiff(country, diff) {
  if (!diff?.restCountry) return;
  Object.keys(diff.fields).forEach((field) => {
    country[field] = diff.restCountry[field];
  });
}

function normalizeDatasetCountry(country) {
  const code = country.code || country.cca3 || country.id || country.name;
  return {
    id: country.id || code,
    name: country.name || "",
    officialName: country.officialName || "",
    code,
    cca2: country.cca2 || "",
    capital: Array.isArray(country.capital) ? country.capital : splitList(country.capital || ""),
    population: typeof country.population === "number" ? country.population : country.population ? Number(country.population) : null,
    unMember: Boolean(country.unMember),
    isMainRecognizedCountry: Boolean(country.isMainRecognizedCountry),
    includeInDataset: country.includeInDataset !== false,
    isExtendedCountry: country.isExtendedCountry ?? country.includeInDataset !== false,
    isMappedCountry: Boolean(country.isMappedCountry),
    hasGeoJsonData: Boolean(country.hasGeoJsonData || country.geoJson),
    area: country.area ?? null,
    region: country.region || "",
    subregion: country.subregion || "",
    flag: country.flag || "",
    flagAlt: country.flagAlt || "",
    borders: country.borders || [],
    languages: country.languages || {},
    currencies: country.currencies || {},
    altSpellings: country.altSpellings || [],
    developerNotes: country.developerNotes || "",
    geoJson: country.geoJson || null,
    sources: country.sources || {}
  };
}

function withDatasetMembership(country) {
  const isExtendedCountry = country.includeInDataset !== false;
  return {
    ...country,
    isExtendedCountry,
    isMappedCountry: isExtendedCountry && Boolean(country.hasGeoJsonData || country.geoJson?.geometry)
  };
}

function hasMissingCoreData(country) {
  return !country.flag || !country.name || !country.capital?.length || !country.population || !country.region;
}

function sortCountries(countries) {
  countries.sort((a, b) => a.name.localeCompare(b.name));
}

function sortForDisplay(countries, sort) {
  return [...countries].sort((a, b) => {
    const aValue = getSortValue(a, sort.field);
    const bValue = getSortValue(b, sort.field);
    const result = typeof aValue === "number" && typeof bValue === "number"
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue));
    return sort.direction === "asc" ? result : -result;
  });
}

function getSortValue(country, field) {
  if (field === "capital") return country.capital?.[0] || "";
  if (field === "population") return country.population || 0;
  if (field === "isMainRecognizedCountry" || field === "hasGeoJsonData" || field === "includeInDataset") {
    return country[field] ? 1 : 0;
  }
  return country[field] || "";
}

function sortableHeader(field, label, state) {
  const marker = state.sort.field === field ? (state.sort.direction === "asc" ? " ▲" : " ▼") : "";
  return `<button class="dataset-sort" type="button" data-sort="${field}">${label}${marker}</button>`;
}

function setStatus(els, message) {
  els.status.textContent = message;
}

function splitList(value) {
  if (Array.isArray(value)) return value;
  return [...new Set(String(value || "").split(/\n|,/).map((item) => item.trim()).filter(Boolean))];
}

function parseJsonObject(value, fallback) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeComparable(value) {
  return JSON.stringify(value ?? null);
}

function formatDiffValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value ?? "";
}

function escapeAttribute(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}
