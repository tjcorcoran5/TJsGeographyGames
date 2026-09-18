# Developer mode guide

Developer mode exposes two internal tools on the main hub:

- **Developer Data Studio** edits and rebuilds the compiled country dataset.
- **Developer Globe Studio** previews and rebuilds the baked globe mesh.

## Start the project in developer mode

From the repository root, run:

```sh
node dev-server.mjs
```

Then open:

```text
http://127.0.0.1:5173/
```

The **Developer** card appears automatically on `localhost` and `127.0.0.1`. You can also expose it on another host by adding `?dev` to the page URL:

```text
http://example.test:5173/?dev
```

The query parameter only makes the developer UI visible. Saving requires `dev-server.mjs`, because that server provides the local write endpoints. A basic static file server can display the tools but cannot save their output.

To use another port:

```sh
PORT=8080 node dev-server.mjs
```

Stop the server with `Ctrl+C`.

## Developer Data Studio

Open **Developer** and then **Developer Data Studio**.

1. Select **Load Compiled Dataset** to load `assets/country-data.json`.
2. Search or sort the table to find a record.
3. Edit the visible name, capital, population, region, and membership fields directly.
4. Use **Main** to control whether a record belongs to the standard country set.
5. Use **Use** to include or exclude it from the extended dataset.
6. Expand a row with its `+` button to edit its official name, subregion, area, flag URL, alternative spellings, languages, currencies, borders, and developer notes.
7. Select **Save Updated Dataset** to write the changes to `assets/country-data.json`.

Saving a dataset that contains remote flag URLs also downloads those flags into `assets/flags/` and replaces the remote URLs with local asset paths where the download succeeds.

### Synchronizing source data

**Sync REST Countries** asks the local development server to download the open country source dataset and compare its REST-compatible fields with the loaded dataset. The previous free REST Countries v3 endpoint has been retired, so the server uses the upstream `mledoze/countries` dataset without making a cross-origin browser request. It preserves compiled population values and local flag paths because those fields are not supplied by that source. Changed records receive a comparison panel inside their expanded row. Review the differences and select **Apply REST values** when you want to accept them.

**Sync GeoJSON** reads `assets/country-outlines.geo.json` when that source file exists. If it is absent, the development server reconstructs the feature collection from the geometry already embedded in `country-data.json`. The tool then matches those features to country records and embeds the result in the compiled dataset.

Synchronization only changes the in-memory editor state until you select **Save Updated Dataset**.

## Developer Globe Studio

Open **Developer** and then **Developer Globe Studio**.

1. Choose the mesh quality, outline color, and country-color palette.
2. Select **Generate Preview** to build and inspect the globe in the browser.
3. Select **Save Baked Globe** to write the previewed mesh to `assets/globe-mesh.json`.

Generate a preview before saving. The normal Interactive Globe loads the baked mesh when that file is available.

## Files changed by developer tools

- `assets/country-data.json` — written by Developer Data Studio.
- `assets/flags/` — receives downloaded flag files during dataset saves.
- `assets/globe-mesh.json` — written by Developer Globe Studio.

Review these files with Git before committing, especially after a source synchronization or a high-quality globe bake.

Developer mode is a local editing interface rather than an authentication system. The included server binds to `127.0.0.1`, which keeps its write endpoints local to your computer.
