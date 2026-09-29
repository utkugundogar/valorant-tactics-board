/**
 * All DOM reads/writes live here. Functions in this module take plain
 * data in and render it — they never fetch data themselves, so they stay
 * easy to test and reuse (e.g. re-rendering the agent list after a filter
 * is applied, without touching the network layer).
 */

const agentListEl = document.getElementById("agent-list");
const mapSelectEl = document.getElementById("map-select");
const boardContainerEl = document.getElementById("board-container");
const boardMapImageEl = document.getElementById("board-map-image");
const boardPlaceholderEl = document.getElementById("board-placeholder");
const boardTokensLayerEl = document.getElementById("board-tokens-layer");
const boardCalloutsLayerEl = document.getElementById("board-callouts-layer");
const boardAbilitiesLayerEl = document.getElementById("board-abilities-layer");
const statusBarEl = document.getElementById("status-bar");

const sideSelectorEl = document.getElementById("side-selector");
const abilityMenuContainerEl = document.getElementById("ability-menu-container");

const agentCardTemplate = document.getElementById("agent-card-template");
const mapOptionTemplate = document.getElementById("map-option-template");
const boardTokenTemplate = document.getElementById("board-token-template");
const boardCalloutTemplate = document.getElementById("board-callout-template");
const abilityLineTemplate = document.getElementById("ability-line-template");
const abilityCircleTemplate = document.getElementById("ability-circle-template");
const abilityPointTemplate = document.getElementById("ability-point-template");

/**
 * Renders the agent roster in the left panel using the <template> defined
 * in index.html. Clears any placeholder/previous content first.
 */
