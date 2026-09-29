/**
 * Scroll-to-zoom + right-click-drag-to-pan for the tactical board.
 *
 * Both gestures write to the same CSS transform on #board-zoom-wrapper —
 * the single element that contains the map image AND the placed-agent
 * tokens layer — so this one module owns that transform exclusively via
 * applyTransform(). Because tokens are positioned as a percentage of the
 * wrapper's own box, transforming the wrapper moves the map and every
 * token by the exact same amount, so placed agents never drift from their
 * tactical position.
 *
 * Transform order is `scale(...) translate(...)`: translate is applied in
 * the wrapper's local (pre-scale) space, so its on-screen effect is
 * multiplied by the current scale. Panning math divides the raw mouse
 * delta by the scale before accumulating it, which cancels that
 * multiplication out — the net result is the map tracks the cursor 1:1
 * on screen no matter how zoomed in or out the board is.
 */

import { state } from "./state.js";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_DEFAULT = 0.9; // slightly zoomed out so the whole map fits with a small margin
const ZOOM_STEP = 0.1;

const RIGHT_MOUSE_BUTTON = 2;
const PAN_DRAG_THRESHOLD = 3; // px of movement before a right-click counts as a pan, not a click

let boardContainerEl;
let boardZoomWrapperEl;

let isPanning = false;
let lastPointerX = 0;
let lastPointerY = 0;
let panDistance = 0; // cumulative movement for the current right-button gesture

/**
 * Call once after the board DOM exists. Sets the initial "fit" zoom level
 * and wires the wheel + right-click-drag listeners.
 */
export function setupZoom() {
  boardContainerEl = document.getElementById("board-container");
  boardZoomWrapperEl = document.getElementById("board-zoom-wrapper");

  state.boardPanX = 0;
  state.boardPanY = 0;
  applyZoom(ZOOM_DEFAULT);

  boardContainerEl.addEventListener("wheel", handleWheelZoom, { passive: false });

  boardContainerEl.addEventListener("mousedown", handlePanStart);
  boardContainerEl.addEventListener("mousemove", handlePanMove);
  boardContainerEl.addEventListener("mouseup", handlePanEnd);
  boardContainerEl.addEventListener("mouseleave", handlePanEnd);

  // Left-click drag-and-drop of agents (dragdrop.js) uses the native HTML5
  // drag API, which is a completely separate event pipeline from these
  // mouse events — and handlePanStart ignores anything but the right
  // button — so the two gestures never contend with each other.
  boardContainerEl.addEventListener("contextmenu", handleContextMenu);
}

function handleWheelZoom(event) {
  // Without this, the page/panel would scroll instead of (or in addition
  // to) the board zooming.
  event.preventDefault();

  const direction = event.deltaY < 0 ? 1 : -1;
  const nextScale = clamp(state.boardScale + direction * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);

  applyZoom(nextScale);
}

function applyZoom(scale) {
  state.boardScale = scale;
  applyTransform();
}

function handlePanStart(event) {
  if (event.button !== RIGHT_MOUSE_BUTTON) return;

  isPanning = true;
  panDistance = 0;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  boardContainerEl.classList.add("panning");
}

function handlePanMove(event) {
  if (!isPanning) return;

  const deltaX = event.clientX - lastPointerX;
  const deltaY = event.clientY - lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  panDistance += Math.abs(deltaX) + Math.abs(deltaY);

  // Divide by the current scale — see the module-level comment above for why.
  state.boardPanX += deltaX / state.boardScale;
  state.boardPanY += deltaY / state.boardScale;

  applyTransform();
}

function handlePanEnd() {
  isPanning = false;
  boardContainerEl.classList.remove("panning");
}

function handleContextMenu(event) {
  // Suppresses the OS/browser right-click menu anywhere on the board so it
  // doesn't interrupt a right-click-drag pan.
  event.preventDefault();
}

/**
 * True if the most recent right-button gesture moved far enough to count
 * as a pan rather than a stationary right-click. dragdrop.js's token
 * deletion handler checks this so that dragging the map through a placed
 * token (with the drag starting or ending over it) doesn't also delete it.
 */
export function wasLastRightClickAPan() {
  return panDistance > PAN_DRAG_THRESHOLD;
}

function applyTransform() {
  boardZoomWrapperEl.style.transform =
    `scale(${state.boardScale}) translate(${state.boardPanX}px, ${state.boardPanY}px)`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
