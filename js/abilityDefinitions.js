/**
 * Ability type registry — the "modular" piece of the ability system.
 *
 * valorant-api.com's agent data tells us an ability's name/icon/slot but
 * not how to draw it. This module is the single place that maps an
 * (agent, slot) pair to a drawing TYPE and its type-specific defaults.
 * Adding support for a new ability is just adding an entry here — nothing
 * in abilities.js or ui.js needs to change.
 *
 * Only a handful of agents are curated below as real examples (verified
 * against the live API's slot names). Any ability not listed — including
 * every ability of every other agent — falls back to DEFAULT_DEFINITION
 * (a simple point marker), so the whole roster is still placeable even
 * though geometry is only accurate for the curated set.
 */

export const ABILITY_TYPE = {
  LINE: "line",     // directional wall/skillshot, drawn between two clicked points
  CIRCLE: "circle", // area/smoke, drawn as a fixed-radius circle at one clicked point
  POINT: "point",   // everything else (marker, teleport, drone, etc.)
};

const DEFAULT_DEFINITION = { type: ABILITY_TYPE.POINT };

/**
 * ============================================================================
 * TUNING — every magic number for circle/line geometry lives here, grouped
 * by kind, so a size/range/thickness tweak never requires touching the
 * ABILITY_DEFINITIONS map below it. All units are percent of the board's
 * width (board-abilities-layer is always square, so % of width == % of
 * height — see the note on positionLineAbility in ui.js), which keeps
 * everything map-relative and correct at any zoom level or window size —
 * unlike a raw pixel value, which would drift out of proportion to the map
 * on a different screen/window size.
 * ============================================================================
 */

// Circle (AoE) radii. A real Valorant smoke is doorway/choke-point sized,
// not a map-spanning cloud — ~3.6% diameter (1.8% radius). Non-smoke
// circles (stuns, reveals, ultimates) are legitimately much bigger in-game
// and are listed individually rather than sharing the smoke constant.
const RADIUS_PERCENT = {
  SMOKE: 1.8,           // every standard smoke/vision-block ability — see SMOKE_COLOR below
  FLASHPOINT: 5,        // Breach Ability1 — stun
  AFTERSHOCK: 4,        // Breach Grenade — small stun charge
  VIPERS_PIT: 12,       // Viper Ultimate — large deployable zone
  RECON_BOLT: 6,        // Sova Ability2 — reveal pulse
  LOCKDOWN: 9,          // Killjoy Ultimate — site-wide detain zone
};

// Per-agent smoke fill color (rgba, ~0.6 opacity so the map stays readable
// underneath), matching each agent's in-game smoke color. Only smokes get a
// color — every other circle (stuns, reveals, ultimates) keeps the default
// attacker/defender fill defined in style.css.
const SMOKE_COLOR = {
  BRIMSTONE: "rgba(200, 100, 50, 0.6)",  // orange/brownish
  OMEN: "rgba(70, 50, 120, 0.6)",        // dark purple
  ASTRA: "rgba(130, 50, 200, 0.6)",      // cosmic purple/magenta
  CLOVE: "rgba(255, 100, 200, 0.6)",     // pinkish/purple
  HARBOR: "rgba(50, 150, 200, 0.6)",     // water blue
  VIPER: "rgba(50, 200, 50, 0.6)",       // toxic green
  JETT: "rgba(200, 230, 255, 0.6)",      // cloud white/light blue
  CYPHER: "rgba(150, 150, 150, 0.6)",    // grey/white
};

// Line max range: how far the drag handle can extend from the start point.
// Calibrated relative to each other — Viper's wall is a long, nearly
// map-crossing line, while short-range walls (Breach's E) stay tight.
const MAX_RANGE_PERCENT = {
  DEFAULT: 30,          // fallback for any line ability without a curated range
  FAULT_LINE: 15,       // Breach Ability2 — short forward cone
  ROLLING_THUNDER: 35,  // Breach Ultimate — mid-range forward charge
  TOXIC_SCREEN: 85,     // Viper Ability2 — very long wall, nearly crosses the map
  PARANOIA: 45,         // Omen Ability1 — mid-long orb
  HUNTERS_FURY: 95,     // Sova Ultimate — travels almost the entire map
};

