import { mountInteractiveGlobeGame } from "./interactiveGlobeGame.js";
import { mountInteractiveMapGame } from "./interactiveMapGame.js";
import { mountCapitalMapGame, mountCountryMapGame, mountFlagMapGame } from "./flagMapGame.js";
import { mountExtendedFlagTypingGame, mountFlagTypingGame } from "./flagTypingGame.js";
import { mountCapitalTypingGame, mountExtendedCapitalTypingGame } from "./capitalTypingGame.js";
import { mountCountryTypingGame, mountExtendedCountryTypingGame } from "./countryTypingGame.js";
import { mountCountryOutlineTypingGame, mountExtendedCountryOutlineTypingGame } from "./countryOutlineTypingGame.js";
import { mountCapitalLearningGame, mountFlagLearningGame, mountOutlineLearningGame } from "./learningGame.js";
import { mountDataStudioGame } from "./dataStudioGame.js";
import { mountGlobeStudioGame } from "./globeStudioGame.js";

export const categories = [
  {
    id: "classic-challenges",
    title: "Classic Challenges",
    description: "Test your geography knowledge with map and typing challenges."
  },
  {
    id: "explore-learn",
    title: "Explore & Learn",
    description: "Explore the world and build your knowledge of flags, capitals, and country shapes."
  },
  {
    id: "complete-world-challenges",
    title: "Complete World Challenges",
    description: "Take on every country and territory available in the full dataset."
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
    id: "mercator-map",
    category: "explore-learn",
    order: 1,
    section: "Interactive Maps",
    title: "Explore the Map",
    description: "Discover the world at your own pace. Click any country to learn more about it.",
    enabled: true,
    mount: mountInteractiveMapGame
  },
  {
    id: "interactive-globe",
    category: "explore-learn",
    order: 2,
    section: "Interactive Maps",
    title: "Explore the Globe",
    description: "Spin the globe and select a country to learn more about it.",
    enabled: true,
    mount: mountInteractiveGlobeGame
  },
  {
    id: "learning-flags",
    category: "explore-learn",
    order: 3,
    section: "Flags",
    title: "Learn the Flags",
    description: "Build your flag knowledge by choosing the matching country from four options.",
    enabled: true,
    mount: mountFlagLearningGame
  },
  {
    id: "learning-capitals",
    category: "explore-learn",
    order: 4,
    section: "Capital Cities",
    title: "Learn the Capitals",
    description: "Get to know the world’s capitals by matching each capital city to one of four countries.",
    enabled: true,
    mount: mountCapitalLearningGame
  },
  {
    id: "learning-outlines",
    category: "explore-learn",
    order: 5,
    section: "Country Outlines",
    title: "Learn the Shapes",
    description: "Learn to recognise countries by their outlines. Choose the matching country from four options.",
    enabled: true,
    mount: mountOutlineLearningGame
  },
  {
    id: "flag-quiz",
    category: "classic-challenges",
    order: 6,
    section: "Flags",
    title: "Flag to Map",
    description: "Recognise the flag, then select its country on the map.",
    enabled: true,
    mount: mountFlagMapGame
  },
  {
    id: "flag-name-typing",
    category: "classic-challenges",
    order: 2,
    section: "Flags",
    title: "Name That Flag",
    description: "Look at the flag and type the name of the country it belongs to.",
    enabled: true,
    mount: mountFlagTypingGame
  },
  {
    id: "countries-of-the-world",
    category: "classic-challenges",
    order: 5,
    section: "Country Names",
    title: "Country to Map",
    description: "Find the named country and select it on the map.",
    enabled: true,
    mount: mountCountryMapGame
  },
  {
    id: "country-name-typing",
    category: "classic-challenges",
    order: 1,
    section: "Country Names",
    title: "Name Every Country",
    description: "How many countries can you remember? Type their names and watch the map fill in with every correct answer.",
    enabled: true,
    mount: mountCountryTypingGame
  },
  {
    id: "country-outline-typing",
    category: "classic-challenges",
    order: 4,
    section: "Country Outlines",
    title: "Name That Shape",
    description: "Recognise the country from its outline and type its name.",
    enabled: true,
    mount: mountCountryOutlineTypingGame
  },
  {
    id: "capital-name-typing",
    category: "classic-challenges",
    order: 3,
    section: "Capital Cities",
    title: "Name the Country’s Capital",
    description: "Given a country, type the name of its capital city.",
    enabled: true,
    mount: mountCapitalTypingGame
  },
  {
    id: "capital-map-challenge",
    category: "classic-challenges",
    order: 7,
    section: "Capital Cities",
    title: "Capital to Map",
    description: "Read the capital city’s name, then select its country on the map.",
    enabled: true,
    mount: mountCapitalMapGame
  },
  {
    id: "extended-flag-name-typing",
    category: "complete-world-challenges",
    order: 2,
    section: "Flags",
    title: "Name That Flag: Complete World",
    description: "Match flags to countries across the full dataset by typing each country’s name.",
    enabled: true,
    mount: mountExtendedFlagTypingGame
  },
  {
    id: "extended-country-name-typing",
    category: "complete-world-challenges",
    order: 1,
    section: "Country Names",
    title: "Name Every Country: Complete World",
    description: "Go beyond the core 197. Type country names from the full dataset and watch the map fill in.",
    enabled: true,
    mount: mountExtendedCountryTypingGame
  },
  {
    id: "extended-capital-name-typing",
    category: "complete-world-challenges",
    order: 3,
    section: "Capital Cities",
    title: "Name the Country’s Capital: Complete World",
    description: "Match Countries to Capital Cities across the full dataset by typing each country’s name.",
    enabled: true,
    mount: mountExtendedCapitalTypingGame
  },
  {
    id: "extended-country-outline-typing",
    category: "complete-world-challenges",
    order: 4,
    section: "Country Outlines",
    title: "Name That Shape: Complete World",
    description: "Identify country outlines from the full dataset and type their names.",
    enabled: true,
    mount: mountExtendedCountryOutlineTypingGame
  },
  {
    id: "data-studio",
    category: "developer",
    section: "Developer",
    title: "Developer Data Studio",
    description: "Sync sources, edit country records, and save the compiled dataset locally.",
    enabled: true,
    developerOnly: true,
    mount: mountDataStudioGame
  },
  {
    id: "globe-studio",
    category: "developer",
    section: "Developer",
    title: "Developer Globe Studio",
    description: "Bake globe geometry, preview quality settings, and save runtime globe styling.",
    enabled: true,
    developerOnly: true,
    mount: mountGlobeStudioGame
  }
];
