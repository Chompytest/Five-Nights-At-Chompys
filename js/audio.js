// ============================================================================
// audio.js — fully synthesized WebAudio. No audio files anywhere.
// Silence is the default state; every sound emitted is information:
//   footsteps  = Chompy advanced (position tells you which room)
//   husk       = Cob advanced
//   giggle     = Boo advanced a stage (window side)
//   staticPop  = Golden Cob materialized / dispelled
//   thump      = a door saved you
//   scratch    = Boo is AT the window
//   heartbeat  = proximity gauge (interval + volume scale with threat)
// ============================================================================
import { clamp, lerp, rand } from './util.js';

let ctx = null, master = null, comp = null;
let heartbeatTimer = 0, heartbeatInterval = 1.6, threatLevel = 0;
let droneNodes = null, humNodes = null, blackoutMuted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 8;
  master = ctx.createGain(); master.gain.value = 0.9;
  master.connect(comp); comp.connect(ctx.destination);
  startRoomTone();
}
export function audioReady() { return !!ctx; }
export function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

// power blackout: everything but heartbeat/footsteps dies
export function setBlackout(on) {
  blackoutMuted = on;
  if (humNodes) humNodes.gain.gain.setTargetAtTime(on ? 0 : 0.014, ctx.currentTime, 0.2);
}

// ---------------------------------------------------------------------------
// listener follows the player's head
// ---------------------------------------------------------------------------
export function updateListener(cam) {
  if (!ctx) return;
  const l = ctx.listener;
  const p = cam.position;
  const fwd = { x: 0, y: 0, z: -1 };
  const dir = cam.getWorldDirection(_dirTmp);
  if (l.positionX) {
    const t = ctx.currentTime;
    l.positionX.setTargetAtTime(p.x, t, 0.05);
    l.positionY.setTargetAtTime(p.y, t, 0.05);
    l.positionZ.setTargetAtTime(p.z, t, 0.05);
    l.forwardX.setTargetAtTime(dir.x, t, 0.05);
    l.forwardY.setTargetAtTime(dir.y, t, 0.05);
    l.forwardZ.setTargetAtTime(dir.z, t, 0.05);
    l.upX.setTargetAtTime(0, t, 0.05); l.upY.setTargetAtTime(1, t, 0.05); l.upZ.setTargetAtTime(0, t, 0.05);
  } else if (l.setPosition) { // Safari fallback
    l.setPosition(p.x, p.y, p.z);
    l.setOrientation(dir.x, dir.y, dir.z, 0, 1, 0);
  }
}
import * as THREE from 'three';
const _dirTmp = new THREE.Vector3();

// ---------------------------------------------------------------------------
// plumbing
// ---------------------------------------------------------------------------
function out(pos, gainVal = 1) {
  // returns [inputNode, cleanupIn(t)] — positional if pos given
  const g = ctx.createGain(); g.gain.value = gainVal;
  if (pos) {
    const pan = new PannerNode(ctx, {
      panningModel: 'HRTF', distanceModel: 'inverse',
      refDistance: 1.4, maxDistance: 40, rolloffFactor: 1.35,
      positionX: pos.x, positionY: pos.y ?? 1.2, positionZ: pos.z,
    });
    g.connect(pan); pan.connect(master);
  } else {
    g.connect(master);
  }
  return g;
}

