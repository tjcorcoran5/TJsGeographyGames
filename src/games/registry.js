import { mountInteractiveGlobeGame } from "./interactiveGlobeGame.js";
import { mountDataStudioGame } from "./dataStudioGame.js";

export const games = [
  {
    id: "interactive-globe",
    title: "Interactive Globe",
    description: "Orbit the earth, select countries, and inspect shared country data.",
    enabled: true,
    mount: mountInteractiveGlobeGame
  },
  {
    id: "flag-quiz",
    title: "Country Flags",
    description: "A three-level flag quiz using the same country source.",
    enabled: false
  },
  {
    id: "countries-of-the-world",
    title: "Countries of the Earth",
    description: "A fast country-name guessing game ready to plug into the shared map modules.",
    enabled: false
  },
  {
    id: "mercator-map",
    title: "Interactive Map",
    description: "A flat map mode for learning and future quiz variants.",
    enabled: false
  },
  {
    id: "data-studio",
    title: "Developer Data Studio",
    description: "Sync sources, edit country records, and save the compiled dataset locally.",
    enabled: true,
    developerOnly: true,
    mount: mountDataStudioGame
  }
];
