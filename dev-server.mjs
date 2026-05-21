import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);

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

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      response.end();
      return;
    }

    const url = new URL(request.url, `http://localhost:${port}`);
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
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
