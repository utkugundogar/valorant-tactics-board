/**
 * Shared screen-to-map coordinate conversion. Used by both dragdrop.js
 * (placing/moving agent tokens) and abilities.js (placing/moving
 * abilities), so it lives in one place instead of being duplicated.
 *
 * Deliberately measured against #board-zoom-wrapper, not #board-container:
 * getBoundingClientRect() already reflects the wrapper's current CSS
 * transform (pan + scale, owned by zoom.js), so this produces the correct
 * map-relative percentage at any zoom/pan state with no manual transform
 * math needed here.
 */
export function getBoardPercentPosition(clientX, clientY) {
  const wrapperEl = document.getElementById("board-zoom-wrapper");
  const rect = wrapperEl.getBoundingClientRect();

  const xPercent = ((clientX - rect.left) / rect.width) * 100;
  const yPercent = ((clientY - rect.top) / rect.height) * 100;

  return {
    xPercent: clamp(xPercent, 0, 100),
    yPercent: clamp(yPercent, 0, 100),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
