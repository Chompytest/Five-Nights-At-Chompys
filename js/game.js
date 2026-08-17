// ============================================================================
// game.js — state machine, power, clock, score, night flow.
// States: title → intro → playing → (dying → death | clear) → … → victory
// ============================================================================
import { TUNING, NIGHTS, DEBUG } from './config.js';
import { clamp, band, rand } from './util.js';
import * as SFX from './audio.js';

export function createGame(ui) {
  const S = {
    state: 'title',
    night: 1,
    time: 0,                 // seconds into the night
    power: TUNING.POWER_START,
    doorClosed: false,
    curtainClosed: false,
    tabletUp: false,
    blackout: false,
    blackoutT: 0,
    blackoutStepsT: 0,
    paused: false,
    timescale: 1,
    // run scoring
    nightsCleared: 0,
    powerBonusPts: 0,
    runFinalized: false,
    playerName: '',
    // wiring (set by main.js)
    ai: null,
    onKill: null,            // (charKey) => void — starts jumpscare presentation
    introTimer: 0,
    threatSmooth: 0,
  };

  // --------------------------------------------------------------------------
  // scoring
  // --------------------------------------------------------------------------
  S.currentScore = () =>
    S.nightsCleared * TUNING.SCORE_NIGHT +
    Math.floor(S.time) * TUNING.SCORE_SECOND +
    S.powerBonusPts;

  // --------------------------------------------------------------------------
  // run / night flow
  // --------------------------------------------------------------------------
  // EVERY path that starts play goes through startRun — the PLAY button, the
  // RETRY button, debug jumps. This is the single place the "score already
  // submitted" flag is reset, so no path can silently lose a score.
  S.startRun = function ({ night = 1, keepProgress = false } = {}) {
    S.runFinalized = false;                       // <-- the hard-won flag reset
    ui.resetSubmitState();
    if (!keepProgress) { S.nightsCleared = 0; S.powerBonusPts = 0; }
    S.night = night;
    S.startNight();
  };

  S.startNight = function () {
    S.time = 0;
    S.power = TUNING.POWER_START;
    S.doorClosed = false; S.curtainClosed = false; S.tabletUp = false;
    S.blackout = false; S.blackoutT = 0;
    S.threatSmooth = 0;
    SFX.setBlackout(false);
    S.ai.reset(S.night);
    S.state = 'intro';
    S.introTimer = 4.2;
    ui.showIntro(S.night, NIGHTS[S.night]);
  };

  S.clockText = function () {
    const hours = ['12', '1', '2', '3', '4', '5', '6'];
    const h = Math.min(6, Math.floor(S.time / (TUNING.NIGHT_SECONDS / 6)));
    const frac = (S.time % (TUNING.NIGHT_SECONDS / 6)) / (TUNING.NIGHT_SECONDS / 6);
    const m = Math.floor(frac * 60);
    return `${hours[h]}:${String(m).padStart(2, '0')} AM`;
  };

  // --------------------------------------------------------------------------
  // device toggles (called from input)
  // --------------------------------------------------------------------------
  S.toggleDoor = function () {
    if (S.state !== 'playing' || S.blackout) return;
    S.doorClosed = !S.doorClosed;
    SFX.doorServo(S.doorClosed, { x: -2.2, y: 1.2, z: 0 });
  };
  S.toggleCurtain = function () {
    if (S.state !== 'playing' || S.blackout) return;
    S.curtainClosed = !S.curtainClosed;
    SFX.curtainSwish({ x: 2.1, y: 1.5, z: 0.5 });
  };
  S.toggleTablet = function () {
    if (S.state !== 'playing' || S.blackout) return;
    S.tabletUp = !S.tabletUp;
    SFX.tabletBeep(S.tabletUp);
  };

  // --------------------------------------------------------------------------
  // deaths + clears
  // --------------------------------------------------------------------------
  S.triggerKill = function (charKey) {
    if (S.state !== 'playing') return;
    S.state = 'dying';
    S.tabletUp = false;
    SFX.goldenDrone(false);
    if (S.onKill) S.onKill(charKey);
  };

  S.finishDeath = function (charKey) {
    S.state = 'death';
    const score = S.currentScore();
    S.finalizeRun(score);
    ui.showDeath({
      night: S.night, clock: S.clockText(), score, by: charKey,
      canRetry: true,
    });
  };

  S.nightCleared = function () {
    S.state = 'clear';
    const powerPts = Math.round(S.power) * TUNING.SCORE_POWER;
    S.powerBonusPts += powerPts;
    S.nightsCleared += 1;
    S.time = 0;
    S.doorClosed = false; S.curtainClosed = false; S.tabletUp = false;
    SFX.chime6AM();
    const score = S.currentScore();
    if (S.night >= 5) {
      S.finalizeRun(score);
      ui.showVictory({ score, powerPts });
      S.state = 'victory';
    } else {
      ui.showClear({ night: S.night, powerPts, score, powerLeft: Math.round(S.power) });
      // ui advances to next night via S.advanceNight() after its card
    }
  };

  S.advanceNight = function () {
    S.night = Math.min(5, S.night + 1);
    S.startNight();
  };

  // Score is queued HERE and only marked submitted when the server confirms
  // (that part lives in ui.js / leaderboard.js).
  S.finalizeRun = function (score) {
    if (S.runFinalized) return;
    S.runFinalized = true;
    ui.submitScore(S.playerName, score);
  };

  // --------------------------------------------------------------------------
  // main tick
  // --------------------------------------------------------------------------
  S.tick = function (rawDt) {
    const dt = Math.min(0.1, rawDt) * S.timescale;
    if (S.paused) return;

    if (S.state === 'intro') {
      S.introTimer -= dt;
      if (S.introTimer <= 0) { S.state = 'playing'; ui.hideCards(); }
      return;
    }
    if (S.state !== 'playing') return;

    S.time += dt;

    // ---- power ----
    if (!S.blackout) {
      let drain = TUNING.DRAIN_PASSIVE;
      if (S.doorClosed) drain += TUNING.DRAIN_DOOR;
      if (S.curtainClosed) drain += TUNING.DRAIN_CURTAIN;
      if (S.tabletUp) drain += TUNING.DRAIN_TABLET;
      S.power = Math.max(0, S.power - drain * dt);
      if (S.power <= 0) S.startBlackout();
    } else {
      S.blackoutT -= dt;
      S.blackoutStepsT -= dt;
      if (S.blackoutStepsT <= 0 && S.blackoutT > 1.5) {
        S.blackoutStepsT = rand(2.2, 3.6);
        SFX.footsteps({ x: -2.6, y: 0, z: 0 }, 2, 1.2); // something in the dark
      }
      if (S.blackoutT <= 0) { S.triggerKill('chompy'); return; }
    }

    // ---- 6AM check (survives blackout too — the classic mercy) ----
    if (S.time >= TUNING.NIGHT_SECONDS) { S.nightCleared(); return; }

    // ---- AI ----
    if (!S.blackout) S.ai.tick(dt);

    // ---- threat → heartbeat ----
    const target = S.ai.threat();
    S.threatSmooth += (target - S.threatSmooth) * Math.min(1, dt * 1.5);
    SFX.setThreat(S.threatSmooth);
  };

  S.startBlackout = function () {
    S.blackout = true;
    S.blackoutT = band(TUNING.BLACKOUT_GRACE);
    S.blackoutStepsT = 1.6;
    S.doorClosed = false;     // the door needs power
    S.curtainClosed = false;
    S.tabletUp = false;
    if (S.ai.golden.present) S.ai.dispelGolden(false);
    if (S.ai.blackoutStage) S.ai.blackoutStage();
    SFX.powerDown();
    SFX.setBlackout(true);
  };

  // --------------------------------------------------------------------------
  // debug hooks (?debug=1)
  // --------------------------------------------------------------------------
  if (DEBUG) {
    window.FNAC = {
      S,
      time: (sec) => { S.time = sec; },
      power: (v) => { S.power = v; },
      timescale: (x) => { S.timescale = x; },
      night: (n) => { S.startRun({ night: n }); },
      golden: () => S.ai.spawnGolden(),
      kill: (k = 'chompy') => S.triggerKill(k),
      state: () => ({ state: S.state, night: S.night, time: S.time.toFixed(1), power: S.power.toFixed(1), score: S.currentScore(), chompy: S.ai.chompy, cob: S.ai.cob, boo: S.ai.boo, golden: S.ai.golden }),
    };
    console.info('[FNAC] debug hooks: window.FNAC — .time(s) .power(v) .timescale(x) .night(n) .golden() .kill(key) .state()');
  }

  return S;
}
