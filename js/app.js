/**
 * Valorant Strategy Board — application entry point.
 *
 * Modules are split by concern so future features slot in without
 * touching unrelated code:
 *   - api.js    : all network calls to valorant-api.com
 *   - state.js  : in-memory app state (single source of truth)
 *   - ui.js     : DOM rendering, reads from state, never fetches
 *   - app.js    : wires everything together (this file)
 */

import { fetchAgents, fetchMaps } from "./api.js";
import { state } from "./state.js";
import {
  renderAgentList,
  renderMapOptions,
  renderSelectedMap,
  renderCallouts,
  showStatus,
  clearStatus,
  setMapSelectEnabled,
  clearAgentTokens,
  setActiveSideButton,
} from "./ui.js";
import { setupDragAndDrop } from "./dragdrop.js";
import { setupZoom } from "./zoom.js";
import { setupAbilitySystem, resetAbilitySystem } from "./abilities.js";

/**
 * Bootstraps the app: loads agents + maps in parallel, then renders.
 * Kept intentionally small — it only orchestrates, it doesn't know
 * about DOM details or fetch details.
 */
async function initApp() {
  showStatus("Loading agents and maps...", "info");

  try {
    const [agents, maps] = await Promise.all([fetchAgents(), fetchMaps()]);

    state.agents = agents;
    state.maps = maps;

    renderAgentList(state.agents);
    renderMapOptions(state.maps);
    setMapSelectEnabled(true);
    setupDragAndDrop();
    setupZoom();
    setupAbilitySystem();
    clearStatus();
  } catch (error) {
    console.error("Failed to initialize app:", error);
    showStatus(
      "Couldn't load Valorant data. Check your connection and reload.",
      "error"
    );
  }

  registerEventListeners();
}

/**
 * Central place for top-level event wiring. As features grow (drag-and-drop,
 * ability menu, save/load), register their listeners here or delegate to
 * dedicated setup functions imported from their own modules.
 */
function registerEventListeners() {
  const mapSelect = document.getElementById("map-select");

  mapSelect.addEventListener("change", (event) => {
    const selectedMapUuid = event.target.value;
    const map = state.maps.find((m) => m.uuid === selectedMapUuid);

    state.selectedMap = map ?? null;
    renderSelectedMap(state.selectedMap);
    renderCallouts(state.selectedMap);

    // Placed tokens/abilities belonged to the previous map; drop them when switching.
    state.placedAgents = [];
    clearAgentTokens();
    resetAbilitySystem();
  });

  const sideSelector = document.getElementById("side-selector");

  sideSelector.addEventListener("click", (event) => {
    const button = event.target.closest(".side-btn");
    if (!button) return;

    state.selectedSide = button.dataset.side;
    setActiveSideButton(state.selectedSide);
  });

  // Future: ability menu triggers, save/load buttons, etc. get registered here.
}

document.addEventListener("DOMContentLoaded", initApp);
