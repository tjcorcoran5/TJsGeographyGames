# Geography Games

A collection of interactive geography games for learning and testing country names, flags, capital cities, locations, and outlines.

**[Play Geography Games](https://tjcorcoran5.github.io/geographyGames/)**

## Games

The project includes:

- Map challenges for flags, country names, and capital cities
- Typing challenges for flags, capitals, country outlines, and every country on the map
- Complete World modes using the full country and territory dataset
- Multiple-choice learning games for flags, capitals, and country shapes
- An interactive Patterson map and a rotatable 3D globe

The maps support zooming and panning, and the interface adapts to desktop and mobile screen sizes.

## Run locally

The project uses plain HTML, CSS, and JavaScript, so there is no build step or package installation.

Clone the repository and run the included local server from the project directory:

```sh
git clone https://github.com/tjcorcoran5/geographyGames.git
cd geographyGames
node dev-server.mjs
```

Then open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in your browser.

The application can also be served by another static web server, although the included Node server is required to save changes made with the developer tools.

## Project structure

```text
assets/             Country data, flags, and the baked globe mesh
src/components/     Shared interface components
src/data/           Country-data loading and matching
src/games/          Individual games and the game registry
src/globe/          3D globe rendering and geometry
src/map/            Patterson projection and shared map utilities
dev-server.mjs      Local server and developer-tool endpoints
index.html          Application entry point
styles.css          Shared application styles
```

## Developer tools

When the project is opened through `localhost` or `127.0.0.1`, an additional Developer section appears on the hub. It contains tools for editing the country dataset and rebuilding the globe mesh.

See [DEV_MODE.md](DEV_MODE.md) for full instructions.

## Technology

- HTML, CSS, and JavaScript modules
- SVG country maps using the Patterson projection
- [Three.js](https://threejs.org/) for the interactive globe
- GitHub Pages for hosting
