import { mountInteractiveGlobeGame } from "./interactiveGlobeGame.js";
import { mountInteractiveMapGame } from "./interactiveMapGame.js";
import { mountFlagMapGame } from "./flagMapGame.js";
import { mountDataStudioGame } from "./dataStudioGame.js";
import { mountGlobeStudioGame } from "./globeStudioGame.js";

export const categories = [
  {
    id: "interactive",
    title: "Interactive",
    description: "Explore countries through clickable maps and globe views."
  },
  {
    id: "flags",
    title: "Flags",
    description: "Identify countries from their flags in map-based challenges."
  },
  {
    id: "developer",
    title: "Developer",
    description: "Build datasets, bake globe geometry, and tune internal assets.",
    developerOnly: true
  }
];

export const games = [
  {
    id: "interactive-globe",
    category: "interactive",
    title: "Interactive Globe",
    description: "Orbit the earth, select countries, and inspect shared country data.",
    enabled: true,
    mount: mountInteractiveGlobeGame
  },
  {
    id: "flag-quiz",
    category: "flags",
    title: "Flag Map Challenge",
    description: "Find the country on the map that matches the displayed flag.",
    enabled: true,
    mount: mountFlagMapGame
  },
  {
    id: "countries-of-the-world",
    category: "quiz",
    title: "Countries of the Earth",
    description: "A fast country-name guessing game ready to plug into the shared map modules.",
    enabled: false
  },
  {
    id: "mercator-map",
    category: "interactive",
    title: "Interactive Map",
    description: "Pan and zoom a 2D world map, then click countries for details.",
    enabled: true,
    mount: mountInteractiveMapGame
  },
  {
    id: "data-studio",
    category: "developer",
    title: "Developer Data Studio",
    description: "Sync sources, edit country records, and save the compiled dataset locally.",
    enabled: true,
    developerOnly: true,
    mount: mountDataStudioGame
  },
  {
    id: "globe-studio",
    category: "developer",
    title: "Developer Globe Studio",
    description: "Bake globe geometry, preview quality settings, and save runtime globe styling.",
    enabled: true,
    developerOnly: true,
    mount: mountGlobeStudioGame
  }
];
