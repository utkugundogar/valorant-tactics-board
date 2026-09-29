/**
 * Drag-and-drop placement of agents onto the board.
 *
 * Uses the native HTML5 Drag and Drop API:
 *  - agent cards in the roster (draggable="true", set in the template)
 *    are drag *sources* that create a new token on drop
 *  - tokens already on the board are themselves draggable, so dropping
 *    one elsewhere on the board repositions it
 *
 * This module owns all drag event wiring and delegates DOM changes to
 * ui.js and state bookkeeping to state.js — it doesn't render anything
 * itself beyond what those calls produce.
 */

import { state } from "./state.js";
import {
  createAgentToken,
  moveAgentToken,
  removeAgentToken,
  setBoardDropZoneActive,
} from "./ui.js";
import { wasLastRightClickAPan } from "./zoom.js";
import { getBoardPercentPosition } from "./boardCoords.js";
import { removeAbilitiesForToken } from "./abilities.js";

const AGENT_DATA_TYPE = "application/x-agent-uuid";
const TOKEN_DATA_TYPE = "application/x-token-id";

let boardContainerEl;
let boardTokensLayerEl;
let agentListEl;

/**
 * Call once after the agent roster has been rendered. Listeners are
 * attached via delegation on the roster/board containers, so newly
 * rendered agent cards work automatically without re-wiring.
 */
export function setupDragAndDrop() {
  boardContainerEl = document.getElementById("board-container");
  boardTokensLayerEl = document.getElementById("board-tokens-layer");
  agentListEl = document.getElementById("agent-list");

  agentListEl.addEventListener("dragstart", handleAgentDragStart);
  agentListEl.addEventListener("dragend", handleDragEnd);

  boardTokensLayerEl.addEventListener("dragstart", handleTokenDragStart);
  boardTokensLayerEl.addEventListener("dragend", handleDragEnd);
  boardTokensLayerEl.addEventListener("contextmenu", handleTokenContextMenu);

  boardContainerEl.addEventListener("dragover", handleBoardDragOver);
  boardContainerEl.addEventListener("dragenter", handleBoardDragEnter);
  boardContainerEl.addEventListener("dragleave", handleBoardDragLeave);
  boardContainerEl.addEventListener("drop", handleBoardDrop);
}

function handleAgentDragStart(event) {
  const card = event.target.closest(".agent-card");
  if (!card) return;

  event.dataTransfer.setData(AGENT_DATA_TYPE, card.dataset.agentUuid);
  event.dataTransfer.effectAllowed = "copy";
  card.classList.add("dragging");
}

function handleTokenDragStart(event) {
  const token = event.target.closest(".board-token");
  if (!token) return;

  event.dataTransfer.setData(TOKEN_DATA_TYPE, token.dataset.tokenId);
  event.dataTransfer.effectAllowed = "move";
  token.classList.add("dragging");
}

function handleDragEnd(event) {
  const draggedEl = event.target.closest(".agent-card, .board-token");
  if (draggedEl) draggedEl.classList.remove("dragging");
}

/**
 * Right-click on a placed token deletes it. Listener is delegated on
 * boardTokensLayerEl specifically (not the agent roster), so this can
 * only ever fire for cloned tokens on the board — the original agent
 * cards in the side panel have no contextmenu listener at all.
 *
 * Right-click is now overloaded for board panning (zoom.js), so a
 * right-click-drag that happens to start or end over a token would
 * otherwise also delete it. wasLastRightClickAPan() distinguishes a real
 * pan gesture from a stationary right-click, so panning through a token
 * never deletes it.
 */
function handleTokenContextMenu(event) {
  const token = event.target.closest(".board-token");
  if (!token) return;

  event.preventDefault(); // suppress the native browser context menu
  if (wasLastRightClickAPan()) return;

  deleteToken(token.dataset.tokenId);
}

function deleteToken(tokenId) {
  state.placedAgents = state.placedAgents.filter((p) => p.id !== tokenId);
  removeAgentToken(tokenId);
  removeAbilitiesForToken(tokenId); // cascade: its placed abilities go with it
}

function handleBoardDragOver(event) {
  // preventDefault() is required here, otherwise the browser rejects the drop.
  event.preventDefault();
  event.dataTransfer.dropEffect = event.dataTransfer.types.includes(TOKEN_DATA_TYPE)
    ? "move"
    : "copy";
}

function handleBoardDragEnter(event) {
  event.preventDefault();
  setBoardDropZoneActive(true);
}

function handleBoardDragLeave(event) {
  // relatedTarget is null when the drag leaves the window entirely, and a
  // child element when moving between things inside the board — only clear
  // the highlight once we've actually left the board container itself.
  if (!event.relatedTarget || !boardContainerEl.contains(event.relatedTarget)) {
    setBoardDropZoneActive(false);
  }
}

function handleBoardDrop(event) {
  event.preventDefault();
  setBoardDropZoneActive(false);

  const { xPercent, yPercent } = getBoardPercentPosition(event.clientX, event.clientY);

  const tokenId = event.dataTransfer.getData(TOKEN_DATA_TYPE);
  if (tokenId) {
    repositionToken(tokenId, xPercent, yPercent);
    return;
  }

  const agentUuid = event.dataTransfer.getData(AGENT_DATA_TYPE);
  if (agentUuid) {
    placeNewAgent(agentUuid, xPercent, yPercent);
  }
}

function placeNewAgent(agentUuid, xPercent, yPercent) {
  const agent = state.agents.find((a) => a.uuid === agentUuid);
  if (!agent) return;

  const tokenId = crypto.randomUUID();
  const side = state.selectedSide;
  state.placedAgents.push({ id: tokenId, agentUuid, xPercent, yPercent, side });

  createAgentToken(tokenId, agent, xPercent, yPercent, side);
}

function repositionToken(tokenId, xPercent, yPercent) {
  const placed = state.placedAgents.find((p) => p.id === tokenId);
  if (!placed) return;

  placed.xPercent = xPercent;
  placed.yPercent = yPercent;

  moveAgentToken(tokenId, xPercent, yPercent);
}
