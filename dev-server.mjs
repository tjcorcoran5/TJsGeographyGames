import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
let countrySourcePromise;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://localhost:${port}`);

    if (request.method === "POST" && request.url === "/api/dev/country-data/save") {
      const body = await readBody(request);
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed.countries)) {
        parsed.countries = await saveFlagAssets(parsed.countries);
      }
      await writeFile(join(root, "assets", "country-data.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      sendJson(response, { ok: true });
      return;
    }

    if (request.method === "POST" && request.url === "/api/dev/globe-mesh/save") {
      const body = await readBody(request);
      const parsed = JSON.parse(body);
      await writeFile(join(root, "assets", "globe-mesh.json"), `${JSON.stringify(parsed)}\n`, "utf8");
      sendJson(response, { ok: true });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/dev/rest-countries") {
      const fields = requestUrl.searchParams.get("fields") || "";
      if (!/^[a-zA-Z0-9,]+$/.test(fields)) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("A comma-separated fields parameter is required.");
        return;
      }

      const requestedFields = fields.split(",");
      const countries = await loadRestCompatibleCountries();
      sendJson(response, countries.map((country) => selectFields(country, requestedFields)));
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/dev/country-outlines") {
      sendJson(response, await loadCountryOutlines());
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      response.end();
      return;
    }

    const pathname = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
    const filePath = normalize(join(root, pathname));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end();
      return;
    }

    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    if (request.method === "GET") response.end(content);
    else response.end();
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error.message);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Geography Games dev server running at http://127.0.0.1:${port}/`);
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, payload) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function loadCountryOutlines() {
  try {
    const source = JSON.parse(await readFile(join(root, "assets", "country-outlines.geo.json"), "utf8"));
    return { source: "country-outlines.geo.json", geoJson: source };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const compiled = JSON.parse(await readFile(join(root, "assets", "country-data.json"), "utf8"));
  const features = (compiled.countries || [])
    .filter((country) => country.geoJson?.geometry)
    .map((country) => ({
      type: "Feature",
      properties: {
        ...country.geoJson.properties,
        compiledCode: country.code,
        compiledName: country.name
      },
      geometry: country.geoJson.geometry
    }));

  return {
    source: "embedded country-data.json geometry",
    geoJson: { type: "FeatureCollection", features }
  };
}

async function loadRestCompatibleCountries() {
  if (!countrySourcePromise) {
    countrySourcePromise = Promise.all([
      fetch("https://raw.githubusercontent.com/mledoze/countries/master/countries.json").then((response) => {
        if (!response.ok) throw new Error(`Country source returned ${response.status}.`);
        return response.json();
      }),
      readFile(join(root, "assets", "country-data.json"), "utf8").then(JSON.parse)
    ]).then(([sourceCountries, compiled]) => {
      const compiledByCode = new Map((compiled.countries || []).map((country) => [country.code, country]));
      return sourceCountries.map((country) => {
        const existing = compiledByCode.get(country.cca3);
        return {
          ...country,
          population: existing?.population ?? null,
          flags: {
            svg: existing?.flag || `https://flagcdn.com/${String(country.cca2 || "").toLowerCase()}.svg`,
            alt: existing?.flagAlt || ""
          }
        };
      });
    });
  }

  return countrySourcePromise;
}

function selectFields(country, fields) {
  return Object.fromEntries(fields.filter((field) => field in country).map((field) => [field, country[field]]));
}

async function saveFlagAssets(countries) {
  const flagsDir = join(root, "assets", "flags");
  await mkdir(flagsDir, { recursive: true });

  const saved = [];
  for (const country of countries) {
    saved.push(await saveFlagAsset(country, flagsDir));
  }

  return saved;
}

async function saveFlagAsset(country, flagsDir) {
  if (!country.flag || !/^https?:\/\//i.test(country.flag)) {
    return country;
  }

  try {
    const response = await fetch(country.flag);
    if (!response.ok) return country;

    const contentType = response.headers.get("content-type") || "";
    const ext = getFlagExtension(country.flag, contentType);
    const code = sanitizeFileName(country.code || country.cca2 || country.name);
    const fileName = `${code}${ext}`;
    const filePath = join(flagsDir, fileName);
    const buffer = Buffer.from(await response.arrayBuffer());

    await writeFile(filePath, buffer);

    return {
      ...country,
      remoteFlag: country.remoteFlag || country.flag,
      flag: `assets/flags/${fileName}`
    };
  } catch {
    return country;
  }
}

function getFlagExtension(url, contentType) {
  if (contentType.includes("svg")) return ".svg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";

  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".svg")) return ".svg";
  if (pathname.endsWith(".png")) return ".png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return ".jpg";
  return ".svg";
}

function sanitizeFileName(value) {
  return String(value || "flag").replace(/[^a-z0-9_-]+/gi, "_");
}