export function renderAgentList(agents) {
  agentListEl.innerHTML = "";

  if (!agents.length) {
    agentListEl.innerHTML = `<p class="panel-placeholder">No agents found.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const agent of agents) {
    const card = agentCardTemplate.content.cloneNode(true);
    const cardEl = card.querySelector(".agent-card");
    const iconEl = card.querySelector(".agent-card-icon");
    const nameEl = card.querySelector(".agent-card-name");

    cardEl.dataset.agentUuid = agent.uuid;
    iconEl.src = agent.displayIcon;
    iconEl.alt = agent.displayName;
    nameEl.textContent = agent.displayName;

    // Drag start/end listeners are attached once, via delegation, in
    // dragdrop.js — no per-card listener needed here.

    fragment.appendChild(card);
  }

  agentListEl.appendChild(fragment);
}

/**
 * Populates the map <select> dropdown from the API's map list.
 */
export function renderMapOptions(maps) {
  mapSelectEl.innerHTML = "";

  const defaultOption = mapOptionTemplate.content.cloneNode(true).querySelector("option");
  defaultOption.value = "";
  defaultOption.textContent = "-- Select a map --";
  mapSelectEl.appendChild(defaultOption);

  const fragment = document.createDocumentFragment();

  for (const map of maps) {
    const option = mapOptionTemplate.content.cloneNode(true).querySelector("option");
    option.value = map.uuid;
    option.textContent = map.displayName;
    fragment.appendChild(option);
  }

  mapSelectEl.appendChild(fragment);
}

/**
 * Swaps the board's background image to the selected map, or shows the
 * placeholder text if no map is selected.
 */
export function renderSelectedMap(map) {
  if (!map) {
    boardMapImageEl.hidden = true;
    boardMapImageEl.src = "";
    boardPlaceholderEl.hidden = false;
    return;
  }

  boardMapImageEl.src = map.displayIcon;
  boardMapImageEl.alt = map.displayName;
  boardMapImageEl.hidden = false;
  boardPlaceholderEl.hidden = true;
}

export function setMapSelectEnabled(enabled) {
  mapSelectEl.disabled = !enabled;
}

/**
 * Manual position fixes for callouts whose computed (top, left) land
 * outside their actual in-game room/boundary — a data quirk on a small
 * number of maps/callouts from valorant-api.com's coordinate fields, not
 * something fixable via the xMultiplier/yScalarToAdd formula itself.
 *
 * Keyed by map displayName, then by the callout's rendered label (the same
 * "superRegionName regionName" string set as calloutEl.textContent below —
 * copy it exactly, including the space, when adding an entry). Values are
 * percentage-point deltas ADDED to the computed left/top (after any
 * GLOBAL_MAP_ADJUSTMENTS entry for the map has already been applied), so a
 * small nudge (e.g. -4) is enough — they are not absolute coordinates.
 *
 * To fix a callout: find its map + exact label here, add an entry with the
 * top/left nudge needed, save, and reselect the map to see it move.
 */
const CALLOUT_POSITION_OVERRIDES = {
  Breeze: {
    "Defender Side Arches": { top: -4 },
    "Mid Wood Doors": { top: -3 },
  },
  Corrode: {
    "A Main": { top: 8 },
    "A Lobby": { top: 5 },
    // "Mid Top" and "Stairs" render on top of each other — nudge them
    // apart. If the browser shows a single combined label instead (e.g.
    // "Mid Topstairs"), rename this pair to that one key and drop the
    // separation offsets since there's only one marker to move.
    "Mid Top": { top: -3, left: -3 },
    "Stairs": { top: 3, left: 3 },
  },
};

/**
 * Map-wide coordinate corrections, applied to every callout on the named
 * map before CALLOUT_POSITION_OVERRIDES is consulted. Use this instead of
 * per-callout overrides when an entire map's callouts share the same
 * systematic offset (e.g. all shifted left/down) rather than a handful of
 * individually broken ones.
 */
const GLOBAL_MAP_ADJUSTMENTS = {
  // Sunset's callouts all render shifted too far left and slightly down —
  // nudge everything right and up. Tweak these two numbers to taste.
  Sunset: { left: 6, top: -3 },
};

function getCalloutOverride(mapDisplayName, calloutLabel) {
  return CALLOUT_POSITION_OVERRIDES[mapDisplayName]?.[calloutLabel] ?? null;
}

/**
 * Renders region-name labels ("A Main", "B Site", ...) from the selected
 * map's `callouts` data. Clears any previous map's labels first, and
 * renders nothing (leaves the layer empty) if no map/callouts are given.
 *
 * Positioning uses valorant-api.com's documented coordinate mapping: each
 * callout's (x, y) is in the map's own coordinate space, and xMultiplier/
 * xScalarToAdd/yMultiplier/yScalarToAdd convert it into a 0–1 fraction of
 * the map image — note x and y are swapped between the callout location
 * and the left/top CSS axes, which is how the API defines it. A map-wide
 * skew is corrected via GLOBAL_MAP_ADJUSTMENTS, then any callout still
 * misplaced after that can be nudged individually via
 * CALLOUT_POSITION_OVERRIDES, both above.
 */
export function renderCallouts(map) {
  boardCalloutsLayerEl.innerHTML = "";

  if (!map || !map.callouts) return;

  const fragment = document.createDocumentFragment();

  for (const callout of map.callouts) {
    const calloutFragment = boardCalloutTemplate.content.cloneNode(true);
    const calloutEl = calloutFragment.querySelector(".board-callout");

    const calloutLabel = [callout.superRegionName, callout.regionName]
      .filter(Boolean)
      .join(" ");

    let leftPercent = (callout.location.y * map.xMultiplier + map.xScalarToAdd) * 100;
    let topPercent = (callout.location.x * map.yMultiplier + map.yScalarToAdd) * 100;

    const globalAdjustment = GLOBAL_MAP_ADJUSTMENTS[map.displayName];
    if (globalAdjustment) {
      leftPercent += globalAdjustment.left ?? 0;
      topPercent += globalAdjustment.top ?? 0;
    }

    const override = getCalloutOverride(map.displayName, calloutLabel);
    if (override) {
      leftPercent += override.left ?? 0;
      topPercent += override.top ?? 0;
    }

    calloutEl.style.left = `${leftPercent}%`;
    calloutEl.style.top = `${topPercent}%`;
    calloutEl.textContent = calloutLabel;

    fragment.appendChild(calloutFragment);
  }

  boardCalloutsLayerEl.appendChild(fragment);
}

/**
 * === Board token rendering (drag-and-drop placement) ===
 * These functions only touch the DOM. dragdrop.js owns the event wiring
 * and state.placedAgents bookkeeping, then calls these to reflect it.
 */

/**
 * Creates a token element for a placed agent and appends it to the board's
 * token layer, positioned via percentage coordinates (so it stays correctly
 * placed if the board is resized). `side` ("attacker" | "defender") is
 * applied as a class for the red/blue visual indicator — this class only
 * ever lands on .board-token elements, never on the roster's .agent-card.
 */
export function createAgentToken(tokenId, agent, xPercent, yPercent, side) {
  const tokenFragment = boardTokenTemplate.content.cloneNode(true);
  const tokenEl = tokenFragment.querySelector(".board-token");
  const iconEl = tokenFragment.querySelector(".board-token-icon");

  tokenEl.dataset.tokenId = tokenId;
  tokenEl.classList.add(side);
  iconEl.src = agent.displayIcon;
  iconEl.alt = agent.displayName;
  positionTokenElement(tokenEl, xPercent, yPercent);

  boardTokensLayerEl.appendChild(tokenFragment);
}

/**
 * Updates an already-placed token's position (used when an existing token
 * is dragged to a new spot on the board).
 */
export function moveAgentToken(tokenId, xPercent, yPercent) {
  const tokenEl = boardTokensLayerEl.querySelector(`[data-token-id="${tokenId}"]`);
  if (!tokenEl) return;
  positionTokenElement(tokenEl, xPercent, yPercent);
}

function positionTokenElement(tokenEl, xPercent, yPercent) {
  tokenEl.style.left = `${xPercent}%`;
  tokenEl.style.top = `${yPercent}%`;
}

/**
 * Removes all placed-agent tokens from the board (e.g. when the selected
 * map changes and old placements no longer apply).
 */
export function clearAgentTokens() {
  boardTokensLayerEl.innerHTML = "";
}

/**
 * Removes a single placed token from the board (e.g. right-click delete).
 */
export function removeAgentToken(tokenId) {
  const tokenEl = boardTokensLayerEl.querySelector(`[data-token-id="${tokenId}"]`);
  if (tokenEl) tokenEl.remove();
}

/**
 * Toggles a visual highlight on the board while a drag is hovering over it.
 */
export function setBoardDropZoneActive(active) {
  boardContainerEl.classList.toggle("drag-over", active);
}

/**
 * Highlights the selected token (click a token to open its ability menu).
 * Pass null to clear the selection.
 */
export function setSelectedToken(tokenId) {
  const tokens = boardTokensLayerEl.querySelectorAll(".board-token");
  for (const token of tokens) {
    token.classList.toggle("selected", tokenId !== null && token.dataset.tokenId === tokenId);
  }
}

/**
 * === Ability system rendering ===
 * abilities.js owns event wiring, the ability-type registry, and
 * state.placedAbilities bookkeeping; these functions only touch the DOM.
 */

/**
 * Renders the ability icon menu for the given agent into the side panel
 * (#ability-menu-container, reserved for this since the initial skeleton).
 * Pass null to clear it (e.g. when no token is selected).
 */
export function renderAbilityMenu(agent) {
  abilityMenuContainerEl.innerHTML = "";
  if (!agent) return;

  // Passive abilities have no placement — everything else (including
  // Ultimate) is offered.
  const placeableAbilities = agent.abilities.filter((ability) => ability.slot !== "Passive");
  if (!placeableAbilities.length) return;

  const titleEl = document.createElement("p");
  titleEl.className = "ability-menu-title";
  titleEl.textContent = `${agent.displayName} Abilities`;

  const listEl = document.createElement("div");
  listEl.className = "ability-menu-list";

  for (const ability of placeableAbilities) {
    const itemEl = document.createElement("button");
    itemEl.type = "button";
    itemEl.className = "ability-menu-item";
    itemEl.dataset.slot = ability.slot;
    itemEl.title = ability.displayName;

    const iconEl = document.createElement("img");
    iconEl.className = "ability-menu-item-icon";
    iconEl.src = ability.displayIcon;
    iconEl.alt = ability.displayName;

    itemEl.appendChild(iconEl);
    listEl.appendChild(itemEl);
  }

  abilityMenuContainerEl.appendChild(titleEl);
  abilityMenuContainerEl.appendChild(listEl);
}

export function clearAbilityMenu() {
  abilityMenuContainerEl.innerHTML = "";
}

/**
 * Reflects which ability (if any) is currently armed for placement.
 */
export function setActiveAbilityMenuItem(slot) {
  const items = abilityMenuContainerEl.querySelectorAll(".ability-menu-item");
  for (const item of items) {
    item.classList.toggle("active", item.dataset.slot === slot);
  }
}

/**
 * Line/wall ability (e.g. Breach's Fault Line). Positioned at `start` as
 * its left edge, then sized/rotated to reach `end` — see positionLineAbility.
 * `thicknessPercent` sets the bar's height as a % of the board's width (the
 * abilities layer is always square, so % height == % width — see the note
 * in positionLineAbility below), so wide paths like Fault Line stay
 * proportionate to the map at any zoom level or window size, unlike a raw
 * pixel height would.
 */
export function createLineAbility(abilityId, side, start, end, thicknessPercent) {
  const fragment = abilityLineTemplate.content.cloneNode(true);
  const shapeEl = fragment.querySelector(".board-ability--line");

  shapeEl.dataset.abilityId = abilityId;
  shapeEl.classList.add(side);
  if (thicknessPercent) shapeEl.style.height = `${thicknessPercent}%`;
  positionLineAbility(shapeEl, start, end);

  boardAbilitiesLayerEl.appendChild(fragment);
}

/**
 * Updates an already-placed line's endpoints (dragging the whole shape, or
 * dragging its rotate/resize handle).
 */
export function moveLineAbility(abilityId, start, end) {
  const shapeEl = boardAbilitiesLayerEl.querySelector(`[data-ability-id="${abilityId}"]`);
  if (!shapeEl) return;
  positionLineAbility(shapeEl, start, end);
}

function positionLineAbility(shapeEl, start, end) {
  const dxPercent = end.xPercent - start.xPercent;
  const dyPercent = end.yPercent - start.yPercent;
  // The wrapper is always square (aspect-ratio: 1/1), so 1% of width and
  // 1% of height are numerically equal — this Pythagorean/atan2 math over
  // raw percent values is geometrically correct with no unit conversion.
  const lengthPercent = Math.hypot(dxPercent, dyPercent);
  const angleDeg = Math.atan2(dyPercent, dxPercent) * (180 / Math.PI);

  shapeEl.style.left = `${start.xPercent}%`;
  shapeEl.style.top = `${start.yPercent}%`;
  shapeEl.style.width = `${lengthPercent}%`;
  shapeEl.style.transform = `rotate(${angleDeg}deg)`;
}

/**
 * Area/smoke ability (e.g. Omen's Dark Cover) — a fixed-diameter circle
 * centered on `start`. `color` (an rgba string from the ability's
 * definition, e.g. Viper's toxic green) overrides the default
 * attacker/defender fill so each agent's smoke reads as its own in-game
 * color; the attacker/defender border is left alone as the side indicator.
 * Circles without a curated color (stuns, reveals, ultimates) keep the
 * plain CSS default.
 */
export function createCircleAbility(abilityId, side, start, diameterPercent, color) {
  const fragment = abilityCircleTemplate.content.cloneNode(true);
  const shapeEl = fragment.querySelector(".board-ability--circle");

  shapeEl.dataset.abilityId = abilityId;
  shapeEl.classList.add(side);
  shapeEl.style.width = `${diameterPercent}%`;
  shapeEl.style.height = `${diameterPercent}%`;
  if (color) shapeEl.style.background = color;
  positionAbilityAnchor(shapeEl, start);

  boardAbilitiesLayerEl.appendChild(fragment);
}

/**
 * Generic point marker for any ability without a curated line/circle
 * definition — shows the ability's own icon so it's still identifiable.
 */
export function createPointAbility(abilityId, side, start, iconUrl, iconAlt) {
  const fragment = abilityPointTemplate.content.cloneNode(true);
  const shapeEl = fragment.querySelector(".board-ability--point");
  const iconEl = fragment.querySelector(".board-ability-icon");

  shapeEl.dataset.abilityId = abilityId;
  shapeEl.classList.add(side);
  iconEl.src = iconUrl;
  iconEl.alt = iconAlt;
  positionAbilityAnchor(shapeEl, start);

  boardAbilitiesLayerEl.appendChild(fragment);
}

/**
 * Repositions an already-placed circle or point ability (dragging the
 * whole shape).
 */
export function moveAbilityAnchor(abilityId, start) {
  const shapeEl = boardAbilitiesLayerEl.querySelector(`[data-ability-id="${abilityId}"]`);
  if (!shapeEl) return;
  positionAbilityAnchor(shapeEl, start);
}

function positionAbilityAnchor(shapeEl, start) {
  shapeEl.style.left = `${start.xPercent}%`;
  shapeEl.style.top = `${start.yPercent}%`;
}

export function removeAbilityShape(abilityId) {
  const shapeEl = boardAbilitiesLayerEl.querySelector(`[data-ability-id="${abilityId}"]`);
  if (shapeEl) shapeEl.remove();
}

export function clearAbilityShapes() {
  boardAbilitiesLayerEl.innerHTML = "";
}

/**
 * Live line preview shown between the first and second click while
 * drawing a line/wall ability. A single reusable element, created lazily
 * and torn down once placement finishes or is cancelled.
 */
let linePreviewEl = null;

export function showLinePreview(side, start, end, thicknessPercent) {
  if (!linePreviewEl) {
    const fragment = abilityLineTemplate.content.cloneNode(true);
    linePreviewEl = fragment.querySelector(".board-ability--line");
    linePreviewEl.classList.add("previewing", side);
    if (thicknessPercent) linePreviewEl.style.height = `${thicknessPercent}%`;
    linePreviewEl.querySelector(".ability-rotate-handle")?.remove();
    boardAbilitiesLayerEl.appendChild(linePreviewEl);
  }
  positionLineAbility(linePreviewEl, start, end);
}

export function hideLinePreview() {
  if (linePreviewEl) {
    linePreviewEl.remove();
    linePreviewEl = null;
  }
}

/**
 * === Side selector (Attacker / Defender toggle) ===
 */

/**
 * Reflects the currently active side on the toolbar buttons (.active class
 * + aria-pressed). Purely visual — app.js owns state.selectedSide.
 */
export function setActiveSideButton(side) {
  const buttons = sideSelectorEl.querySelectorAll(".side-btn");

  for (const button of buttons) {
    const isActive = button.dataset.side === side;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

/**
 * Shows a message in the fixed status bar. `type` controls styling:
 * "info" | "error".
 */
export function showStatus(message, type = "info") {
  statusBarEl.textContent = message;
  statusBarEl.className = `status-${type}`;
}

export function clearStatus() {
  statusBarEl.textContent = "";
  statusBarEl.className = "";
}
