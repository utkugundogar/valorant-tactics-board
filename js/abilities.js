/**
 * Ability system: select a placed agent, arm one of its abilities from the
 * side-panel menu, then place it on the board.
 *
 * Modular by design — this module doesn't know how to draw anything; it
 * only reads the shape TYPE from abilityDefinitions.js's registry and
 * calls the matching ui.js render function. Adding a new ability drawing
 * type later means adding a case here and a render pair in ui.js, without
 * touching the placement/selection/drag/delete logic below.
 *
 * Placement flow:
 *  - LINE:   1st map click sets the start point, mousemove live-previews
 *            the wall to the cursor, 2nd click commits it.
 *  - CIRCLE / POINT: a single map click places it immediately.
 *
 * All shapes render inside #board-abilities-layer, itself inside
 * #board-zoom-wrapper — the same element zoom.js scales/pans — so
 * abilities positioned as % of that box stay locked to the map exactly
 * like tokens and callouts already do; no zoom/pan-aware math needed here.
 */

import { state } from "./state.js";
import { ABILITY_TYPE, getAbilityDefinition } from "./abilityDefinitions.js";
import { getBoardPercentPosition } from "./boardCoords.js";
import { wasLastRightClickAPan } from "./zoom.js";
import {
  renderAbilityMenu,
  clearAbilityMenu,
  setActiveAbilityMenuItem,
  setSelectedToken,
  createLineAbility,
  moveLineAbility,
  createCircleAbility,
  createPointAbility,
  moveAbilityAnchor,
  removeAbilityShape,
  clearAbilityShapes,
  showLinePreview,
  hideLinePreview,
} from "./ui.js";

const ABILITY_DATA_TYPE = "application/x-ability-id";

let boardContainerEl;
let boardTokensLayerEl;
let boardAbilitiesLayerEl;
let abilityMenuContainerEl;

// Transient interaction state — private to this module, not shared app
// state, same pattern as zoom.js's pan bookkeeping.
let lineDrawStart = null;      // { xPercent, yPercent } | null, while drawing a line
let abilityDragStartPercent = null; // pointer position at the start of an ability drag
let rotatingAbilityId = null;  // id of the line whose end-handle is being dragged

export function setupAbilitySystem() {
  boardContainerEl = document.getElementById("board-container");
  boardTokensLayerEl = document.getElementById("board-tokens-layer");
  boardAbilitiesLayerEl = document.getElementById("board-abilities-layer");
  abilityMenuContainerEl = document.getElementById("ability-menu-container");

  boardTokensLayerEl.addEventListener("click", handleTokenClick);
  abilityMenuContainerEl.addEventListener("click", handleAbilityMenuClick);

  boardContainerEl.addEventListener("click", handleBoardClick);
  boardContainerEl.addEventListener("mousemove", handleBoardMouseMove);
  window.addEventListener("keydown", handleKeyDown);

  boardAbilitiesLayerEl.addEventListener("dragstart", handleAbilityDragStart);
  boardAbilitiesLayerEl.addEventListener("dragend", handleAbilityDragEnd);
  boardAbilitiesLayerEl.addEventListener("contextmenu", handleAbilityContextMenu);

  // Registered independently of dragdrop.js's own dragover/drop handlers on
  // the same element — each checks for its own custom MIME type and no-ops
  // otherwise, so agent-token drags and ability drags never interfere.
  boardContainerEl.addEventListener("dragover", handleBoardDragOverForAbility);
  boardContainerEl.addEventListener("drop", handleBoardDropForAbility);

  // Rotate/resize handle: a raw mousedown+mousemove+mouseup gesture (left
  // button), not native HTML5 DnD — see the "handle" comment in index.html
  // for why draggable="false" on it prevents the parent line's native drag
  // from hijacking this gesture.
  boardContainerEl.addEventListener("mousedown", handleRotateHandleMouseDown);
  window.addEventListener("mousemove", handleRotateHandleMouseMove);
  window.addEventListener("mouseup", handleRotateHandleMouseUp);
}

/**
 * === Token selection ===
 */

function handleTokenClick(event) {
  const token = event.target.closest(".board-token");
  if (!token) return;

  cancelAbilityPlacement();

  const tokenId = token.dataset.tokenId;
  if (state.selectedTokenId === tokenId) {
    deselectToken();
    return;
  }

  selectToken(tokenId);
}

function selectToken(tokenId) {
  const placed = state.placedAgents.find((p) => p.id === tokenId);
  if (!placed) return;

  const agent = state.agents.find((a) => a.uuid === placed.agentUuid);
  if (!agent) return;

  state.selectedTokenId = tokenId;
  setSelectedToken(tokenId);
  renderAbilityMenu(agent);
}

function deselectToken() {
  state.selectedTokenId = null;
  setSelectedToken(null);
  clearAbilityMenu();
}

