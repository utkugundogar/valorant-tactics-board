/**
 * All network access to valorant-api.com lives here. Nothing else in the
 * app should call fetch() directly — this keeps endpoint URLs, response
 * shapes, and error handling in one place.
 */

const BASE_URL = "https://valorant-api.com/v1";

/**
 * Generic GET helper for the valorant-api.com JSON envelope
 * ({ status, data }). Throws on non-200 HTTP responses or network errors
 * so callers can handle them with a single try/catch.
 */
async function getJson(endpoint) {
  const response = await fetch(`${BASE_URL}${endpoint}`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return payload.data;
}

/**
 * Fetches all playable agents. Filters out non-playable entries
 * (e.g. dev-only characters) so the roster only shows real agents.
 */
export async function fetchAgents() {
  const agents = await getJson("/agents?isPlayableCharacter=true");
  return agents;
}

/**
 * Curated map pool for the strategy board. The API also returns
 * non-competitive/legacy entries (e.g. "The Range") we don't want to show.
 * Matched case-insensitively against each map's displayName.
 */
const ALLOWED_MAP_NAMES = [
  "Ascent",
  "Split",
  "Fracture",
  "Bind",
  "Abyss",
  "Lotus",
  "Sunset",
  "Corrode",
  "Pearl",
  "Summit",
  "Icebox",
  "Breeze",
];

const ALLOWED_MAP_NAMES_LOWER = new Set(
  ALLOWED_MAP_NAMES.map((name) => name.toLowerCase())
);

/**
 * Fetches all maps, filtered down to ALLOWED_MAP_NAMES.
 */
export async function fetchMaps() {
  const maps = await getJson("/maps");
  return maps.filter((map) => ALLOWED_MAP_NAMES_LOWER.has(map.displayName.toLowerCase()));
}
