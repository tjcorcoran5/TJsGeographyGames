import { bakeGlobeMesh } from "../globe/bakeGlobeMesh.js";
import { InteractiveGlobe } from "../globe/InteractiveGlobe.js";

export async function mountGlobeStudioGame(stage) {
  stage.innerHTML = `
    <section class="data-studio globe-studio">
      <div class="studio-toolbar">
        <button class="text-button primary" type="button" data-action="generate">Generate Preview</button>
        <button class="text-button" type="button" data-action="save">Save Baked Globe</button>
        <label class="inline-control">Quality
          <select data-quality>
            <option value="fast">Fast</option>
            <option value="balanced" selected>Balanced</option>
            <option value="high">High</option>
          </select>
        </label>
        <label class="inline-control">Outline <input type="color" data-outline value="#17211c" /></label>
        <label class="inline-control">Palette <input data-palette value="#76a9c7,#a1c181,#f0b36a,#9bb7d4,#d6a4a4,#8fb9a8,#d8c76f" /></label>
        <span class="studio-status" data-status>Ready</span>
      </div>
      <div class="globe-studio-preview" data-preview></div>
    </section>
  `;

  const state = { bakedMesh: null, preview: null };
  const els = {
    preview: stage.querySelector("[data-preview]"),
    status: stage.querySelector("[data-status]"),
    quality: stage.querySelector("[data-quality]"),
    outline: stage.querySelector("[data-outline]"),
    palette: stage.querySelector("[data-palette]")
  };

  stage.querySelector("[data-action='generate']").addEventListener("click", () => generatePreview(state, els));
  stage.querySelector("[data-action='save']").addEventListener("click", () => saveBakedGlobe(state, els));

  return () => state.preview?.dispose();
}

async function generatePreview(state, els) {
  setStatus(els, "Loading GeoJSON...");
  const response = await fetch("./assets/country-outlines.geo.json");
  const geoJson = await response.json();

  setStatus(els, "Baking globe mesh...");
  await new Promise((resolve) => setTimeout(resolve, 20));
  state.bakedMesh = bakeGlobeMesh(geoJson, {
    quality: els.quality.value,
    outlineColor: els.outline.value,
    palette: els.palette.value.split(",").map((color) => color.trim()).filter(Boolean)
  });

  state.preview?.dispose();
  els.preview.replaceChildren();
  state.preview = new InteractiveGlobe(els.preview);
  await state.preview.loadBakedMesh(state.bakedMesh);
  state.preview.start();
  setStatus(els, `Preview ready: ${state.bakedMesh.countries.length} countries.`);
}

async function saveBakedGlobe(state, els) {
  if (!state.bakedMesh) {
    setStatus(els, "Generate a preview before saving.");
    return;
  }

  setStatus(els, "Saving assets/globe-mesh.json...");
  const response = await fetch("/api/dev/globe-mesh/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.bakedMesh)
  });

  setStatus(els, response.ok ? "Saved assets/globe-mesh.json." : "Save failed. Run the Node dev server.");
}

function setStatus(els, message) {
  els.status.textContent = message;
}
