/**
 * Single in-memory source of truth for the app. Plain object rather than a
 * framework store — small enough for now, easy to swap out later if the
 * app grows (e.g. into a pub/sub store once the board needs reactivity).
 */
export const state = {
  agents: [],
  maps: [],
  selectedMap: null,

  // "attacker" | "defender" — which side new agents are placed as.
  selectedSide: "attacker",

  // Current board zoom factor and pan offset (in wrapper-local px), owned by zoom.js.
  boardScale: 1,
  boardPanX: 0,
  boardPanY: 0,

  // Tokens currently placed on the board. Each entry:
  // { id: string, agentUuid: string, xPercent: number, yPercent: number, side: "attacker" | "defender" }
  placedAgents: [],

  // id of the placed-agent token currently selected (its ability menu is
  // showing in the side panel). Owned by abilities.js.
  selectedTokenId: null,

  // The ability "armed" for placement, or null when no tool is active.
  // { tokenId, agentUuid, ability, definition, side } — set when the user
  // clicks an ability icon in the menu, cleared once placed/cancelled.
  activeAbilityTool: null,

  // Placed ability shapes. Each entry:
  // { id, tokenId, agentUuid, slot, type: "line" | "circle" | "point", side,
  //   start: { xPercent, yPercent },
  //   end?: { xPercent, yPercent },       // line only
  //   diameterPercent?: number }          // circle only
  placedAbilities: [],

  // Future state slots:
  // savedStrategies: [],// persisted board layouts
};
