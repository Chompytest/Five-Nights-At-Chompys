// ============================================================================
// FIVE NIGHTS AT CHOMPY'S — config.js
// ASSET REGISTRY + ALL TUNING CONSTANTS. This is the only file you should
// need to touch to swap assets or change difficulty.
// ============================================================================

// ----------------------------------------------------------------------------
// ASSET REGISTRY
//
// Every external file the game can consume is declared HERE and only here.
// Each model entry:
//   url      — path to a .glb (relative to index.html). Change ONLY this
//              string when you drop in a real model. Nothing else.
//   fallback — name of the procedural placeholder builder used when the file
//              is missing/404s (see js/characters.js buildFallback and
//              js/world.js furniture builders). The game logs ONE console
//              warning per missing file and plays on. It never crashes.
//   height   — target height in meters. Loaded models are auto-scaled so
//              their bounding box matches this height, and auto-grounded so
//              their lowest point sits at y=0. Author models with the origin
//              at the feet and facing +Z; if a model faces another way, set
//              yaw (radians) to correct it.
//   tint     — used by some fallback builders for color variation only.
//
// Texture entries are plain strings (path to an image). If the image 404s, a
// procedurally generated canvas texture (js/util.js) is used instead.
// Recommended: 1024x1024 JPG, power-of-two, sRGB. See textures/README.txt.
// ----------------------------------------------------------------------------
export const ASSETS = {
  models: {
    // ---- characters (rigged ok; first animation clip auto-plays if present)
    chompy:    { url: 'models/chompy.glb',    fallback: 'blob',     height: 1.95, yaw: 0 },
    cob:       { url: 'models/cob.glb',       fallback: 'cylinder', height: 2.10, yaw: 0 },
    boo:       { url: 'models/boo.glb',       fallback: 'sphere',   height: 1.40, yaw: 0 },
    goldenCob: { url: 'models/goldencob.glb', fallback: 'cylinder', height: 1.30, yaw: 0, tint: 0xc9a53a },
    // MAYU — only ever seen when a pet check is failed. yaw: rotate her if she
    // faces away from the chair (try 3.14159 for a half turn).
    mayu:      { url: 'models/mayu.glb',      fallback: 'cylinder', height: 1.70, yaw: 0 },
    // ---- furniture / props
    couch:     { url: 'models/couch.glb',     fallback: 'box', height: 0.85 },
    armchair:  { url: 'models/armchair.glb',  fallback: 'box', height: 0.90 },
    tv:        { url: 'models/tv.glb',        fallback: 'box', height: 1.10 },
    desk:      { url: 'models/desk.glb',      fallback: 'box', height: 0.78 },
    shelf:     { url: 'models/shelf.glb',     fallback: 'box', height: 1.80 },
    fridge:    { url: 'models/fridge.glb',    fallback: 'box', height: 1.85 },
    counter:   { url: 'models/counter.glb',   fallback: 'box', height: 0.95 },
    table:     { url: 'models/table.glb',     fallback: 'box', height: 0.76 },
    chair:     { url: 'models/chair.glb',     fallback: 'box', height: 0.95 },
    car:       { url: 'models/car.glb',       fallback: 'box', height: 1.45 },
    lamp:      { url: 'models/lamp.glb',      fallback: 'box', height: 1.55 },
    microwave: { url: 'models/microwave.glb', fallback: 'box', height: 0.32 },
    swingset:  { url: 'models/swingset.glb',  fallback: 'box', height: 2.10 },
  },
  textures: {
    wall:    'textures/wall.jpg',
    floor:   'textures/floor.jpg',     // wood planks
    carpet:  'textures/carpet.jpg',
    ceiling: 'textures/ceiling.jpg',
    curtain: 'textures/curtain.jpg',
    grass:   'textures/grass.jpg',
    concrete:'textures/concrete.jpg',  // garage floor
  },
};

