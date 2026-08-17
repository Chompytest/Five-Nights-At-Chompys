// ============================================================================
// ai.js — four killers, four RULES (not four skins):
//   CHOMPY     pure timer pressure — walks room-by-room to the hall door;
//              only a closed door stops him. Punishes slow door reactions.
//   COB        moves ONLY while her room is not on the raised tablet.
//              Watching freezes her. Punishes ignoring the cameras.
//   BOO        advances whenever the doorbell cam hasn't been checked lately.
//              Neglect moves her; she comes to the WINDOW. Punishes tunnel
//              vision on the interior.
//   GOLDEN COB materializes in the den. Raising the tablet dispels her;
//              staring kills; waiting kills slower. Punishes trusting the
//              tool the other three teach you to rely on.
// Every timer draws from a per-night random band — distributions, not scripts.
// ============================================================================
import { TUNING, NIGHTS } from './config.js';
import { band, rand, clamp } from './util.js';
import { ROOMS } from './world.js';
import { placeInRoom, hideChar } from './characters.js';
import * as SFX from './audio.js';

const CHOMPY_PATH = ['garage', 'kitchen', 'living', 'hallway', 'doorstep'];
const COB_PATH = ['kitchen', 'living', 'hallway', 'doorstep'];
const BOO_STAGES = ['byFar', 'byNear', 'window'];