// Line thickness (rendered bar height, as % of board width). Most lines are
// thin skillshots/walls; Fault Line is the one genuinely wide path.
const THICKNESS_PERCENT = {
  DEFAULT: 0.7,   // thin wall/skillshot
  FAULT_LINE: 3,  // wide but proportionate — Breach's signature thick path
};

function circle(radiusPercent, color) {
  return { type: ABILITY_TYPE.CIRCLE, radiusPercent, ...(color ? { color } : {}) };
}

function line({ maxRangePercent = MAX_RANGE_PERCENT.DEFAULT, thicknessPercent = THICKNESS_PERCENT.DEFAULT } = {}) {
  return { type: ABILITY_TYPE.LINE, maxRangePercent, thicknessPercent };
}

/** agent displayName -> ability slot -> definition */
const ABILITY_DEFINITIONS = {
  Breach: {
    Ability1: circle(RADIUS_PERCENT.FLASHPOINT),                                                        // Flashpoint
    Ability2: line({ maxRangePercent: MAX_RANGE_PERCENT.FAULT_LINE, thicknessPercent: THICKNESS_PERCENT.FAULT_LINE }), // Fault Line
    Grenade: circle(RADIUS_PERCENT.AFTERSHOCK),                                                          // Aftershock
    Ultimate: line({ maxRangePercent: MAX_RANGE_PERCENT.ROLLING_THUNDER }),                              // Rolling Thunder
  },
  Viper: {
    Ability1: circle(RADIUS_PERCENT.SMOKE, SMOKE_COLOR.VIPER),                 // Poison Cloud
    Ability2: line({ maxRangePercent: MAX_RANGE_PERCENT.TOXIC_SCREEN }),       // Toxic Screen
    Grenade: { type: ABILITY_TYPE.POINT },                                     // Snake Bite — thrown gas grenade, icon marker only
    Ultimate: circle(RADIUS_PERCENT.VIPERS_PIT),                               // Viper's Pit
  },
  Omen: {
    Ability1: line({ maxRangePercent: MAX_RANGE_PERCENT.PARANOIA }),           // Paranoia
    Ability2: circle(RADIUS_PERCENT.SMOKE, SMOKE_COLOR.OMEN),                  // Dark Cover
    Grenade: { type: ABILITY_TYPE.POINT },                                     // Shrouded Step
    Ultimate: { type: ABILITY_TYPE.POINT },                                    // From the Shadows
  },
  Brimstone: {
    Ability2: circle(RADIUS_PERCENT.SMOKE, SMOKE_COLOR.BRIMSTONE),             // Sky Smoke
  },
  Astra: {
    Ability1: circle(RADIUS_PERCENT.SMOKE, SMOKE_COLOR.ASTRA),                 // Nebula / Dissipate
  },
  Clove: {
    Grenade: circle(RADIUS_PERCENT.SMOKE, SMOKE_COLOR.CLOVE),                  // Ruse
  },
  Harbor: {
    Ability2: circle(RADIUS_PERCENT.SMOKE, SMOKE_COLOR.HARBOR),               // Cove
  },
  Jett: {
    Grenade: circle(RADIUS_PERCENT.SMOKE, SMOKE_COLOR.JETT),                  // Cloudburst
  },
  Cypher: {
    Ability1: circle(RADIUS_PERCENT.SMOKE, SMOKE_COLOR.CYPHER),               // Cyber Cage
  },
  Sova: {
    Ability2: circle(RADIUS_PERCENT.RECON_BOLT),                               // Recon Bolt
    Ultimate: line({ maxRangePercent: MAX_RANGE_PERCENT.HUNTERS_FURY }),       // Hunter's Fury
  },
  Killjoy: {
    Ultimate: circle(RADIUS_PERCENT.LOCKDOWN),                                 // Lockdown
  },
};

export function getAbilityDefinition(agentDisplayName, slot) {
  return ABILITY_DEFINITIONS[agentDisplayName]?.[slot] ?? DEFAULT_DEFINITION;
}