// ----------------------------------------------------------------------------
// TUNING — difficulty and feel. See README.md "TUNING" for what each does.
// All [a, b] pairs are random bands: a fresh value is drawn uniformly from
// the band every time the timer restarts, so nothing can be memorized.
// ----------------------------------------------------------------------------
export const TUNING = {
  NIGHT_SECONDS: 420,            // 7 real minutes = 12AM..6AM (70s per hour)

  // --- power ---
  POWER_START: 100,
  DRAIN_PASSIVE: 0.132,          // %/sec always (alone: night ends at ~44%)
  DRAIN_DOOR: 0.30,              // %/sec extra while hall door is shut
  DRAIN_CURTAIN: 0.24,           // %/sec extra while curtain is drawn
  DRAIN_TABLET: 0.22,            // %/sec extra while tablet is raised
  BLACKOUT_GRACE: [8, 14],       // sec of darkness before the scripted kill

  // --- global pacing ---
  GRACE_PERIOD: 25,              // sec at 12AM before any AI can move (night 1 gets x2)

  // --- scoring ---
  SCORE_NIGHT: 10000,            // per night cleared
  SCORE_SECOND: 10,              // per second survived this night
  SCORE_POWER: 20,               // per % power remaining at each 6AM

  // --- Golden Cob rule shape ---
  GOLDEN_STARE_KILL: 2.0,        // sec of looking at her before death
  GOLDEN_ROLL_EVERY: 12,         // sec between spawn dice rolls

  // --- feel ---
  LOOK_SENS: 0.0042,             // rad per px of drag
  YAW_LIMIT: 2.05,               // rad each way
  PITCH_LIMIT: 0.62,
  LEAN_START: 0.95,              // |yaw| where leaning begins
  INTERNAL_RES: 0.78,            // internal render scale (soft cam feel + perf)
  FEED_RES: [340, 256],          // security feed render target size
};

// ----------------------------------------------------------------------------
// PER-NIGHT AI TABLES. Bands in seconds. Night index 1..5.
//   chompy.band   — time between room advances
//   cob.band      — UNWATCHED time needed to advance (watching her room pauses it)
//   boo.band      — [min,max] real seconds between Boo's visits
//   boo.pet       — seconds you get to pet him before MAYU takes you
//   golden.p      — probability per roll (every GOLDEN_ROLL_EVERY sec) to appear
//   golden.stay   — how long she stays; if not dispelled by then, you die
//   entryWait     — pause at the doorstep before an entry attempt
// active:false    — that character sleeps that night
// ----------------------------------------------------------------------------
export const NIGHTS = {
  1: {
    label: 'NIGHT 1',
    hint: 'The hallway door has a switch. If you hear footsteps get close — use it. Watch the battery.',
    chompy: { band: [34, 52], entryWait: [3.5, 5.5] },
    cob:    { band: [30, 46], entryWait: [3.2, 5.0] },
    boo:    { active: false },
    golden: { active: false },
  },
  2: {
    label: 'NIGHT 2',
    hint: 'Something pale is in the backyard. The doorbell cam sees it. If you stop checking, it gets closer.',
    chompy: { band: [24, 40], entryWait: [3.0, 5.0] },
    cob:    { band: [20, 33], entryWait: [2.8, 4.5] },
    boo:    { band: [95, 155], pet: 7.0 },
    golden: { active: false },
  },
  3: {
    label: 'NIGHT 3',
    hint: 'If she is suddenly in the room with you: do not look at her. Raise the tablet. It hates the tablet.',
    chompy: { band: [18, 32], entryWait: [2.6, 4.2] },
    cob:    { band: [15, 26], entryWait: [2.5, 4.0] },
    boo:    { band: [80, 135], pet: 6.0 },
    golden: { p: 0.05, stay: [10, 14] },
  },
  4: {
    label: 'NIGHT 4',
    hint: 'They know the routine now. Vary yours.',
    chompy: { band: [13, 24], entryWait: [2.2, 3.6] },
    cob:    { band: [11, 20], entryWait: [2.2, 3.5] },
    boo:    { band: [68, 115], pet: 5.0 },
    golden: { p: 0.09, stay: [9, 13] },
  },
  5: {
    label: 'NIGHT 5',
    hint: 'Battery, door, curtain, tablet. Spend all four perfectly. See you at six.',
    chompy: { band: [10, 19], entryWait: [2.0, 3.2] },
    cob:    { band: [8, 16], entryWait: [2.0, 3.2] },
    boo:    { band: [58, 100], pet: 4.0 },
    golden: { p: 0.13, stay: [8, 12] },
  },
};

export const COPY = {
  TITLE: "FIVE NIGHTS AT CHOMPY'S",
  SUBTITLE: 'a home at 3 a.m.',
  PRIZE: 'TOP SCORE ON THE BOARD WINS THE PRIZE',   // edit freely (shown on title)
  STORY: 'Storm took the grid out. The house is on backup battery until sunrise.',
  GAME_ID: 'fnac',
  API_URL: '/api/scores',
  BOARD_REFRESH_MS: 10000,
};

// Debug hooks: open the game with ?debug=1 and use window.FNAC in the console.
export const DEBUG = new URLSearchParams(location.search).has('debug');