export function createAI(chars, S, hooks) {
  // hooks: { kill(key), watchedCamId() -> cam id or null, lookingAtGolden() -> bool }
  const A = {};

  A.reset = function (night) {
    A.cfg = NIGHTS[night];
    A.grace = TUNING.GRACE_PERIOD * (night === 1 ? 2 : 1);
    A.chompy = { idx: 0, timer: band(A.cfg.chompy.band), atDoor: false, entry: 0 };
    A.cob = { idx: 0, unwatched: 0, threshold: band(A.cfg.cob.band), atDoor: false, entry: 0, frozen: false };
    A.boo = { stage: -1, neglect: 0, threshold: A.cfg.boo.active === false ? Infinity : band(A.cfg.boo.neglect), grace: 0, repel: 0, scratchT: 0 };
    A.golden = { present: false, roll: TUNING.GOLDEN_ROLL_EVERY, stay: 0, stare: 0 };
    placeInRoom(chars.chompy, 'garage', ROOMS.kitchen.anchor);
    placeInRoom(chars.cob, 'kitchen', ROOMS.living.anchor);
    hideChar(chars.boo);
    hideChar(chars.goldenCob);
    SFX.goldenDrone(false);
  };

  // ---- CHOMPY -------------------------------------------------------------
  function tickChompy(dt) {
    const c = A.chompy, cfg = A.cfg.chompy;
    if (cfg.active === false) return;
    if (!c.atDoor) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.idx = Math.min(c.idx + 1, CHOMPY_PATH.length - 1);
        const room = CHOMPY_PATH[c.idx];
        const next = CHOMPY_PATH[Math.min(c.idx + 1, CHOMPY_PATH.length - 1)];
        placeInRoom(chars.chompy, room, ROOMS[next].anchor);
        SFX.footsteps(ROOMS[room].anchor, 3 + (c.idx > 2 ? 1 : 0), 1);
        if (room === 'doorstep') { c.atDoor = true; c.entry = band(cfg.entryWait); }
        else c.timer = band(cfg.band);
      }
    } else {
      c.entry -= dt;
      if (c.entry <= 0) {
        if (S.doorClosed) {
          SFX.doorThump(ROOMS.doorstep.anchor, 2);
          const back = (Math.random() * 3) | 0; // retreat to garage/kitchen/living
          c.idx = back; c.atDoor = false; c.timer = band(cfg.band) * 1.15;
          placeInRoom(chars.chompy, CHOMPY_PATH[back], ROOMS[CHOMPY_PATH[back + 1]].anchor);
          SFX.footsteps(ROOMS[CHOMPY_PATH[back]].anchor, 2, 0.7);
        } else {
          hooks.kill('chompy');
        }
      }
    }
  }

  // ---- COB ----------------------------------------------------------------
  function tickCob(dt) {
    const c = A.cob, cfg = A.cfg.cob;
    if (cfg.active === false) return;
    const room = c.atDoor ? 'doorstep' : COB_PATH[c.idx];
    const watched = hooks.watchedCamId() === ROOMS[room].cam && ROOMS[room].cam !== null;
    c.frozen = watched;
    if (watched) return; // frozen mid-stride
    if (!c.atDoor) {
      c.unwatched += dt;
      if (c.unwatched >= c.threshold) {
        c.idx = Math.min(c.idx + 1, COB_PATH.length - 1);
        const r = COB_PATH[c.idx];
        const next = COB_PATH[Math.min(c.idx + 1, COB_PATH.length - 1)];
        placeInRoom(chars.cob, r, ROOMS[next].anchor);
        SFX.husk(ROOMS[r].anchor);
        c.unwatched = 0; c.threshold = band(cfg.band);
        if (r === 'doorstep') { c.atDoor = true; c.entry = band(cfg.entryWait); }
      }
    } else {
      c.entry -= dt;
      if (c.entry <= 0) {
        if (S.doorClosed) {
          SFX.doorThump(ROOMS.doorstep.anchor, 1);
          SFX.husk(ROOMS.hallway.anchor);
          c.idx = Math.max(0, c.idx - (1 + ((Math.random() * 2) | 0)));
          c.atDoor = false; c.unwatched = 0; c.threshold = band(cfg.band) * 1.1;
          placeInRoom(chars.cob, COB_PATH[c.idx], ROOMS[COB_PATH[Math.min(c.idx + 1, COB_PATH.length - 1)]].anchor);
        } else {
          hooks.kill('cob');
        }
      }
    }
  }

  // ---- BOO ----------------------------------------------------------------
  function tickBoo(dt) {
    const b = A.boo, cfg = A.cfg.boo;
    if (cfg.active === false) return;
    const checked = hooks.watchedCamId() === 'backyard';
    if (b.stage < 2) {
      if (checked) b.neglect = 0;         // checking her resets the clock
      else b.neglect += dt;
      if (b.neglect >= b.threshold) {
        b.stage = Math.min(b.stage + 1, 2);
        b.neglect = 0; b.threshold = band(cfg.neglect);
        const stageRoom = BOO_STAGES[b.stage];
        placeInRoom(chars.boo, stageRoom, ROOMS.window.anchor);
        SFX.giggle(ROOMS[stageRoom].anchor, 0.7 + b.stage * 0.3);
        if (b.stage === 2) {
          // AT THE WINDOW — face the glass
          chars.boo.group.lookAt(2.2, 1.1, 0);
          b.grace = band(cfg.grace); b.repel = 0; b.scratchT = 0.6;
        }
      }
    } else {
      // at the window: doorbell cam can't see her anymore
      b.scratchT -= dt;
      if (b.scratchT <= 0) { SFX.windowScratch(ROOMS.window.anchor); b.scratchT = rand(1.8, 3.2); }
      if (S.curtainClosed) {
        b.repel += dt;
        if (b.repel >= 3.5) {             // curtain held: she loses interest
          SFX.glassTap(ROOMS.window.anchor);
          SFX.giggle(ROOMS.byFar.anchor, 0.5);
          b.stage = -1; b.neglect = 0; b.threshold = band(cfg.neglect);
          hideChar(chars.boo);
        }
      } else {
        b.repel = 0;
        b.grace -= dt;
        if (b.grace <= 0) hooks.kill('boo');
      }
    }
  }

  // ---- GOLDEN COB ---------------------------------------------------------
  function tickGolden(dt) {
    const g = A.golden, cfg = A.cfg.golden;
    if (!g.present) {
      if (cfg.active === false) return;   // spawn roll is night-gated…
      g.roll -= dt;
      if (g.roll <= 0) {
        g.roll = TUNING.GOLDEN_ROLL_EVERY;
        if (!S.tabletUp && Math.random() < cfg.p) A.spawnGolden();
      }
    } else {                              // …but a present Golden always ticks
      if (S.tabletUp) {                    // the tablet dispels her
        A.dispelGolden(true);
        return;
      }
      g.stay -= dt;
      if (hooks.lookingAtGolden()) {
        g.stare += dt;
        if (g.stare >= TUNING.GOLDEN_STARE_KILL) { hooks.kill('goldenCob'); return; }
      }
      if (g.stay <= 0) { hooks.kill('goldenCob'); return; }
    }
  }

  A.spawnGolden = function () {
    const g = A.golden;
    g.present = true; g.stay = band(A.cfg.golden.stay || [10, 14]); g.stare = 0;
    placeInRoom(chars.goldenCob, 'den', null);
    chars.goldenCob.group.position.set(ROOMS.den.anchor.x, ROOMS.den.anchor.y, ROOMS.den.anchor.z);
    chars.goldenCob.group.lookAt(0, 0.9, 0.9); // faces the player's seat
    SFX.staticPop(ROOMS.den.anchor, 0.4, 0.7);
    SFX.goldenDrone(true, ROOMS.den.anchor);
  };

  A.dispelGolden = function (sound) {
    A.golden.present = false; A.golden.stare = 0;
    hideChar(chars.goldenCob);
    SFX.goldenDrone(false);
    if (sound) SFX.staticPop(ROOMS.den.anchor, 0.25, 0.4);
  };

  // ---- threat level for the heartbeat / vignette --------------------------
  A.threat = function () {
    let t = 0;
    t = Math.max(t, [0.06, 0.16, 0.3, 0.55, 0.85][A.chompy.idx] || 0);
    t = Math.max(t, (A.cob.atDoor ? 0.8 : [0.05, 0.14, 0.45][A.cob.idx] || 0));
    if (A.boo.stage === 1) t = Math.max(t, 0.35);
    if (A.boo.stage === 2) t = Math.max(t, 0.9);
    if (A.golden.present) t = Math.max(t, 0.92);
    if (S.blackout) t = 1;
    return t;
  };

  // called on blackout: he steps into the dark hallway doorway, eyes glowing
  A.blackoutStage = function () {
    placeInRoom(chars.chompy, 'doorstep', ROOMS.den.anchor);
    A.chompy.idx = CHOMPY_PATH.length - 1; A.chompy.atDoor = true; A.chompy.entry = 9999;
  };

  A.tick = function (dt) {
    if (A.grace > 0) { A.grace -= dt; return; }
    tickChompy(dt);
    tickCob(dt);
    tickBoo(dt);
    tickGolden(dt);
  };

  return A;
}
