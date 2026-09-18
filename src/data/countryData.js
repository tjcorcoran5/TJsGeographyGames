let countriesPromise;
const MAIN_RECOGNIZED_EXTRA_CODES = new Set(["PSE", "VAT", "TWN", "XKX", "KOS"]);
const MAIN_RECOGNIZED_EXTRA_NAMES = new Set(["Palestine", "Vatican City", "Taiwan", "Kosovo"]);

export async function loadCountries({ onlyUN = false, onlyMainRecognized = false, scope = "all", refresh = false } = {}) {
  if (!countriesPromise || refresh) {
    countriesPromise = loadCompiledCountries().catch(() => loadRestCountries());
  }

  const countries = (await countriesPromise).map(withCountryListFlags);
  if (scope === "main" || onlyUN || onlyMainRecognized) return countries.filter((country) => country.isMainRecognizedCountry);
  if (scope === "extended") return countries.filter((country) => country.isExtendedCountry);
  if (scope === "mapped") return countries.filter((country) => country.isMappedCountry);

  return countries;
}

export async function loadCompiledCountries() {
  const response = await fetch("./assets/country-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Compiled country dataset is not available yet.");
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.countries;
}

export async function loadCompiledGeoJson({ interactiveScope = "mapped" } = {}) {
  const countries = (await loadCompiledCountries()).map(withCountryListFlags);
  const interactiveCountries = filterCountriesByScope(countries, interactiveScope);
  const features = countries
    .filter((country) => country.geoJson?.geometry)
    .map((country) => ({
      type: "Feature",
      properties: {
        ...country.geoJson.properties,
        compiledCode: country.code,
        compiledName: country.name,
        isInteractive: Boolean(findCountryByCodeOrName(country, interactiveCountries))
      },
      geometry: country.geoJson.geometry
    }));

  if (!features.length) throw new Error("Compiled dataset does not contain GeoJSON features.");
  return { type: "FeatureCollection", features };
}

export async function loadCountryGeoJson(options = {}) {
  try {
    return await loadCompiledGeoJson(options);
  } catch (error) {
    const response = await fetch("./assets/country-outlines.geo.json");
    if (!response.ok) throw error;
    return response.json();
  }
}

function filterCountriesByScope(countries, scope) {
  if (scope === "main") return countries.filter((country) => country.isMainRecognizedCountry);
  if (scope === "extended") return countries.filter((country) => country.isExtendedCountry);
  if (scope === "mapped") return countries.filter((country) => country.isMappedCountry);
  return countries;
}

function findCountryByCodeOrName(country, countries) {
  return countries.find((candidate) => candidate.code === country.code || candidate.name === country.name);
}

export async function loadRemoteCountries() {
  return loadRestCountries("/api/dev/rest-countries");
}

async function loadRestCountries(endpoint = "https://restcountries.com/v3.1/all") {
  const coreFields = [
    "name",
    "cca2",
    "cca3",
    "capital",
    "flags",
    "population",
    "altSpellings",
    "region",
    "subregion",
    "area"
  ];
  const extraFields = ["cca3", "borders", "unMember", "languages", "currencies"];

  const [coreData, extraData] = await Promise.all([
    fetchCountriesByFields(coreFields, endpoint),
    fetchCountriesByFields(extraFields, endpoint)
  ]);

  const extrasByCode = new Map(extraData.map((country) => [country.cca3, country]));
  return coreData.map((country) => normalizeCountry({ ...country, ...extrasByCode.get(country.cca3) }));
}

async function fetchCountriesByFields(fields, endpoint) {
  const response = await fetch(`${endpoint}?fields=${fields.join(",")}`);
  if (!response.ok) {
    throw new Error(`Could not load REST Countries data (${response.status}).`);
  }

  return response.json();
}

export function findCountryMatch(properties, countries) {
  const candidates = [
    properties.compiledCode,
    properties.compiledName,
    properties.iso_a3,
    properties.adm0_a3,
    properties.sov_a3,
    properties.gu_a3,
    properties.name,
    properties.admin,
    properties.name_long,
    properties.name_sort,
    properties.brk_name,
    properties.formal_en
  ]
    .filter(Boolean)
    .map(normalizeKey)
    .filter(isUsableMatchKey);

  return countries.find((country) => {
    const keys = [
      country.code,
      country.cca2,
      country.name,
      country.officialName,
      ...country.altSpellings
    ]
      .map(normalizeKey)
      .filter(isUsableMatchKey);

    return keys.some((key) => candidates.includes(key));
  });
}

function normalizeCountry(country) {
  return {
    name: country.name?.common,
    officialName: country.name?.official,
    code: country.cca3,
    cca2: country.cca2,
    capital: country.capital || [],
    borders: country.borders || [],
    flag: country.flags?.svg || country.flags?.png,
    flagAlt: country.flags?.alt,
    unMember: Boolean(country.unMember),
    isMainRecognizedCountry: isMainRecognizedCountry(country),
    population: country.population,
    altSpellings: country.altSpellings || [],
    region: country.region,
    subregion: country.subregion,
    area: country.area,
    languages: country.languages,
    currencies: country.currencies
  };
}

function withCountryListFlags(country) {
  const next = { ...country };
  next.isMainRecognizedCountry =
    typeof next.isMainRecognizedCountry === "boolean"
      ? next.isMainRecognizedCountry
      : Boolean(next.unMember) ||
        MAIN_RECOGNIZED_EXTRA_CODES.has(next.code) ||
        MAIN_RECOGNIZED_EXTRA_NAMES.has(next.name);
  next.isExtendedCountry = next.includeInDataset !== false;
  next.isMappedCountry = next.isExtendedCountry && Boolean(next.hasGeoJsonData || next.geoJson?.geometry);

  return next;
}

function isMainRecognizedCountry(country) {
  return (
    Boolean(country.unMember) ||
    MAIN_RECOGNIZED_EXTRA_CODES.has(country.cca3) ||
    MAIN_RECOGNIZED_EXTRA_NAMES.has(country.name?.common)
  );
}

function normalizeKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function isUsableMatchKey(key) {
  return key && key !== "99" && key !== "999" && key !== "0" && key !== "null";
}
