let countriesPromise;

export async function loadCountries({ onlyUN = false } = {}) {
  if (!countriesPromise) {
    countriesPromise = loadCompiledCountries().catch(() => loadRestCountries());
  }

  const countries = await countriesPromise;
  if (!onlyUN) return countries;

  const extraPlayable = new Set(["Palestine", "Vatican City", "Taiwan", "Kosovo"]);
  return countries.filter((country) => country.unMember || extraPlayable.has(country.name));
}

export async function loadCompiledCountries() {
  const response = await fetch("./assets/country-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Compiled country dataset is not available yet.");
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.countries;
}

export async function loadRemoteCountries() {
  return loadRestCountries();
}

async function loadRestCountries() {
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
    fetchCountriesByFields(coreFields),
    fetchCountriesByFields(extraFields)
  ]);

  const extrasByCode = new Map(extraData.map((country) => [country.cca3, country]));
  return coreData.map((country) => normalizeCountry({ ...country, ...extrasByCode.get(country.cca3) }));
}

async function fetchCountriesByFields(fields) {
  const response = await fetch(`https://restcountries.com/v3.1/all?fields=${fields.join(",")}`);
  if (!response.ok) {
    throw new Error(`Could not load REST Countries data (${response.status}).`);
  }

  return response.json();
}

export function findCountryMatch(properties, countries) {
  const candidates = [
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
    .map(normalizeKey);

  return countries.find((country) => {
    const keys = [
      country.code,
      country.cca2,
      country.name,
      country.officialName,
      ...country.altSpellings
    ].map(normalizeKey);

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
    population: country.population,
    altSpellings: country.altSpellings || [],
    region: country.region,
    subregion: country.subregion,
    area: country.area,
    languages: country.languages,
    currencies: country.currencies
  };
}

function normalizeKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}
