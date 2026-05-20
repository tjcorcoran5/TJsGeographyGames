import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/dev/country-data/save") {
      const body = await readBody(request);
      const parsed = JSON.parse(body);
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