function noiseBuffer(seconds = 1) {
  const len = Math.max(1, (ctx.sampleRate * seconds) | 0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function envGain(node, t0, a, peak, dec, end = 0.0001) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.linearRampToValueAtTime(peak, t0 + a);
  node.gain.exponentialRampToValueAtTime(end, t0 + a + dec);
}

// ---------------------------------------------------------------------------
// room tone: barely-there hum + occasional distant creak. Silence-adjacent.
// ---------------------------------------------------------------------------
function startRoomTone() {
  const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 58;
  const hum2 = ctx.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 117;
  const g = ctx.createGain(); g.gain.value = 0.014;
  const g2 = ctx.createGain(); g2.gain.value = 0.3;
  hum.connect(g); hum2.connect(g2); g2.connect(g); g.connect(master);
  hum.start(); hum2.start();
  humNodes = { gain: g };
}

export function creak(pos) { // house settling — deliberately unlike any tell
  if (!ctx || blackoutMuted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(rand(80, 130), t);
  o.frequency.linearRampToValueAtTime(rand(50, 90), t + rand(0.5, 1.1));
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rand(180, 300); f.Q.value = 9;
  const g = out(pos, 1);
  envGain(g, t, 0.3, 0.05, 1.0);
  o.connect(f); f.connect(g);
  o.start(t); o.stop(t + 1.6);
}

// ---------------------------------------------------------------------------
// character tells
// ---------------------------------------------------------------------------
export function footsteps(pos, count = 3, heavy = 1) { // CHOMPY
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (let i = 0; i < count; i++) {
    const t = t0 + i * rand(0.42, 0.5);
    const th = ctx.createOscillator(); th.type = 'sine';
    th.frequency.setValueAtTime(60 * heavy, t);
    th.frequency.exponentialRampToValueAtTime(34, t + 0.18);
    const g = out(pos, 1);
    envGain(g, t, 0.005, 0.5 * heavy, 0.22);
    th.connect(g); th.start(t); th.stop(t + 0.3);
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.12);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
    const g2 = out(pos, 1);
    envGain(g2, t, 0.002, 0.22 * heavy, 0.1);
    src.connect(f); f.connect(g2); src.start(t);
  }
}

export function husk(pos) { // COB — dry corn-husk rustle
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(1);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8;
  const g = out(pos, 1);
  // crinkly amplitude jitter
  g.gain.setValueAtTime(0.0001, t);
  let tt = t;
  for (let i = 0; i < 14; i++) {
    tt += rand(0.02, 0.07);
    g.gain.linearRampToValueAtTime(rand(0.04, 0.30), tt);
  }
  g.gain.linearRampToValueAtTime(0.0001, tt + 0.1);
  src.connect(f); f.connect(g); src.start(t); src.stop(tt + 0.2);
}

export function giggle(pos, loud = 1) { // BOO — synthetic child giggle
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const notes = 4 + (Math.random() * 3 | 0);
  let f0 = rand(700, 880);
  for (let i = 0; i < notes; i++) {
    const t = t0 + i * rand(0.09, 0.13);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * rand(0.82, 0.92), t + 0.09);
    const vib = ctx.createOscillator(); vib.frequency.value = 28;
    const vg = ctx.createGain(); vg.gain.value = 22;
    vib.connect(vg); vg.connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.4;
    const g = out(pos, 1);
    envGain(g, t, 0.012, 0.16 * loud, 0.1);
    o.connect(bp); bp.connect(g);
    o.start(t); o.stop(t + 0.18); vib.start(t); vib.stop(t + 0.18);
    f0 *= rand(0.88, 0.97);
  }
}

export function staticPop(pos, dur = 0.3, vol = 0.5) { // GOLDEN COB
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur + 0.05);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
  const g = out(pos, 1);
  g.gain.setValueAtTime(vol, t);
  // crackle gaps
  for (let i = 0; i < 6; i++) {
    const tt = t + Math.random() * dur;
    g.gain.setValueAtTime(rand(0, vol), tt);
  }
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); src.start(t); src.stop(t + dur);
}

export function goldenDrone(on, pos) { // sustained wrongness while she's present
  if (!ctx) return;
  if (on && !droneNodes) {
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 41;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 41.7;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 130;
    const g = out(pos, 1);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1.2);
    o1.connect(f); o2.connect(f); f.connect(g);
    o1.start(); o2.start();
    droneNodes = { o1, o2, g };
  } else if (!on && droneNodes) {
    const { o1, o2, g } = droneNodes; droneNodes = null;
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    o1.stop(ctx.currentTime + 0.4); o2.stop(ctx.currentTime + 0.4);
  }
}

// ---------------------------------------------------------------------------
// interaction / event sounds
// ---------------------------------------------------------------------------
export function doorServo(closing, pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.3);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(closing ? 500 : 260, t);
  f.frequency.linearRampToValueAtTime(closing ? 240 : 520, t + 0.22);
  const g = out(pos, 1); envGain(g, t, 0.01, 0.28, 0.24);
  src.connect(f); f.connect(g); src.start(t);
  // clunk at the end
  const th = ctx.createOscillator(); th.type = 'sine';
  th.frequency.setValueAtTime(90, t + 0.22); th.frequency.exponentialRampToValueAtTime(45, t + 0.34);
  const g2 = out(pos, 1); envGain(g2, t + 0.22, 0.004, 0.5, 0.14);
  th.connect(g2); th.start(t + 0.22); th.stop(t + 0.45);
}

export function curtainSwish(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.4);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.5;
  const g = out(pos, 1); envGain(g, t, 0.06, 0.16, 0.28);
  src.connect(f); f.connect(g); src.start(t);
}