/**
 * Cascade cleanup when a token is deleted (called from dragdrop.js) — its
 * placed abilities no longer belong to anything on the board, and if it
 * was selected, the now-stale ability menu must close.
 */
export function removeAbilitiesForToken(tokenId) {
  const toRemove = state.placedAbilities.filter((a) => a.tokenId === tokenId);
  state.placedAbilities = state.placedAbilities.filter((a) => a.tokenId !== tokenId);
  for (const ability of toRemove) {
    removeAbilityShape(ability.id);
  }

  if (state.selectedTokenId === tokenId) {
    deselectToken();
  }
}

/**
 * Full reset — called by app.js when the selected map changes, since
 * every placed ability belonged to the previous map.
 */
export function resetAbilitySystem() {
  cancelAbilityPlacement();
  deselectToken();
  state.placedAbilities = [];
  clearAbilityShapes();
}

/**
 * === Arming a tool from the ability menu ===
 */

function handleAbilityMenuClick(event) {
  const item = event.target.closest(".ability-menu-item");
  if (!item) return;

  armAbilityTool(item.dataset.slot);
}

function armAbilityTool(slot) {
  const tokenId = state.selectedTokenId;
  const placed = state.placedAgents.find((p) => p.id === tokenId);
  if (!placed) return;

  const agent = state.agents.find((a) => a.uuid === placed.agentUuid);
  const ability = agent?.abilities.find((a) => a.slot === slot);
  if (!ability) return;

  const definition = getAbilityDefinition(agent.displayName, slot);

  state.activeAbilityTool = {
    tokenId,
    agentUuid: placed.agentUuid,
    ability,
    definition,
    side: placed.side,
  };
  lineDrawStart = null;

  boardContainerEl.classList.add("placing-ability");
  setActiveAbilityMenuItem(slot);
}

function cancelAbilityPlacement() {
  state.activeAbilityTool = null;
  lineDrawStart = null;
  hideLinePreview();
  boardContainerEl.classList.remove("placing-ability");
  setActiveAbilityMenuItem(null);
}

function handleKeyDown(event) {
  if (event.key === "Escape") cancelAbilityPlacement();
}

/**
 * === Placement (click on the board while a tool is armed) ===
 */

function handleBoardClick(event) {
  if (!state.activeAbilityTool) return;
  // Clicks on an existing token/ability are handled by their own listeners
  // (selection, drag, etc.) — never fall through into "place here".
  if (event.target.closest(".board-token, .board-ability")) return;

  const position = getBoardPercentPosition(event.clientX, event.clientY);

  if (state.activeAbilityTool.definition.type === ABILITY_TYPE.LINE) {
    handleLineToolClick(position);
  } else if (state.activeAbilityTool.definition.type === ABILITY_TYPE.CIRCLE) {
    placeCircleAbility(position);
    cancelAbilityPlacement();
  } else {
    placePointAbility(position);
    cancelAbilityPlacement();
  }
}

function handleLineToolClick(position) {
  if (!lineDrawStart) {
    lineDrawStart = position;
    showLinePreview(
      state.activeAbilityTool.side,
      lineDrawStart,
      lineDrawStart,
      state.activeAbilityTool.definition.thicknessPercent
    );
    return;
  }

  const { maxRangePercent } = state.activeAbilityTool.definition;
  const end = clampLineEnd(lineDrawStart, position, maxRangePercent);

  placeLineAbility(lineDrawStart, end);
  cancelAbilityPlacement();
}

function handleBoardMouseMove(event) {
  if (!lineDrawStart || state.activeAbilityTool?.definition.type !== ABILITY_TYPE.LINE) return;

  const { maxRangePercent, thicknessPercent } = state.activeAbilityTool.definition;
  const position = getBoardPercentPosition(event.clientX, event.clientY);
  const clampedPosition = clampLineEnd(lineDrawStart, position, maxRangePercent);
  showLinePreview(state.activeAbilityTool.side, lineDrawStart, clampedPosition, thicknessPercent);
}

/**
 * Caps `end` so it's never further than `maxRangePercent` from `start` —
 * used both while live-previewing a line and when committing/rotating an
 * already-placed one, so a dragged handle can't stretch a wall/skillshot
 * past its in-game range.
 */
function clampLineEnd(start, end, maxRangePercent) {
  const dx = end.xPercent - start.xPercent;
  const dy = end.yPercent - start.yPercent;
  const length = Math.hypot(dx, dy);

  if (!maxRangePercent || length <= maxRangePercent) return end;

  const scale = maxRangePercent / length;
  return {
    xPercent: start.xPercent + dx * scale,
    yPercent: start.yPercent + dy * scale,
  };
}

function placeLineAbility(start, end) {
  const { tokenId, agentUuid, ability, side, definition } = state.activeAbilityTool;
  const { maxRangePercent, thicknessPercent } = definition;
  const abilityId = crypto.randomUUID();

  state.placedAbilities.push({
    id: abilityId, tokenId, agentUuid, slot: ability.slot,
    type: ABILITY_TYPE.LINE, side, start, end, maxRangePercent, thicknessPercent,
  });

  createLineAbility(abilityId, side, start, end, thicknessPercent);
}

function placeCircleAbility(start) {
  const { tokenId, agentUuid, ability, definition, side } = state.activeAbilityTool;
  const abilityId = crypto.randomUUID();
  const diameterPercent = definition.radiusPercent * 2;
  const { color } = definition;

  state.placedAbilities.push({
    id: abilityId, tokenId, agentUuid, slot: ability.slot,
    type: ABILITY_TYPE.CIRCLE, side, start, diameterPercent, color,
  });

  createCircleAbility(abilityId, side, start, diameterPercent, color);
}

function placePointAbility(start) {
  const { tokenId, agentUuid, ability, side } = state.activeAbilityTool;
  const abilityId = crypto.randomUUID();

  state.placedAbilities.push({
    id: abilityId, tokenId, agentUuid, slot: ability.slot,
    type: ABILITY_TYPE.POINT, side, start,
  });

  createPointAbility(abilityId, side, start, ability.displayIcon, ability.displayName);
}

/**
 * === Repositioning a placed ability (drag the whole shape) ===
 * Native HTML5 DnD, same pattern as dragdrop.js's token repositioning:
 * measure the pointer's map position at dragstart and again at drop, and
 * translate every point defining the shape by that same delta so it moves
 * as a rigid body (a line keeps its length and angle).
 */

function handleAbilityDragStart(event) {
  const shapeEl = event.target.closest(".board-ability");
  if (!shapeEl) return;

  event.dataTransfer.setData(ABILITY_DATA_TYPE, shapeEl.dataset.abilityId);
  event.dataTransfer.effectAllowed = "move";
  shapeEl.classList.add("dragging");
  abilityDragStartPercent = getBoardPercentPosition(event.clientX, event.clientY);
}

function handleAbilityDragEnd(event) {
  const shapeEl = event.target.closest(".board-ability");
  if (shapeEl) shapeEl.classList.remove("dragging");
}

function handleBoardDragOverForAbility(event) {
  if (!event.dataTransfer.types.includes(ABILITY_DATA_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleBoardDropForAbility(event) {
  const abilityId = event.dataTransfer.getData(ABILITY_DATA_TYPE);
  if (!abilityId || !abilityDragStartPercent) return;

  event.preventDefault();

  const dropPercent = getBoardPercentPosition(event.clientX, event.clientY);
  const deltaXPercent = dropPercent.xPercent - abilityDragStartPercent.xPercent;
  const deltaYPercent = dropPercent.yPercent - abilityDragStartPercent.yPercent;
  abilityDragStartPercent = null;

  repositionAbility(abilityId, deltaXPercent, deltaYPercent);
}

function repositionAbility(abilityId, deltaXPercent, deltaYPercent) {
  const placed = state.placedAbilities.find((a) => a.id === abilityId);
  if (!placed) return;

  placed.start = {
    xPercent: placed.start.xPercent + deltaXPercent,
    yPercent: placed.start.yPercent + deltaYPercent,
  };

  if (placed.type === ABILITY_TYPE.LINE) {
    placed.end = {
      xPercent: placed.end.xPercent + deltaXPercent,
      yPercent: placed.end.yPercent + deltaYPercent,
    };
    moveLineAbility(abilityId, placed.start, placed.end);
  } else {
    moveAbilityAnchor(abilityId, placed.start);
  }
}

/**
 * === Rotate/resize a placed line by dragging its end handle ===
 */

function handleRotateHandleMouseDown(event) {
  if (event.button !== 0) return;

  const handle = event.target.closest(".ability-rotate-handle");
  if (!handle) return;

  const lineEl = handle.closest(".board-ability--line");
  rotatingAbilityId = lineEl?.dataset.abilityId ?? null;
  event.preventDefault();
}

function handleRotateHandleMouseMove(event) {
  if (!rotatingAbilityId) return;

  const placed = state.placedAbilities.find((a) => a.id === rotatingAbilityId);
  if (!placed) return;

  const position = getBoardPercentPosition(event.clientX, event.clientY);
  placed.end = clampLineEnd(placed.start, position, placed.maxRangePercent);
  moveLineAbility(rotatingAbilityId, placed.start, placed.end);
}

function handleRotateHandleMouseUp() {
  rotatingAbilityId = null;
}

/**
 * === Deletion (right-click, same pan-vs-click guard as token deletion) ===
 */

function handleAbilityContextMenu(event) {
  const shapeEl = event.target.closest(".board-ability");
  if (!shapeEl) return;

  event.preventDefault();
  if (wasLastRightClickAPan()) return;

  const abilityId = shapeEl.dataset.abilityId;
  state.placedAbilities = state.placedAbilities.filter((a) => a.id !== abilityId);
  removeAbilityShape(abilityId);
}