export function tabletBeep(up) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(up ? 880 : 1200, t);
  o.frequency.setValueAtTime(up ? 1318 : 660, t + 0.06);
  const g = out(null, 1); envGain(g, t, 0.004, 0.05, 0.09);
  o.connect(g); o.start(t); o.stop(t + 0.14);
  staticHiss(0.12, 0.05);
}

export function camSwitchBlip() {
  if (!ctx) return;
  staticHiss(0.09, 0.09);
}

function staticHiss(dur, vol) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur + 0.02);
  const g = out(null, 1); envGain(g, t, 0.004, vol, dur);
  src.connect(g); src.start(t);
}

export function doorThump(pos, times = 2) { // blocked entry — a door SAVED you
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const t = t0 + i * 0.34;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(52, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.2);
    const g = out(pos, 1); envGain(g, t, 0.003, 0.9, 0.26);
    o.connect(g); o.start(t); o.stop(t + 0.32);
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.1);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g2 = out(pos, 1); envGain(g2, t, 0.002, 0.35, 0.09);
    src.connect(f); f.connect(g2); src.start(t);
  }
}

export function windowScratch(pos) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const t = t0 + i * rand(0.25, 0.4);
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.24);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(2600, t); f.frequency.linearRampToValueAtTime(4200, t + 0.2);
    const g = out(pos, 1); envGain(g, t, 0.03, 0.12, 0.16);
    src.connect(f); f.connect(g); src.start(t);
  }
}

export function glassTap(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1250;
  const g = out(pos, 1); envGain(g, t, 0.002, 0.2, 0.12);
  o.connect(g); o.start(t); o.stop(t + 0.15);
}

export function powerDown() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 1.3);
  const g = out(null, 1); envGain(g, t, 0.01, 0.4, 1.25);
  o.connect(g); o.start(t); o.stop(t + 1.5);
}

export function scream() { // jumpscare sting — loud, ugly, brief
  if (!ctx) return;
  resumeAudio();
  const t = ctx.currentTime;
  const dur = 1.0;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 128 - 1; curve[i] = Math.tanh(v * 6); }
  shaper.curve = curve;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t);
  g.gain.setValueAtTime(0.9, t + dur - 0.15);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  shaper.connect(g); g.connect(master);
  for (let v = 0; v < 3; v++) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const base = [720, 990, 1430][v] * rand(0.96, 1.04);
    o.frequency.setValueAtTime(base, t);
    // fast random pitch writhing
    for (let i = 1; i < 14; i++) o.frequency.linearRampToValueAtTime(base * rand(0.7, 1.35), t + i * (dur / 14));
    const og = ctx.createGain(); og.gain.value = 0.33;
    o.connect(og); og.connect(shaper);
    o.start(t); o.stop(t + dur);
  }
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 500;
  const ng = ctx.createGain(); ng.gain.value = 0.5;
  src.connect(f); f.connect(ng); ng.connect(shaper); src.start(t);
  const sub = ctx.createOscillator(); sub.type = 'sine';
  sub.frequency.setValueAtTime(70, t); sub.frequency.exponentialRampToValueAtTime(26, t + 0.5);
  const sg = ctx.createGain(); sg.gain.setValueAtTime(0.9, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  sub.connect(sg); sg.connect(master); sub.start(t); sub.stop(t + 0.7);
}

export function chime6AM() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C — dawn
  notes.forEach((f0, i) => {
    const t = t0 + i * 0.42;
    [1, 2.76, 5.4].forEach((mult, p) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * mult;
      const g = out(null, 1);
      envGain(g, t, 0.005, [0.22, 0.06, 0.02][p], 1.4);
      o.connect(g); o.start(t); o.stop(t + 1.6);
    });
  });
}

// ---------------------------------------------------------------------------
// heartbeat — the proximity gauge. threat 0..1 sets rate + volume.
// ---------------------------------------------------------------------------
export function setThreat(v) { threatLevel = clamp(v, 0, 1); }

export function tickAudio(dt) {
  if (!ctx || ctx.state !== 'running') return;
  heartbeatInterval = lerp(1.7, 0.45, threatLevel);
  heartbeatTimer -= dt;
  if (threatLevel > 0.12 && heartbeatTimer <= 0) {
    heartbeatTimer = heartbeatInterval;
    const vol = lerp(0.05, 0.5, threatLevel);
    const t = ctx.currentTime;
    [[0, 1], [0.14, 0.72]].forEach(([off, mul]) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(52, t + off);
      o.frequency.exponentialRampToValueAtTime(30, t + off + 0.1);
      const g = out(null, 1); envGain(g, t + off, 0.004, vol * mul, 0.13);
      o.connect(g); o.start(t + off); o.stop(t + off + 0.2);
    });
  }
}
